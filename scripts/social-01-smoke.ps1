# SOCIAL-01 smoke: posts / feed / visibility / media / privacy DTO
# Usage (repo root, API running; image tests need MinIO + curl):
#   .\scripts\social-01-smoke.ps1
#   .\scripts\social-01-smoke.ps1 -BaseUrl 'http://127.0.0.1:3000/v1'

param(
  [string]$BaseUrl = 'http://127.0.0.1:3000/v1',
  [string]$PostgresContainer = 'fitness-postgres',
  [string]$PostgresUser = 'fitness',
  [string]$PostgresDb = 'fitness'
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
      return @{ raw = $_.Exception.Message }
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
    phone       = $phone
    password    = $Password
    token       = $reg.tokens.accessToken
    userId      = $reg.user.id
    displayName = $reg.user.displayName
  }
}

function Upload-PostImage {
  param([string]$Token)
  $sign = Invoke-Api -Method POST -Path '/uploads/sign' -Body @{
    mime      = 'image/jpeg'
    sizeBytes = 128
    scope     = 'POST_IMAGE'
  } -Token $Token
  if (-not $sign.uploadUrl -or -not $sign.objectKey) {
    throw 'POST /uploads/sign missing uploadUrl or objectKey'
  }

  $tmpFile = [System.IO.Path]::GetTempFileName()
  [System.IO.File]::WriteAllBytes($tmpFile, [byte[]](0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46))
  $putUrl = $sign.uploadUrl -replace '://localhost:', '://127.0.0.1:'
  $curlArgs = @('-sS', '--max-time', '15', '-X', 'PUT', '-H', 'Content-Type: image/jpeg', '--data-binary', "@$tmpFile", $putUrl)
  & curl.exe @curlArgs | Out-Null
  Remove-Item $tmpFile -Force
  if ($LASTEXITCODE -ne 0) {
    throw "MinIO PUT failed (curl exit $LASTEXITCODE); is minio up?"
  }

  $done = Invoke-Api -Method POST -Path '/uploads/complete' -Body @{ objectKey = $sign.objectKey } -Token $Token
  if (-not $done.mediaId) { throw 'POST /uploads/complete missing mediaId' }
  return $done.mediaId
}

