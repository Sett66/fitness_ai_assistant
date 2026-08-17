# SOCIAL-07 社区端到端验收（需 API + Worker 已启动）
# Usage:
#   .\scripts\social-acceptance.ps1
#   .\scripts\social-acceptance.ps1 -SkipModeration -SkipSearch
# Flags:
#   -SkipModeration  无 LLM 额度时跳过 PENDING→APPROVED 轮询
#   -SkipSearch      无 Meili / Worker 索引时跳过搜索断言
param(
  [string]$BaseUrl = "http://127.0.0.1:3000",
  [switch]$SkipModeration,
  [switch]$SkipSearch
)

$ErrorActionPreference = "Stop"

$BaseUrl = $BaseUrl.TrimEnd("/")
if ($BaseUrl -notmatch "/v1$") {
  $BaseUrl = "$BaseUrl/v1"
}

$script:SocialBodies = @()
$Password = "AccTest1234"
$PhoneA = "13900000991"
$PhoneB = "13900000992"

function Fail-Step([string]$step, [string]$msg) {
  Write-Host "[FAIL] $step : $msg" -ForegroundColor Red
  exit 1
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body,
    [switch]$CaptureSocial
  )

  $params = @{
    Method          = $Method
    Uri             = $Uri
    UseBasicParsing = $true
  }
  if ($Headers) { $params.Headers = $Headers }
  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Compress -Depth 8
    $params.ContentType = "application/json; charset=utf-8"
    $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
  }

  $status = 0
  $raw = ""
  try {
    $resp = Invoke-WebRequest @params
    $status = [int]$resp.StatusCode
    $raw = [string]$resp.Content
  } catch {
    $err = $_
    if ($err.ErrorDetails -and $err.ErrorDetails.Message) {
      $raw = [string]$err.ErrorDetails.Message
    }
    $response = $err.Exception.Response
    if ($response) {
      try { $status = [int]$response.StatusCode } catch { }
      if (-not $raw) {
        try {
          $stream = $response.GetResponseStream()
          if ($stream) {
            $reader = New-Object System.IO.StreamReader($stream)
            $raw = $reader.ReadToEnd()
            $reader.Close()
          }
        } catch { }
      }
    }
    if ($status -eq 0) { throw }
  }

  if ($CaptureSocial -and $raw) {
    $script:SocialBodies += $raw
  }

  $parsed = $null
  if ($raw) {
    try { $parsed = $raw | ConvertFrom-Json } catch { }
  }
  return @{ StatusCode = $status; Raw = $raw; Json = $parsed }
}

function Test-OkStatus([int]$status) {
  return $status -eq 200 -or $status -eq 201
}

function Get-AuthToken([string]$phone) {
  $login = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/auth/login" -Body @{
    phone    = $phone
    password = $Password
  }
  if ((Test-OkStatus $login.StatusCode) -and $login.Json.tokens.accessToken) {
    return [string]$login.Json.tokens.accessToken
  }

  $chal = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/auth/captcha/challenge" -Body @{}
  if (-not (Test-OkStatus $chal.StatusCode)) {
    throw "captcha challenge failed: $($chal.StatusCode) $($chal.Raw)"
  }
  $cap = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/auth/captcha/verify" -Body @{
    captchaId = $chal.Json.captchaId
    x         = $chal.Json.gapX
  }
  if (-not $cap.Json.captchaToken) {
    throw "captcha verify failed: $($cap.StatusCode) $($cap.Raw)"
  }
  $send = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/auth/send-sms-code" -Body @{
    phone        = $phone
    scene        = "REGISTER"
    captchaToken = $cap.Json.captchaToken
  }
  if (-not $send.Json.devCode) {
    throw "send-sms-code failed: $($send.StatusCode) $($send.Raw)"
  }
  $reg = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/auth/register" -Body @{
    phone    = $phone
    password = $Password
    smsCode  = $send.Json.devCode
  }
  if (-not (Test-OkStatus $reg.StatusCode) -or -not $reg.Json.tokens.accessToken) {
    throw "register failed: $($reg.StatusCode) $($reg.Raw)"
  }
  return [string]$reg.Json.tokens.accessToken
}

