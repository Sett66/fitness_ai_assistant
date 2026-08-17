# SOCIAL-02 smoke: idempotent like / unlike + likeCount + likedByMe
# Usage (repo root, API running):
#   .\scripts\social-02-smoke.ps1
#   .\scripts\social-02-smoke.ps1 -BaseUrl 'http://127.0.0.1:3000/v1'

param(
  [string]$BaseUrl = 'http://127.0.0.1:3000/v1'
)

$ErrorActionPreference = 'Stop'
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
  $uri = if ($Path.StartsWith('http')) { $Path } else { "$BaseUrl$Path" }
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

function Register-User {
  param([string]$Password = 'TestPass1')
  $suffix = (Get-Date -Format 'HHmmss') + (Get-Random -Maximum 9999)
  $phone = "139$suffix".Substring(0, 11)

  $chal = Invoke-Api -Method POST -Path '/auth/captcha/challenge' -Body @{}
  if (-not $chal.captchaId) { throw 'captcha/challenge failed' }
  $cap = Invoke-Api -Method POST -Path '/auth/captcha/verify' -Body @{
    captchaId = $chal.captchaId
    x         = $chal.gapX
  }
  $send = Invoke-Api -Method POST -Path '/auth/send-sms-code' -Body @{
    phone        = $phone
    scene        = 'REGISTER'
    captchaToken = $cap.captchaToken
  }
  $reg = Invoke-Api -Method POST -Path '/auth/register' -Body @{
    phone    = $phone
    password = $Password
    smsCode  = $send.devCode
  }
  if (-not $reg.tokens.accessToken) { throw "register failed phone=$phone" }
  return @{
    phone = $phone
    token = $reg.tokens.accessToken
    userId = $reg.user.id
  }
}

Write-Host ''
Write-Host "=== SOCIAL-02 smoke @ $BaseUrl ===" -ForegroundColor Cyan
Write-Host ''

try {
  $healthBase = $BaseUrl -replace '/v1/?$', ''
  $h = Invoke-RestMethod -Uri "$healthBase/v1/health" -TimeoutSec 5
  Assert-True ($h.ok -eq $true) 'GET /v1/health'
} catch {
  Assert-True $false 'GET /v1/health (is API running?)'
  Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
  exit 1
}

$userA = Register-User
$userB = Register-User
Write-Host "  A=$($userA.userId)  B=$($userB.userId)" -ForegroundColor DarkGray

$post = Invoke-Api -Method POST -Path '/social/posts' -Body @{
  body       = 'SOCIAL-02 smoke like post'
  mediaIds   = @()
  visibility = 'PUBLIC'
} -Token $userA.token
$postId = $post.id
Assert-True ($null -ne $postId -and $post.likeCount -eq 0 -and $post.likedByMe -eq $false) 'create post likeCount=0 likedByMe=false'

$like1 = $null
1..3 | ForEach-Object {
  $like1 = Invoke-Api -Method Put -Path "/social/posts/$postId/like" -Token $userA.token
}
Assert-True ($like1.likeCount -eq 1 -and $like1.likedByMe -eq $true) 'PUT /like x3 -> likeCount=1 likedByMe=true'

$detailA = Invoke-Api -Path "/social/posts/$postId" -Token $userA.token
Assert-True ($detailA.likeCount -eq 1 -and $detailA.likedByMe -eq $true) 'GET detail A likedByMe=true likeCount=1'

$detailB = Invoke-Api -Path "/social/posts/$postId" -Token $userB.token
Assert-True ($detailB.likeCount -eq 1 -and $detailB.likedByMe -eq $false) 'GET detail B likedByMe=false likeCount=1'

$likeB = Invoke-Api -Method Put -Path "/social/posts/$postId/like" -Token $userB.token
Assert-True ($likeB.likeCount -eq 2 -and $likeB.likedByMe -eq $true) 'user B like -> likeCount=2'

$feedA = Invoke-Api -Path '/social/posts?limit=20' -Token $userA.token
$feedB = Invoke-Api -Path '/social/posts?limit=20' -Token $userB.token
$itemA = @($feedA.items) | Where-Object { $_.id -eq $postId } | Select-Object -First 1
$itemB = @($feedB.items) | Where-Object { $_.id -eq $postId } | Select-Object -First 1
Assert-True ($itemA.likedByMe -eq $true -and $itemA.likeCount -eq 2) 'feed A likedByMe=true likeCount=2'
Assert-True ($itemB.likedByMe -eq $true -and $itemB.likeCount -eq 2) 'feed B likedByMe=true likeCount=2'

$unlikeA = $null
1..3 | ForEach-Object {
  $unlikeA = Invoke-Api -Method Delete -Path "/social/posts/$postId/like" -Token $userA.token
}
Assert-True ($unlikeA.likeCount -eq 1 -and $unlikeA.likedByMe -eq $false) 'DELETE /like x3 by A -> likeCount=1 not negative'

$unlikeB = Invoke-Api -Method Delete -Path "/social/posts/$postId/like" -Token $userB.token
Assert-True ($unlikeB.likeCount -eq 0 -and $unlikeB.likedByMe -eq $false) 'DELETE /like by B -> likeCount=0'

$missing = Invoke-Api -Method Put -Path '/social/posts/doesnotexistxxx/like' -Token $userA.token -ExpectError
Assert-True ($missing.code -eq 'SOCIAL_POST_NOT_FOUND') 'like missing post -> SOCIAL_POST_NOT_FOUND'

$privatePost = Invoke-Api -Method POST -Path '/social/posts' -Body @{
  body       = 'SOCIAL-02 private'
  mediaIds   = @()
  visibility = 'PRIVATE'
} -Token $userA.token
$privErr = Invoke-Api -Method Put -Path "/social/posts/$($privatePost.id)/like" -Token $userB.token -ExpectError
Assert-True ($privErr.code -eq 'SOCIAL_POST_NOT_FOUND') 'like others PRIVATE -> SOCIAL_POST_NOT_FOUND'

Write-Host ''
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host ''
if ($failed -gt 0) { exit 1 }
exit 0
