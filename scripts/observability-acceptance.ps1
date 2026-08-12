# Coach 聊天 Langfuse 观测验收（PowerShell）。需 API 已启动；COACH_CHAT 需 DeepSeek Key。
# Usage:
#   # 非 Agent + Langfuse（apps/api/.env: COACH_AGENT_ENABLED=false, LANGFUSE_ENABLED=true）
#   pnpm dev:stack   # 或分步启动 api + Langfuse
#   .\scripts\observability-acceptance.ps1 -RequireLangfuse
#
#   # Agent 路径（COACH_AGENT_ENABLED=true）
#   .\scripts\observability-acceptance.ps1 -RequireLangfuse
#
# Flags:
#   -SkipCoachChat     无 DeepSeek 余额时跳过 SSE 对话
#   -RequireLangfuse   未设 LANGFUSE_ENABLED=true 则失败；成功时断言 observability.traceId
#   -SkipAgentPath     只测非 Agent（COACH_AGENT_ENABLED 须为 false）
#   -SkipGeoTools      Agent 路径下跳过 Geo 工具断言（无 AMAP_WEB_KEY）

param(
  [string]$BaseUrl = "http://127.0.0.1:3000/v1",
  [string]$Phone = "13800138000",
  [string]$Password = "demo1234",
  [switch]$SkipCoachChat,
  [switch]$RequireLangfuse,
  [switch]$SkipAgentPath,
  [switch]$SkipGeoTools
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

function Get-AiRunIdFromConversation {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$AssistantMessageId
  )

  $conversation = Invoke-RestMethod -Uri "$BaseUrl/conversations/default" -Headers $Headers
  foreach ($msg in $conversation.messages) {
    if ($msg.id -eq $AssistantMessageId -and $msg.aiRunId) {
      return [string]$msg.aiRunId
    }
  }
  return $null
}

function Read-DotEnvValue {
  param(
    [string[]]$Paths,
    [string]$Key
  )

  foreach ($path in $Paths) {
    if (-not (Test-Path $path)) { continue }
    foreach ($line in Get-Content $path -ErrorAction SilentlyContinue) {
      $trimmed = $line.Trim()
      if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) { continue }
      if ($trimmed -match '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
        if ($Matches.key -eq $Key) {
          return $Matches.value.Trim().Trim('"').Trim("'")
        }
      }
    }
  }
  return $null
}

function Get-ApiEnvHint {
  param([string]$Key)

  $fileValue = Read-DotEnvValue @(
    (Join-Path $PSScriptRoot "..\apps\api\.env")
    (Join-Path $PSScriptRoot "..\.env")
  ) $Key

  if ($null -ne $fileValue -and $fileValue.Length -gt 0) {
    return $fileValue
  }
  $envItem = Get-Item -Path "env:$Key" -ErrorAction SilentlyContinue
  if ($envItem) {
    return [string]$envItem.Value
  }
  return ""
}

function Assert-ObservabilityFromTask {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$AiRunId,
    [switch]$RequireLangfuse,
    [switch]$ExpectToolSpans
  )

  Assert-True ($null -ne $AiRunId -and $AiRunId.Length -gt 0) "assistant message has aiRunId"

  if (-not $AiRunId) {
    return $null
  }

  $task = Invoke-RestMethod -Uri "$BaseUrl/ai/tasks/$AiRunId" -Headers $Headers
  Assert-True ($task.status -eq "DONE") "GET /ai/tasks/:id status=DONE (got $($task.status))"

  $obs = $null
  if ($task.result -and $task.result.observability) {
    $obs = $task.result.observability
  }

  if ($RequireLangfuse) {
    Assert-True ($obs -and $obs.traceId) "observability.traceId present (-RequireLangfuse)"
    if ($obs -and $obs.traceUrl) {
      Write-Host "  traceUrl=$($obs.traceUrl)" -ForegroundColor DarkGray
    }
    if ($obs -and $null -ne $obs.generationCount) {
      Write-Host "  generationCount=$($obs.generationCount)" -ForegroundColor DarkGray
    }
    if ($ExpectToolSpans) {
      $toolSpanCount = if ($obs -and $null -ne $obs.toolSpanCount) { [int]$obs.toolSpanCount } else { 0 }
      Assert-True ($toolSpanCount -ge 1) "observability.toolSpanCount >= 1 (agent path)"
    }
  } else {
    if ($obs -and $obs.traceId) {
      Write-Host "[INFO] observability.traceId=$($obs.traceId)" -ForegroundColor DarkGray
    } else {
      Write-Host "[INFO] observability absent (LANGFUSE_ENABLED=false expected)" -ForegroundColor DarkGray
    }
    Assert-True $true "observability optional (no -RequireLangfuse)"
  }

  return $obs
}