function Set-MediaStatus {
  param(
    [string]$MediaId,
    [ValidateSet('PENDING', 'READY', 'DELETED')]
    [string]$Status
  )
  if ($MediaId -notmatch '^[a-z0-9]+$') { throw "invalid mediaId: $MediaId" }
  $sql = "UPDATE `"Media`" SET status = '$Status' WHERE id = '$MediaId';"
  $sql | & docker exec -i $PostgresContainer psql -U $PostgresUser -d $PostgresDb -q 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "docker exec $PostgresContainer failed (need postgres container for PENDING test)"
  }
}

function Test-JsonHasNoPhone([object]$Obj) {
  $json = $Obj | ConvertTo-Json -Depth 12 -Compress
  return ($json -notmatch '"phone"\s*:')
}

Write-Host ''
Write-Host "=== SOCIAL-01 smoke @ $BaseUrl ===" -ForegroundColor Cyan
Write-Host ''

try {
  $healthBase = $BaseUrl -replace '/v1/?$', ''
  $h = Invoke-RestMethod -Uri "$healthBase/v1/health" -TimeoutSec 5
  Assert-True ($h.ok -eq $true) 'GET /v1/health'
} catch {
  Assert-True $false 'GET /v1/health (is API running?)'
}

Write-Host '-- user A (null displayName) --' -ForegroundColor DarkGray
$userA = Register-User
Write-Host "  phone=$($userA.phone) userId=$($userA.userId)" -ForegroundColor DarkGray

$textPost = Invoke-Api -Method POST -Path '/social/posts' -Body @{
  body       = 'SOCIAL-01 smoke text post'
  mediaIds   = @()
  visibility = 'PUBLIC'
} -Token $userA.token
Assert-True ($null -ne $textPost.id -and $textPost.body -like '*text post*') 'POST /social/posts text-only'
Assert-True ($textPost.imageUrls.Count -eq 0) 'text post imageUrls empty'
Assert-True ($textPost.isMine -eq $true) 'text post isMine=true'

$mediaIdA = $null
try {
  $mediaIdA = Upload-PostImage -Token $userA.token
  $imgPost = Invoke-Api -Method POST -Path '/social/posts' -Body @{
    body       = 'SOCIAL-01 smoke image post'
    mediaIds   = @($mediaIdA)
    visibility = 'PUBLIC'
  } -Token $userA.token
  Assert-True ($imgPost.imageUrls.Count -ge 1) 'POST /social/posts with image (imageUrls non-empty)'
  $imgJson = $imgPost | ConvertTo-Json -Depth 8 -Compress
  Assert-True ($imgJson -notmatch '"mediaIds"') 'image post response has no mediaIds field'
} catch {
  Write-Host "[SKIP] image post: $($_.Exception.Message)" -ForegroundColor Yellow
  $script:failed++
  Write-Host '[FAIL] POST /social/posts with image (needs MinIO + curl)' -ForegroundColor Red
}

$visErr = Invoke-Api -Method POST -Path '/social/posts' -Body @{
  body       = 'should fail'
  visibility = 'FOLLOWERS'
} -Token $userA.token -ExpectError
Assert-True ($visErr.code -eq 'SOCIAL_VISIBILITY_UNSUPPORTED') 'visibility=FOLLOWERS -> SOCIAL_VISIBILITY_UNSUPPORTED'

Assert-True (Test-JsonHasNoPhone $textPost) 'post response JSON has no phone'
$feed = Invoke-Api -Path '/social/posts?limit=5' -Token $userA.token
Assert-True (Test-JsonHasNoPhone $feed) 'feed response JSON has no phone'

$suffix4 = $userA.userId.Substring($userA.userId.Length - 4)
Assert-True ($textPost.author.displayName.EndsWith($suffix4)) "displayName ends with userId suffix $suffix4"
Assert-True ($textPost.author.displayName -notmatch '^1[3-9]\d{9}$') 'displayName is not phone number'

if ($mediaIdA) {
  Write-Host '-- user B (steal mediaId) --' -ForegroundColor DarkGray
  $userB = Register-User
  $stealErr = Invoke-Api -Method POST -Path '/social/posts' -Body @{
    body       = 'stolen image'
    mediaIds   = @($mediaIdA)
    visibility = 'PUBLIC'
  } -Token $userB.token -ExpectError
  Assert-True ($stealErr.code -eq 'SOCIAL_MEDIA_INVALID') 'other user mediaId -> SOCIAL_MEDIA_INVALID'

  try {
    $mediaIdPending = Upload-PostImage -Token $userA.token
    Set-MediaStatus -MediaId $mediaIdPending -Status 'PENDING'
    $pendingErr = Invoke-Api -Method POST -Path '/social/posts' -Body @{
      body       = 'pending image'
      mediaIds   = @($mediaIdPending)
      visibility = 'PUBLIC'
    } -Token $userA.token -ExpectError
    Assert-True ($pendingErr.code -eq 'SOCIAL_MEDIA_INVALID') 'PENDING mediaId -> SOCIAL_MEDIA_INVALID'
    Set-MediaStatus -MediaId $mediaIdPending -Status 'READY'
  } catch {
    Write-Host "[SKIP] PENDING media: $($_.Exception.Message)" -ForegroundColor Yellow
    Assert-True $false 'PENDING mediaId -> SOCIAL_MEDIA_INVALID (needs docker postgres)'
  }
} else {
  Write-Host '[SKIP] steal/PENDING media tests (image upload failed)' -ForegroundColor Yellow
}

Write-Host ''
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host ''
if ($failed -gt 0) { exit 1 }
exit 0
