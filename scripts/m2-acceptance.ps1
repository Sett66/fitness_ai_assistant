# M2 E2E acceptance (PowerShell). Run from repo root after API + worker are up.
# Usage: .\scripts\m2-acceptance.ps1 [-BaseUrl 'http://127.0.0.1:3000']

param(
  [string]$BaseUrl = 'http://127.0.0.1:3000'
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
    $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    if ($ExpectError) {
      if ($_.ErrorDetails.Message) {
        try { return $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
      }
      if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
        $reader.Close()
        try { return $raw | ConvertFrom-Json } catch { return @{ raw = $raw } }
      }
    }
    throw
  }
}

Write-Host ""
Write-Host "=== M2 Acceptance @ $BaseUrl ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health + Swagger
$h = Invoke-Api -Path '/health'
Assert-True ($h.ok -eq $true) 'GET /v1/health'
try {
  $sw = Invoke-WebRequest -Uri "$BaseUrl/swagger" -UseBasicParsing -TimeoutSec 5
  Assert-True ($sw.StatusCode -eq 200) 'GET /swagger'
} catch {
  Assert-True $false 'GET /swagger'
}

# 2. Auth
$suffix = (Get-Date -Format 'HHmmss') + (Get-Random -Maximum 9999)
$phone = "139$suffix".Substring(0, 11)
$password = 'TestPass1'

$reg = Invoke-Api -Method POST -Path '/auth/register' -Body @{ phone = $phone; password = $password }
Assert-True ($null -ne $reg.tokens.accessToken -and $null -ne $reg.tokens.refreshToken) 'POST /auth/register'
$access = $reg.tokens.accessToken
$refresh = $reg.tokens.refreshToken

$login = Invoke-Api -Method POST -Path '/auth/login' -Body @{ phone = $phone; password = $password }
Assert-True ($null -ne $login.tokens.accessToken) 'POST /auth/login'
$access = $login.tokens.accessToken
$refresh = $login.tokens.refreshToken

$ref = Invoke-Api -Method POST -Path '/auth/refresh' -Body @{ refreshToken = $refresh }
Assert-True ($null -ne $ref.accessToken) 'POST /auth/refresh'
$access = $ref.accessToken

$bad = Invoke-Api -Method POST -Path '/auth/login' -Body @{ phone = $phone; password = 'wrongpass1' } -ExpectError
Assert-True ($null -ne $bad.code -and $null -ne $bad.message) 'auth error JSON shape'

# 3. Profile + User + StrengthLevel
$me0 = Invoke-Api -Path '/users/me' -Token $access
Assert-True ($me0.onboarding.complete -eq $false) 'GET /users/me onboarding incomplete'

$profileBody = @{
  gender        = 'MALE'
  birthDate     = '1990-06-15T00:00:00.000Z'
  heightCm      = 175
  weightKg      = 72.5
  trainingYears = 3
  goal          = 'MUSCLE_GAIN'
}
$p = Invoke-Api -Method PUT -Path '/users/me/profile' -Body $profileBody -Token $access
Assert-True ($p.userId -and $p.goal -eq 'MUSCLE_GAIN') 'PUT /users/me/profile'
$gp = Invoke-Api -Path '/users/me/profile' -Token $access
Assert-True ($gp.heightCm -eq 175) 'GET /users/me/profile'

$mePatch = Invoke-Api -Method PATCH -Path '/users/me' -Body @{ displayName = 'E2EUser' } -Token $access
Assert-True ($mePatch.user.displayName -eq 'E2EUser') 'PATCH /users/me displayName'
$me1 = Invoke-Api -Path '/users/me' -Token $access
Assert-True ($me1.onboarding.complete -eq $true) 'GET /users/me onboarding complete'

