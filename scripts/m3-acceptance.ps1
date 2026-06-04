# M3 E2E acceptance (PowerShell). Requires API + worker + Docker + API keys in apps/api/.env
# Usage: .\scripts\m3-acceptance.ps1 [-BaseUrl 'http://127.0.0.1:3000'] [-SkipLlm]

param(
  [string]$BaseUrl = 'http://127.0.0.1:3000',
  [switch]$SkipLlm
)

$ErrorActionPreference = 'Stop'
$V1 = "$BaseUrl/v1"
$passed = 0
$failed = 0

function Assert-True([bool]$cond, [string]$name) {
  if ($cond) {
    Write-Host "[PASS] $name" -ForegroundColor Green
    $script:passed++
  } else {
    Write-Host "[FAIL] $name" -ForegroundColor Red
    $script:failed++
  }
}

function Invoke-Api {
  param(
    [string]$Method = 'GET',
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = $null,
    [switch]$ExpectError
  )
  $uri = if ($Path.StartsWith('http')) { $Path } else { "$V1$Path" }
  $headers = @{ Accept = 'application/json' }
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $params = @{
    Uri         = $uri
    Method      = $Method
    Headers     = $headers
    ContentType = 'application/json'
  }
  if ($null -ne $Body) {
    $params['Body'] = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    if ($ExpectError) {
      if ($_.ErrorDetails.Message) {
        try { return $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
      }
    }
    throw
  }
}

function Wait-AiTask([string]$TaskId, [string]$Token, [int]$TimeoutSec = 120) {
  $status = 'QUEUED'
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $last = $null
  while ((Get-Date) -lt $deadline) {
    $last = Invoke-Api -Path "/ai/tasks/$TaskId" -Token $Token
    $status = $last.status
    if ($status -eq 'DONE' -or $status -eq 'FAILED') { break }
    Start-Sleep -Seconds 2
  }
  return @{ status = $status; result = $last }
}

Write-Host ""
Write-Host "=== M3 Acceptance @ $BaseUrl ===" -ForegroundColor Cyan
Write-Host ""

$h = Invoke-Api -Path '/health'
Assert-True ($h.ok -eq $true) 'GET /v1/health'

$suffix = (Get-Date -Format 'HHmmss') + (Get-Random -Maximum 9999)
$phone = "139$suffix".Substring(0, 11)
$password = 'TestPass1'
$reg = Invoke-Api -Method POST -Path '/auth/register' -Body @{ phone = $phone; password = $password }
$access = $reg.tokens.accessToken

$profileBody = @{
  gender        = 'MALE'
  birthDate     = '1990-06-15T00:00:00.000Z'
  heightCm      = 175
  weightKg      = 72.5
  trainingYears = 3
  goal          = 'MUSCLE_GAIN'
}
Invoke-Api -Method PUT -Path '/users/me/profile' -Body $profileBody -Token $access | Out-Null
$summary = Invoke-Api -Path '/meal-logs/daily-summary' -Token $access
Assert-True ($null -ne $summary.targetKcal -and $summary.targetKcal -gt 0) 'GET /meal-logs/daily-summary'

if ($SkipLlm) {
  Write-Host "[SKIP] LLM tasks (-SkipLlm)" -ForegroundColor Yellow
} else {
  $planTask = Invoke-Api -Method POST -Path '/ai/tasks' -Body @{
    taskType  = 'PLAN_GENERATE_WORKOUT'
    model     = 'deepseek-v4-pro'
    inputJson = @{
      mesocycleWeeks = 1
      notes          = 'M3 acceptance: 3 sessions per week'
    }
  } -Token $access
  $planWait = Wait-AiTask -TaskId $planTask.taskId -Token $access -TimeoutSec 180
  Assert-True ($planWait.status -eq 'DONE') ('PLAN_GENERATE_WORKOUT DONE status=' + $planWait.status)
  if ($planWait.status -eq 'DONE') {
    Assert-True ($null -ne $planWait.result.result.planId) 'workout planId present'
    Assert-True ($planWait.result.result.days.Count -ge 1) 'workout plan has days'
  }

  # Qwen-VL 需能公网拉取图片；本地 MinIO 仅 127.0.0.1 时请用可访问的 imageUrl 或配置 S3_PUBLIC_ENDPOINT
  $mealTask = Invoke-Api -Method POST -Path '/ai/tasks' -Body @{
    taskType  = 'MEAL_VISION'
    model     = 'qwen-vl-max'
    inputJson = @{
      imageUrl                = 'https://dashscope.oss-cn-beijing.aliyuncs.com/images/seg_food.jpg'
      notes                   = 'M3 acceptance lunch'
      mealType                = 'LUNCH'
      saveMealLog             = $true
      timezoneOffsetMinutes   = 480
    }
  } -Token $access
  $mealWait = Wait-AiTask -TaskId $mealTask.taskId -Token $access -TimeoutSec 120
  Assert-True ($mealWait.status -eq 'DONE') ('MEAL_VISION DONE status=' + $mealWait.status)
  if ($mealWait.status -eq 'DONE') {
    Assert-True ($mealWait.result.result.items.Count -ge 1) 'meal vision items'
    Assert-True ($null -ne $mealWait.result.result.advice.summary) 'meal vision advice.summary'
  }
}

Write-Host ""
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
if ($failed -gt 0) { exit 1 }
exit 0