function AuthHeaders([string]$token) {
  return @{ Authorization = "Bearer $token" }
}

Write-Host "== SOCIAL API acceptance ==" -ForegroundColor Cyan
if ($SkipModeration) {
  Write-Host "(SkipModeration: skip PENDING -> APPROVED poll)" -ForegroundColor Yellow
}
if ($SkipSearch) {
  Write-Host "(SkipSearch: skip Meili search assertions)" -ForegroundColor Yellow
}

# 1. 注册 / 登录 A、B
Write-Host "-- 1 register/login A,B" -ForegroundColor Cyan
try {
  $tokenA = Get-AuthToken $PhoneA
  $tokenB = Get-AuthToken $PhoneB
} catch {
  Fail-Step "1" $_.Exception.Message
}
if (-not $tokenA -or -not $tokenB) { Fail-Step "1" "missing access token" }
$headersA = AuthHeaders $tokenA
$headersB = AuthHeaders $tokenB
Write-Host "[PASS] 1 tokens issued" -ForegroundColor Green

# 2. A 发含唯一词的帖
Write-Host "-- 2 A create post" -ForegroundColor Cyan
$token = "acc-" + [guid]::NewGuid().ToString("N").Substring(0, 12)
$bodyText = "深蹲 $token"
$created = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/social/posts" -Headers $headersA -Body @{
  body = $bodyText
} -CaptureSocial
if ($created.StatusCode -ne 201) {
  Fail-Step "2" "expected 201, got $($created.StatusCode) $($created.Raw)"
}
$postId = [string]$created.Json.id
if (-not $postId) { Fail-Step "2" "missing post id" }
if ($null -eq $created.Json.moderation) { Fail-Step "2" "missing moderation" }
if ([int]$created.Json.likeCount -ne 0) { Fail-Step "2" "likeCount expected 0, got $($created.Json.likeCount)" }
Write-Host "[PASS] 2 post=$postId moderation=$($created.Json.moderation)" -ForegroundColor Green

# 3. 轮询审核
if (-not $SkipModeration) {
  Write-Host "-- 3 poll moderation APPROVED" -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds(30)
  $moderation = [string]$created.Json.moderation
  while ((Get-Date) -lt $deadline) {
    if ($moderation -eq "APPROVED") { break }
    Start-Sleep -Seconds 2
    $detail = Invoke-JsonRequest -Method GET -Uri "$BaseUrl/social/posts/$postId" -Headers $headersA -CaptureSocial
    if ($detail.StatusCode -ne 200) {
      Fail-Step "3" "GET post failed: $($detail.StatusCode) $($detail.Raw)"
    }
    $moderation = [string]$detail.Json.moderation
  }
  if ($moderation -ne "APPROVED") {
    Fail-Step "3" "moderation stayed $moderation after 30s (start worker / LLM key, or use -SkipModeration)"
  }
  Write-Host "[PASS] 3 moderation=APPROVED" -ForegroundColor Green
} else {
  Write-Host "[SKIP] 3 moderation poll" -ForegroundColor Yellow
}