$exForSl = Invoke-Api -Path '/exercises?limit=5' -Token $access
$benchEx = $exForSl.items | Where-Object { $_.nameZh -like '*卧推*' } | Select-Object -First 1
if (-not $benchEx) { $benchEx = $exForSl.items[0] }
$slBody = @{ exerciseId = $benchEx.id; oneRm = 80; workingWeightKg = 60 }
$sl = Invoke-Api -Method POST -Path '/users/me/strength-levels' -Body $slBody -Token $access
Assert-True ($sl.id -and $sl.oneRm -eq 80 -and $sl.workingWeightKg -eq 60) 'POST /users/me/strength-levels'
$sl2 = Invoke-Api -Method PATCH -Path "/users/me/strength-levels/$($sl.id)" -Body @{ oneRm = 85 } -Token $access
Assert-True ($sl2.oneRm -eq 85) 'PATCH /users/me/strength-levels/:id'

# 4. Exercises / Foods (seed)
$ex = Invoke-Api -Path '/exercises?limit=50' -Token $access
Assert-True ($ex.items.Count -ge 5) 'GET /exercises seed count >= 5'
$presetCount = @($ex.items | Where-Object { $_.isPreset -eq $true }).Count
Assert-True ($presetCount -ge 5) 'exercises include presets'

$fd = Invoke-Api -Path '/foods?limit=50' -Token $access
Assert-True ($fd.items.Count -ge 10) 'GET /foods seed count >= 10'

$exBody = @{
  nameZh           = 'E2E Custom Exercise'
  primaryMuscle    = 'CHEST'
  secondaryMuscles = @()
  equipment        = 'DUMBBELL'
  difficulty       = 'BEGINNER'
}
$customEx = Invoke-Api -Method POST -Path '/exercises' -Body $exBody -Token $access
Assert-True ($customEx.id -and $customEx.isPreset -eq $false) 'POST /exercises user-owned'

# 5. Media: sign -> PUT MinIO -> complete
$signBody = @{ mime = 'image/jpeg'; sizeBytes = 128; scope = 'MEAL_PHOTO' }
$sign = Invoke-Api -Method POST -Path '/uploads/sign' -Body $signBody -Token $access
Assert-True ($null -ne $sign.uploadUrl -and $null -ne $sign.objectKey) 'POST /uploads/sign'

$tmpFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllBytes($tmpFile, [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D))
$putUrl = $sign.uploadUrl -replace '://localhost:', '://127.0.0.1:'
$curlArgs = @('-sS', '--max-time', '15', '-X', 'PUT', '-H', 'Content-Type: image/jpeg', '--data-binary', "@$tmpFile", $putUrl)
& curl.exe @curlArgs | Out-Null
if ($LASTEXITCODE -ne 0) { throw "MinIO PUT failed (curl exit $LASTEXITCODE)" }
Remove-Item $tmpFile -Force

$done = Invoke-Api -Method POST -Path '/uploads/complete' -Body @{ objectKey = $sign.objectKey } -Token $access
Assert-True ($null -ne $done.mediaId) 'POST /uploads/complete mediaId'

# 6. AI task (requires worker)
$taskBody = @{
  taskType  = 'PLAN_GENERATE_WORKOUT'
  model     = 'deepseek-chat'
  inputJson = @{ demo = $true }
}
$task = Invoke-Api -Method POST -Path '/ai/tasks' -Body $taskBody -Token $access
Assert-True ($null -ne $task.taskId) 'POST /ai/tasks'

$status = 'QUEUED'
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  $st = Invoke-Api -Path "/ai/tasks/$($task.taskId)" -Token $access
  $status = $st.status
  if ($status -eq 'DONE' -or $status -eq 'FAILED') { break }
  Start-Sleep -Milliseconds 400
}
Assert-True ($status -eq 'DONE') "AI task DONE (got $status, worker required)"

# 7. Logout
Invoke-Api -Method POST -Path '/auth/logout' -Body @{ refreshToken = $refresh } -Token $access | Out-Null
Assert-True $true 'POST /auth/logout'

Write-Host ""
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host ""
if ($failed -gt 0) { exit 1 }
exit 0