Write-Host ""
Write-Host "== Coach Langfuse observability acceptance @ $BaseUrl ==" -ForegroundColor Cyan
if ($SkipCoachChat) {
  Write-Host "(SkipCoachChat: skip SSE chat)" -ForegroundColor Yellow
}
if ($RequireLangfuse) {
  Write-Host "(RequireLangfuse: assert observability.traceId)" -ForegroundColor Yellow
}
if ($SkipAgentPath) {
  Write-Host "(SkipAgentPath: non-agent path only)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "-- Env hints (file: apps/api/.env; restart API after edits) --" -ForegroundColor DarkCyan
Write-Host "  LANGFUSE_ENABLED=$(Get-ApiEnvHint 'LANGFUSE_ENABLED')"
Write-Host "  COACH_AGENT_ENABLED=$(Get-ApiEnvHint 'COACH_AGENT_ENABLED')"
Write-Host "  LANGFUSE_BASE_URL=$(Get-ApiEnvHint 'LANGFUSE_BASE_URL')"
Write-Host ""

try {
  $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 5
  Assert-True ($health.ok -eq $true) "GET /v1/health ok"
} catch {
  Assert-True $false "GET /v1/health reachable ($($_.Exception.Message))"
}

$apiMeta = $null
try {
  $apiMeta = Invoke-RestMethod -Uri $BaseUrl -Method GET -TimeoutSec 5
  Write-Host "-- API runtime (GET /v1) --" -ForegroundColor DarkCyan
  Write-Host "  langfuseEnabled=$($apiMeta.langfuseEnabled)"
  Write-Host "  langfuseConfigured=$($apiMeta.langfuseConfigured)"
  Write-Host "  coachAgentEnabled=$($apiMeta.coachAgentEnabled)"
  Write-Host "  langfuseBaseUrl=$($apiMeta.langfuseBaseUrl)"
  Write-Host ""
} catch {
  Assert-True $false "GET /v1 meta reachable ($($_.Exception.Message))"
}

if ($RequireLangfuse) {
  Assert-True ($apiMeta.langfuseEnabled -eq $true) "RequireLangfuse: API langfuseEnabled=true (restart API if .env changed)"
  Assert-True ($apiMeta.langfuseConfigured -eq $true) "RequireLangfuse: API langfuseConfigured=true (check LANGFUSE_PUBLIC_KEY / SECRET_KEY)"
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

$conversation = Invoke-RestMethod -Uri "$BaseUrl/conversations/default" -Headers $headers
Write-Host "OK GET /conversations/default id=$($conversation.id)"
Assert-True ($null -ne $conversation.id) "GET /conversations/default"

$coachAgentEnabled = ($apiMeta.coachAgentEnabled -eq $true)

if (-not $SkipCoachChat) {
  if ($coachAgentEnabled -and -not $SkipAgentPath) {
    $weatherBody = @{
      action                = "CHAT"
      content               = "OBS acceptance weather check"
      timezoneOffsetMinutes = 480
      locationContext       = Get-ShanghaiLocationContext
    }

    Write-Host "POST stream (Agent): weather + Shanghai locationContext..." -ForegroundColor Cyan
    $weatherResult = Invoke-CoachStreamChat -BaseUrl $BaseUrl -Headers $headers -ConversationId $conversation.id -Body $weatherBody
    Write-Host "OK agent stream done assistantMessageId=$($weatherResult.done.assistantMessageId)"

    if ($SkipGeoTools) {
      Assert-True ($true) "agent weather chat completed (-SkipGeoTools)"
    } else {
      $hasWeatherTool = Test-ToolTraceContains $weatherResult.toolTrace @("get_weather")
      $hasWeatherWords = Test-TextContainsAny $weatherResult.reply (Get-WeatherReplyNeedles)
      Assert-True ($hasWeatherTool -or $hasWeatherWords) "agent: toolTrace get_weather or reply mentions weather"
    }

    $aiRunId = Get-AiRunIdFromConversation -BaseUrl $BaseUrl -Headers $headers -AssistantMessageId $weatherResult.done.assistantMessageId
    Write-Host "OK aiRunId=$aiRunId"
    $null = Assert-ObservabilityFromTask -BaseUrl $BaseUrl -Headers $headers -AiRunId $aiRunId -RequireLangfuse:$RequireLangfuse -ExpectToolSpans
  } elseif ($coachAgentEnabled -and $SkipAgentPath) {
    Write-Host "[SKIP] Agent path (-SkipAgentPath); set COACH_AGENT_ENABLED=false and restart API to run non-agent test" -ForegroundColor Yellow
  } else {
    $chatBody = @{
      action                = "CHAT"
      content               = "OBS acceptance non-agent ping"
      timezoneOffsetMinutes = 480
    }

    Write-Host "POST stream (non-Agent): classic runCoachChatStream..." -ForegroundColor Cyan
    $chatResult = Invoke-CoachStreamChat -BaseUrl $BaseUrl -Headers $headers -ConversationId $conversation.id -Body $chatBody
    Write-Host "OK non-agent stream done assistantMessageId=$($chatResult.done.assistantMessageId)"

    $aiRunId = Get-AiRunIdFromConversation -BaseUrl $BaseUrl -Headers $headers -AssistantMessageId $chatResult.done.assistantMessageId
    Write-Host "OK aiRunId=$aiRunId"
    $null = Assert-ObservabilityFromTask -BaseUrl $BaseUrl -Headers $headers -AiRunId $aiRunId -RequireLangfuse:$RequireLangfuse
  }
} else {
  Write-Host "[SKIP] SSE chat (-SkipCoachChat)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host "Langfuse UI: confirm trace timeline manually (see docs/HANDOFF-OBSERVABILITY.md §4)" -ForegroundColor DarkGray
Write-Host "Non-agent rerun: COACH_AGENT_ENABLED=false + restart API" -ForegroundColor DarkGray
Write-Host "Agent rerun: COACH_AGENT_ENABLED=true + restart API" -ForegroundColor DarkGray
Write-Host ""

if ($failed -gt 0) { exit 1 }
exit 0