# 4. 轮询搜索命中
if (-not $SkipSearch) {
  Write-Host "-- 4 poll search hit" -ForegroundColor Cyan
  $q = [uri]::EscapeDataString($token)
  $deadline = (Get-Date).AddSeconds(30)
  $hit = $false
  while ((Get-Date) -lt $deadline) {
    $sr = Invoke-JsonRequest -Method GET -Uri "$BaseUrl/social/search?q=$q" -Headers $headersA -CaptureSocial
    if ($sr.StatusCode -eq 200) {
      $ids = @()
      if ($sr.Json.posts -and $sr.Json.posts.items) {
        $ids = @($sr.Json.posts.items | ForEach-Object { [string]$_.id })
      }
      if ($ids -contains $postId) { $hit = $true; break }
    } elseif ($sr.StatusCode -eq 503) {
      Start-Sleep -Seconds 2
      continue
    } else {
      Fail-Step "4" "search failed: $($sr.StatusCode) $($sr.Raw)"
    }
    Start-Sleep -Seconds 2
  }
  if (-not $hit) {
    Fail-Step "4" "post not found in search within 30s (reindex:social / worker, or use -SkipSearch)"
  }
  Write-Host "[PASS] 4 search hit" -ForegroundColor Green
} else {
  Write-Host "[SKIP] 4 search poll" -ForegroundColor Yellow
}

# 5. B 点赞 3 次，likeCount 恒为 1
Write-Host "-- 5 B like x3 idempotent" -ForegroundColor Cyan
for ($i = 1; $i -le 3; $i++) {
  $liked = Invoke-JsonRequest -Method PUT -Uri "$BaseUrl/social/posts/$postId/like" -Headers $headersB -CaptureSocial
  if ($liked.StatusCode -ne 200) {
    Fail-Step "5" "like #$i failed: $($liked.StatusCode) $($liked.Raw)"
  }
  if ([int]$liked.Json.likeCount -ne 1) {
    Fail-Step "5" "like #$i likeCount expected 1, got $($liked.Json.likeCount)"
  }
}
Write-Host "[PASS] 5 likeCount stays 1" -ForegroundColor Green

# 6. B 取消点赞 2 次，likeCount 恒为 0
Write-Host "-- 6 B unlike x2 not negative" -ForegroundColor Cyan
for ($i = 1; $i -le 2; $i++) {
  $unliked = Invoke-JsonRequest -Method DELETE -Uri "$BaseUrl/social/posts/$postId/like" -Headers $headersB -CaptureSocial
  if ($unliked.StatusCode -ne 200) {
    Fail-Step "6" "unlike #$i failed: $($unliked.StatusCode) $($unliked.Raw)"
  }
  if ([int]$unliked.Json.likeCount -ne 0) {
    Fail-Step "6" "unlike #$i likeCount expected 0, got $($unliked.Json.likeCount)"
  }
}
Write-Host "[PASS] 6 likeCount stays 0" -ForegroundColor Green

# 7. B 评论 2 条，删 1 条，commentCount = 1
Write-Host "-- 7 B comments then delete one" -ForegroundColor Cyan
$c1 = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/social/posts/$postId/comments" -Headers $headersB -Body @{
  body = "acc comment one $token"
} -CaptureSocial
$c2 = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/social/posts/$postId/comments" -Headers $headersB -Body @{
  body = "acc comment two $token"
} -CaptureSocial
if ($c1.StatusCode -ne 201 -or $c2.StatusCode -ne 201) {
  Fail-Step "7" "create comment failed: $($c1.StatusCode)/$($c2.StatusCode)"
}
$del = Invoke-JsonRequest -Method DELETE -Uri "$BaseUrl/social/comments/$($c1.Json.id)" -Headers $headersB -CaptureSocial
if ($del.StatusCode -ne 204) {
  Fail-Step "7" "delete comment expected 204, got $($del.StatusCode) $($del.Raw)"
}
$afterComments = Invoke-JsonRequest -Method GET -Uri "$BaseUrl/social/posts/$postId" -Headers $headersA -CaptureSocial
if ($afterComments.StatusCode -ne 200) {
  Fail-Step "7" "GET post failed: $($afterComments.StatusCode) $($afterComments.Raw)"
}
if ([int]$afterComments.Json.commentCount -ne 1) {
  Fail-Step "7" "commentCount expected 1, got $($afterComments.Json.commentCount)"
}
Write-Host "[PASS] 7 commentCount=1" -ForegroundColor Green

