# M5 Coach Agent acceptance (PowerShell). Requires API running; Agent path uses SSE stream.
# Usage:
#   $env:COACH_AGENT_ENABLED='true'   # apps/api/.env + restart API
#   pnpm --filter api start:worker     # Worker still needed for enqueue / side jobs
#   pnpm --filter api start:api
#   .\scripts\m5-agent-acceptance.ps1
# Flags:
#   -SkipCoachChat     skip Agent SSE chat (no DeepSeek balance)
#   -SkipGeoTools      skip geo tool assertions (no AMAP_WEB_KEY)
#   -RequireAgent      fail if $env:COACH_AGENT_ENABLED -ne 'true'

param(
  [string]$BaseUrl = "http://127.0.0.1:3000/v1",
  [string]$Phone = "13800138000",
  [string]$Password = "demo1234",
  [switch]$SkipCoachChat,
  [switch]$SkipGeoTools,
  [switch]$RequireAgent
)

$ErrorActionPreference = "Stop"
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

function Get-ShanghaiLocationContext {
  return @{
    lat        = 31.2304
    lng        = 121.4737
    accuracyM  = 50
    city       = [string]::Concat([char]0x4E0A, [char]0x6D77)
    capturedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

function Test-ToolTraceContains($toolTrace, [string[]]$names) {
  if (-not $toolTrace) { return $false }
  foreach ($item in $toolTrace) {
    if ($names -contains $item.name) { return $true }
  }
  return $false
}

function Test-TextContainsAny([string]$text, [string[]]$needles) {
  if (-not $text) { return $false }
  foreach ($n in $needles) {
    if ($text -like "*$n*") { return $true }
  }
  return $false
}

function Get-WeatherReplyNeedles {
  return @(
    [string]::Concat([char]0x6E29, [char]0x5EA6)
    [string]::Concat([char]0x6C14, [char]0x6E29)
    [string][char]0x2103
    [string]::Concat([char]0x964D, [char]0x6C34)
    [string]::Concat([char]0x98CE, [char]0x529B)
    "weather"
    "Weather"
  )
}

function Get-GymReplyNeedles {
  return @(
    [string]::Concat([char]0x5065, [char]0x8EAB, [char]0x623F)
    [string]::Concat([char]0x5065, [char]0x8EAB)
    "GYM"
    "gym"
  )
}

function Invoke-CoachStreamChat {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$ConversationId,
    [object]$Body,
    [int]$TimeoutSec = 180
  )

  $uri = "$BaseUrl/conversations/$ConversationId/messages/stream"
  $jsonBody = $Body | ConvertTo-Json -Depth 12 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)

  $response = Invoke-WebRequest `
    -Uri $uri `
    -Method POST `
    -Headers $Headers `
    -ContentType "application/json; charset=utf-8" `
    -Body $bytes `
    -TimeoutSec $TimeoutSec `
    -UseBasicParsing

  $events = @()
  $currentEvent = $null
  $currentData = $null

  foreach ($line in ($response.Content -split "`n")) {
    $line = $line.TrimEnd("`r")
    if ($line -match '^event:\s*(.+)$') {
      $currentEvent = $Matches[1].Trim()
    } elseif ($line -match '^data:\s*(.+)$') {
      $currentData = $Matches[1]
    } elseif ($line -eq "" -and $currentEvent) {
      $parsed = $null
      if ($currentData) {
        $parsed = $currentData | ConvertFrom-Json
      }
      $events += @{ event = $currentEvent; data = $parsed }
      $currentEvent = $null
      $currentData = $null
    }
  }

  $toolNames = @()
  $doneData = $null
  $replyText = ""
  foreach ($ev in $events) {
    if ($ev.event -eq "error") {
      $msg = if ($ev.data.message) { $ev.data.message } else { "SSE error" }
      throw "Coach stream failed: $msg"
    }
    if ($ev.event -eq "delta" -and $ev.data.text) {
      $replyText = [string]$ev.data.text
    }
    if ($ev.event -eq "tool_end" -and $ev.data.name) {
      $toolNames += $ev.data.name
    }
    if ($ev.event -eq "done") {
      $doneData = $ev.data
    }
  }

  if (-not $doneData) {
    throw "Coach stream ended without done event (events=$($events.Count))"
  }

  $toolTrace = @()
  if ($doneData.toolTrace) {
    $toolTrace = @($doneData.toolTrace)
  }

  return @{
    toolTrace = $toolTrace
    toolNames = $toolNames
    reply     = $replyText
    done      = $doneData
    events    = $events
  }
}

