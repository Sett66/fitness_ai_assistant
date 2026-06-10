# M4 移动端验收脚本（需 API + Worker 已启动；COACH_CHAT 需 DeepSeek Key 有余额）
param(
  [string]$BaseUrl = "http://127.0.0.1:3000/v1",
  [string]$Phone = "13800138000",
  [string]$Password = "demo1234",
  [switch]$SkipCoachChat
)

$ErrorActionPreference = "Stop"

Write-Host "== M4 API smoke ==" -ForegroundColor Cyan
if ($SkipCoachChat) {
  Write-Host "(SkipCoachChat: 跳过 COACH_CHAT 轮询)" -ForegroundColor Yellow
}

$loginBody = @{ phone = $Phone; password = $Password } | ConvertTo-Json
try {
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
} catch {
  Write-Host "登录失败，尝试注册..." -ForegroundColor Yellow
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/register" -Method POST -ContentType "application/json" -Body $loginBody
}

$token = $auth.tokens.accessToken
$headers = @{ Authorization = "Bearer $token" }

Write-Host "OK Auth user=$($auth.user.phone)"

$workoutPlans = Invoke-RestMethod -Uri "$BaseUrl/plans?type=WORKOUT" -Headers $headers
Write-Host "OK GET /plans?type=WORKOUT count=$($workoutPlans.items.Count)"

$mealPlans = Invoke-RestMethod -Uri "$BaseUrl/plans?type=MEAL" -Headers $headers
Write-Host "OK GET /plans?type=MEAL count=$($mealPlans.items.Count)"

if ($mealPlans.items.Count -gt 0) {
  $mealId = $mealPlans.items[0].id
  $mealDetail = Invoke-RestMethod -Uri "$BaseUrl/plans/$mealId" -Headers $headers
  $dayCount = @($mealDetail.mealDays).Count
  Write-Host "OK GET /plans/:id (MEAL) mealDays=$dayCount"
}

$summary = Invoke-RestMethod -Uri "$BaseUrl/meal-logs/daily-summary?date=$(Get-Date -Format 'yyyy-MM-dd')&timezoneOffsetMinutes=480" -Headers $headers
Write-Host "OK GET /meal-logs/daily-summary targetKcal=$($summary.targetKcal)"

$sessions = Invoke-RestMethod -Uri "$BaseUrl/workouts/sessions" -Headers $headers
Write-Host "OK GET /workouts/sessions count=$($sessions.items.Count)"

$foods = Invoke-RestMethod -Uri "$BaseUrl/foods?limit=5" -Headers $headers
Write-Host "OK GET /foods count=$($foods.items.Count)"

$conversation = Invoke-RestMethod -Uri "$BaseUrl/conversations/default" -Headers $headers
Write-Host "OK GET /conversations/default id=$($conversation.id) messages=$($conversation.messages.Count)"

if (-not $SkipCoachChat) {
  $chatBody = @{
    action = "CHAT"
    content = "M4 acceptance ping"
    timezoneOffsetMinutes = 480
  } | ConvertTo-Json
  $chatAccepted = Invoke-RestMethod -Uri "$BaseUrl/conversations/$($conversation.id)/messages" -Method POST -Headers $headers -ContentType "application/json" -Body $chatBody
  Write-Host "OK POST /conversations/:id/messages taskId=$($chatAccepted.taskId)"

  if ($chatAccepted.taskId) {
    $deadline = (Get-Date).AddSeconds(90)
    do {
      Start-Sleep -Seconds 2
      $task = Invoke-RestMethod -Uri "$BaseUrl/ai/tasks/$($chatAccepted.taskId)" -Headers $headers
    } while ($task.status -in @("QUEUED", "RUNNING") -and (Get-Date) -lt $deadline)
    if ($task.status -ne "DONE") {
      throw "COACH_CHAT task did not complete: $($task.status) $($task.errorMsg). 确认 Worker 已启动且 DeepSeek 有余额，或使用 -SkipCoachChat"
    }
    Write-Host "OK COACH_CHAT DONE"
  }
}

Write-Host ""
Write-Host "M4 API smoke passed. See HANDOFF-M4-REMAINING.md for mobile manual checklist." -ForegroundColor Green