# 8. A 发含拦截词的帖
Write-Host "-- 8 banned keyword rejected" -ForegroundColor Cyan
$banned = Invoke-JsonRequest -Method POST -Uri "$BaseUrl/social/posts" -Headers $headersA -Body @{
  body = "this has bannedword inside"
} -CaptureSocial
if ($banned.StatusCode -ne 400) {
  Fail-Step "8" "expected 400, got $($banned.StatusCode) $($banned.Raw)"
}
if ([string]$banned.Json.code -ne "SOCIAL_CONTENT_REJECTED") {
  Fail-Step "8" "expected SOCIAL_CONTENT_REJECTED, got $($banned.Json.code)"
}
Write-Host "[PASS] 8 SOCIAL_CONTENT_REJECTED" -ForegroundColor Green

# 9. B 删 A 的帖 → 404
Write-Host "-- 9 B cannot delete A's post" -ForegroundColor Cyan
$foreignDel = Invoke-JsonRequest -Method DELETE -Uri "$BaseUrl/social/posts/$postId" -Headers $headersB -CaptureSocial
if ($foreignDel.StatusCode -ne 404) {
  Fail-Step "9" "expected 404, got $($foreignDel.StatusCode) $($foreignDel.Raw)"
}
Write-Host "[PASS] 9 foreign delete 404" -ForegroundColor Green

# 10. A 删自己的帖
Write-Host "-- 10 A delete own post" -ForegroundColor Cyan
$ownDel = Invoke-JsonRequest -Method DELETE -Uri "$BaseUrl/social/posts/$postId" -Headers $headersA -CaptureSocial
if ($ownDel.StatusCode -ne 204) {
  Fail-Step "10" "expected 204, got $($ownDel.StatusCode) $($ownDel.Raw)"
}
$gone = Invoke-JsonRequest -Method GET -Uri "$BaseUrl/social/posts/$postId" -Headers $headersA -CaptureSocial
if ($gone.StatusCode -ne 404) {
  Fail-Step "10" "GET after delete expected 404, got $($gone.StatusCode) $($gone.Raw)"
}
if (-not $SkipSearch) {
  $q = [uri]::EscapeDataString($token)
  $deadline = (Get-Date).AddSeconds(30)
  $missing = $false
  while ((Get-Date) -lt $deadline) {
    $sr = Invoke-JsonRequest -Method GET -Uri "$BaseUrl/social/search?q=$q" -Headers $headersA -CaptureSocial
    if ($sr.StatusCode -eq 200) {
      $ids = @()
      if ($sr.Json.posts -and $sr.Json.posts.items) {
        $ids = @($sr.Json.posts.items | ForEach-Object { [string]$_.id })
      }
      if ($ids -notcontains $postId) { $missing = $true; break }
    } elseif ($sr.StatusCode -eq 503) {
      Start-Sleep -Seconds 2
      continue
    } else {
      Fail-Step "10" "search after delete failed: $($sr.StatusCode) $($sr.Raw)"
    }
    Start-Sleep -Seconds 2
  }
  if (-not $missing) {
    Fail-Step "10" "deleted post still in search after 30s"
  }
}
Write-Host "[PASS] 10 deleted (GET 404$(if (-not $SkipSearch) { '; search miss' }))" -ForegroundColor Green

# 11. 社交响应不含 phone 字段
Write-Host "-- 11 no phone in social responses" -ForegroundColor Cyan
$joined = $script:SocialBodies -join "`n"
if ($joined -match '"phone"') {
  Fail-Step "11" "social response contained `"phone`" field"
}
Write-Host "[PASS] 11 no phone field" -ForegroundColor Green

Write-Host ""
Write-Host "social-acceptance passed." -ForegroundColor Green
if ($SkipModeration -or $SkipSearch) {
  Write-Host "(skipped:$(if ($SkipModeration) { ' moderation' })$(if ($SkipSearch) { ' search' }))" -ForegroundColor Yellow
}