Write-Host ""
Write-Host "== M5 Coach Agent acceptance @ $BaseUrl ==" -ForegroundColor Cyan
if ($SkipCoachChat) {
  Write-Host "(SkipCoachChat: skip Agent SSE chat)" -ForegroundColor Yellow
}
if ($SkipGeoTools) {
  Write-Host "(SkipGeoTools: skip geo tool assertions)" -ForegroundColor Yellow
}
Write-Host ""

if ($RequireAgent) {
  Assert-True ($env:COACH_AGENT_ENABLED -eq "true") "RequireAgent: COACH_AGENT_ENABLED=true (local env; restart API too)"
}

$loginBody = @{ phone = $Phone; password = $Password } | ConvertTo-Json
try {
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
} catch {
  Write-Host "Login failed, trying register..." -ForegroundColor Yellow
  $auth = Invoke-RestMethod -Uri "$BaseUrl/auth/register" -Method POST -ContentType "application/json" -Body $loginBody
}

$token = $auth.tokens.accessToken
$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/json"
}

Write-Host "OK Auth user=$($auth.user.phone)"
Assert-True ($null -ne $token) "Auth access token"

$mealPlans = Invoke-RestMethod -Uri "$BaseUrl/plans?type=MEAL" -Headers $headers
Write-Host "OK GET /plans?type=MEAL count=$($mealPlans.items.Count)"
Assert-True ($null -ne $mealPlans.items) "GET /plans?type=MEAL"

$conversation = Invoke-RestMethod -Uri "$BaseUrl/conversations/default" -Headers $headers
Write-Host "OK GET /conversations/default id=$($conversation.id)"
Assert-True ($null -ne $conversation.id) "GET /conversations/default"

if (-not $SkipCoachChat) {
  $weatherBody = @{
    action                = "CHAT"
    content               = "M5 agent weather check"
    timezoneOffsetMinutes = 480
    locationContext       = Get-ShanghaiLocationContext
  }

  Write-Host "POST stream: weather + Shanghai locationContext..." -ForegroundColor Cyan
  $weatherResult = Invoke-CoachStreamChat -BaseUrl $BaseUrl -Headers $headers -ConversationId $conversation.id -Body $weatherBody
  Write-Host "OK weather stream done assistantMessageId=$($weatherResult.done.assistantMessageId)"

  if ($SkipGeoTools) {
    Assert-True ($true) "weather chat completed (-SkipGeoTools)"
  } else {
    $hasWeatherTool = Test-ToolTraceContains $weatherResult.toolTrace @("get_weather")
    $hasWeatherWords = Test-TextContainsAny $weatherResult.reply (Get-WeatherReplyNeedles)
    Assert-True ($hasWeatherTool -or $hasWeatherWords) "weather: toolTrace get_weather or reply mentions weather"
  }

  $gymQuestion = [string]::Concat(
    [char]0x6211, [char]0x4E0B, [char]0x5468, [char]0x53BB,
    [char]0x4E0A, [char]0x6D77, [char]0x5E02, [char]0x51FA,
    [char]0x5DEE, [char]0xFF0C, [char]0x9644, [char]0x8FD1,
    [char]0x6709, [char]0x4EC0, [char]0x4E48, [char]0x5065,
    [char]0x8EAB, [char]0x623F
  )

  $gymBody = @{
    action                = "CHAT"
    content               = $gymQuestion
    timezoneOffsetMinutes = 480
  }

  Write-Host "POST stream: business trip gyms..." -ForegroundColor Cyan
  $gymResult = Invoke-CoachStreamChat -BaseUrl $BaseUrl -Headers $headers -ConversationId $conversation.id -Body $gymBody
  Write-Host "OK gym stream done assistantMessageId=$($gymResult.done.assistantMessageId)"

  if ($SkipGeoTools) {
    Assert-True ($true) "gym chat completed (-SkipGeoTools)"
  } else {
    $hasGeoTool = Test-ToolTraceContains $gymResult.toolTrace @("geocode_place", "search_nearby_gyms")
    $hasGymWords = Test-TextContainsAny $gymResult.reply (Get-GymReplyNeedles)
    Assert-True ($hasGeoTool -or $hasGymWords) "gym: toolTrace geocode/search or reply mentions gyms"
  }
} else {
  Write-Host "[SKIP] Agent SSE chat (-SkipCoachChat)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host "Fallback: set COACH_AGENT_ENABLED=false, restart API, run .\scripts\m4-acceptance.ps1" -ForegroundColor DarkGray
Write-Host "See docs/HANDOFF-M5.md" -ForegroundColor DarkGray
Write-Host ""

if ($failed -gt 0) { exit 1 }
exit 0
