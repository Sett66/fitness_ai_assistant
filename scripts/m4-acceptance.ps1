# M4 移动端验收脚本（需 API + Worker 已启动）
param(
  [string]$BaseUrl = "http://127.0.0.1:3000/v1",
  [string]$Phone = "13800138000",
  [string]$Password = "demo1234"
)

$ErrorActionPreference = "Stop"

Write-Host "== M4 API smoke ==" -ForegroundColor Cyan

$loginBody = @{ phone = $Phone; password = $Password } | ConvertTo-Json
try {
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
} catch {
  Write-Host "登录失败，尝试注册..." -ForegroundColor Yellow
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/register" -Method POST -ContentType "application/json" -Body $loginBody
}

$token = $auth.tokens.accessToken
$headers = @{ Authorization = "Bearer $token" }

Write-Host "✓ Auth OK user=$($auth.user.phone)"

$plans = Invoke-RestMethod -Uri "$BaseUrl/plans?type=WORKOUT" -Headers $headers
Write-Host "✓ GET /plans count=$($plans.items.Count)"

$summary = Invoke-RestMethod -Uri "$BaseUrl/meal-logs/daily-summary?date=$(Get-Date -Format 'yyyy-MM-dd')&timezoneOffsetMinutes=480" -Headers $headers
Write-Host "✓ GET /meal-logs/daily-summary targetKcal=$($summary.targetKcal)"

$sessions = Invoke-RestMethod -Uri "$BaseUrl/workouts/sessions" -Headers $headers
Write-Host "✓ GET /workouts/sessions count=$($sessions.items.Count)"

$conversation = Invoke-RestMethod -Uri "$BaseUrl/conversations/default" -Headers $headers
Write-Host "✓ GET /conversations/default id=$($conversation.id) messages=$($conversation.messages.Count)"

$chatBody = @{
  action = "CHAT"
  content = "M4 acceptance ping"
  timezoneOffsetMinutes = 480
} | ConvertTo-Json
$chatAccepted = Invoke-RestMethod -Uri "$BaseUrl/conversations/$($conversation.id)/messages" -Method POST -Headers $headers -ContentType "application/json" -Body $chatBody
Write-Host "✓ POST /conversations/:id/messages taskId=$($chatAccepted.taskId)"

if ($chatAccepted.taskId) {
  $deadline = (Get-Date).AddSeconds(90)
  do {
    Start-Sleep -Seconds 2
    $task = Invoke-RestMethod -Uri "$BaseUrl/ai/tasks/$($chatAccepted.taskId)" -Headers $headers
  } while ($task.status -in @("QUEUED", "RUNNING") -and (Get-Date) -lt $deadline)
  if ($task.status -ne "DONE") {
    throw "COACH_CHAT task did not complete: $($task.status) $($task.errorMsg)"
  }
  Write-Host "✓ COACH_CHAT DONE"
}

Write-Host "`nM4 API smoke 通过。移动端：pnpm --filter mobile start && android" -ForegroundColor Green
