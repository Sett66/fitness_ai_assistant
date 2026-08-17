# SOCIAL-03 smoke: comments + commentCount + parentId + soft-delete
# Usage (repo root, API running):
#   .\scripts\social-03-smoke.ps1
#   .\scripts\social-03-smoke.ps1 -BaseUrl 'http://127.0.0.1:3000/v1'

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
    $status = $null
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status -eq 204) { return $null }
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
    phone  = $phone
    token  = $reg.tokens.accessToken
    userId = $reg.user.id
  }
}

Write-Host ''
Write-Host "=== SOCIAL-03 smoke @ $BaseUrl ===" -ForegroundColor Cyan
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
  body       = 'SOCIAL-03 smoke comments'
  mediaIds   = @()
  visibility = 'PUBLIC'
} -Token $userA.token
$postId = $post.id
Assert-True ($null -ne $postId -and $post.commentCount -eq 0) 'create post commentCount=0'

$c1 = Invoke-Api -Method POST -Path "/social/posts/$postId/comments" -Body @{ body = 'first' } -Token $userA.token
$c2 = Invoke-Api -Method POST -Path "/social/posts/$postId/comments" -Body @{ body = 'second' } -Token $userB.token
$c3 = Invoke-Api -Method POST -Path "/social/posts/$postId/comments" -Body @{ body = 'third' } -Token $userA.token
$reply = Invoke-Api -Method POST -Path "/social/posts/$postId/comments" -Body @{
  body     = 'reply to first'
  parentId = $c1.id
} -Token $userB.token

$afterCreate = Invoke-Api -Path "/social/posts/$postId" -Token $userA.token
Assert-True ($afterCreate.commentCount -eq 4) '4 comments -> commentCount=4'
Assert-True ($reply.replyToName -eq $c1.author.displayName -and $reply.parentId -eq $c1.id) 'reply renders replyToName'

$otherPost = Invoke-Api -Method POST -Path '/social/posts' -Body @{
  body       = 'SOCIAL-03 other post'
  mediaIds   = @()
  visibility = 'PUBLIC'
} -Token $userA.token
$otherComment = Invoke-Api -Method POST -Path "/social/posts/$($otherPost.id)/comments" -Body @{
  body = 'on other post'
} -Token $userA.token
$cross = Invoke-Api -Method POST -Path "/social/posts/$postId/comments" -Body @{
  body     = 'cross post parent'
  parentId = $otherComment.id
} -Token $userA.token -ExpectError
Assert-True ($cross.code -eq 'SOCIAL_COMMENT_NOT_FOUND') 'parentId from another post -> SOCIAL_COMMENT_NOT_FOUND'

$page1 = Invoke-Api -Path "/social/posts/$postId/comments?limit=2" -Token $userA.token
$page2 = Invoke-Api -Path "/social/posts/$postId/comments?limit=2&cursor=$($page1.nextCursor)" -Token $userA.token
$ids1 = @($page1.items | ForEach-Object { $_.id })
$ids2 = @($page2.items | ForEach-Object { $_.id })
$overlap = $ids1 | Where-Object { $ids2 -contains $_ }
Assert-True ($page1.items.Count -eq 2 -and $null -ne $page1.nextCursor) 'page1 limit=2 has nextCursor'
Assert-True ($overlap.Count -eq 0) 'pages have no overlapping ids'
Assert-True ($ids1[0] -eq $c1.id -and $ids1[1] -eq $c2.id) 'comments ordered createdAt asc'

Invoke-Api -Method DELETE -Path "/social/comments/$($c3.id)" -Token $userA.token | Out-Null
$afterDelete = Invoke-Api -Path "/social/posts/$postId" -Token $userA.token
Assert-True ($afterDelete.commentCount -eq 3) 'soft-delete own comment -> commentCount=3'

$dupDel = Invoke-Api -Method DELETE -Path "/social/comments/$($c3.id)" -Token $userA.token -ExpectError
Assert-True ($dupDel.code -eq 'SOCIAL_COMMENT_NOT_FOUND') 'repeat DELETE -> SOCIAL_COMMENT_NOT_FOUND'
$afterDup = Invoke-Api -Path "/social/posts/$postId" -Token $userA.token
Assert-True ($afterDup.commentCount -eq 3) 'repeat DELETE does not decrement again'

$listed = Invoke-Api -Path "/social/posts/$postId/comments?limit=20" -Token $userA.token
$listedIds = @($listed.items | ForEach-Object { $_.id })
Assert-True ($listedIds -notcontains $c3.id) 'soft-deleted comment not in list'
Assert-True ($listed.items.Count -eq 3) 'list length matches live comments'

$likeA = $null
1..3 | ForEach-Object {
  $likeA = Invoke-Api -Method Put -Path "/social/comments/$($c2.id)/like" -Token $userA.token
}
Assert-True ($likeA.likeCount -eq 1 -and $likeA.likedByMe -eq $true) 'PUT comment like x3 -> likeCount=1'

$likeB = Invoke-Api -Method Put -Path "/social/comments/$($c2.id)/like" -Token $userB.token
Assert-True ($likeB.likeCount -eq 2 -and $likeB.likedByMe -eq $true) 'user B comment like -> likeCount=2'

$listA = Invoke-Api -Path "/social/posts/$postId/comments?limit=20" -Token $userA.token
$listB = Invoke-Api -Path "/social/posts/$postId/comments?limit=20" -Token $userB.token
$rowA = @($listA.items) | Where-Object { $_.id -eq $c2.id } | Select-Object -First 1
$rowB = @($listB.items) | Where-Object { $_.id -eq $c2.id } | Select-Object -First 1
Assert-True ($rowA.likedByMe -eq $true -and $rowA.likeCount -eq 2) 'list A likedByMe=true likeCount=2'
Assert-True ($rowB.likedByMe -eq $true -and $rowB.likeCount -eq 2) 'list B likedByMe=true likeCount=2'

$unlikeA = $null
1..3 | ForEach-Object {
  $unlikeA = Invoke-Api -Method Delete -Path "/social/comments/$($c2.id)/like" -Token $userA.token
}
Assert-True ($unlikeA.likeCount -eq 1 -and $unlikeA.likedByMe -eq $false) 'DELETE comment like x3 by A -> likeCount=1'

$unlikeB = Invoke-Api -Method Delete -Path "/social/comments/$($c2.id)/like" -Token $userB.token
Assert-True ($unlikeB.likeCount -eq 0 -and $unlikeB.likedByMe -eq $false) 'DELETE comment like by B -> likeCount=0'

$goneLike = Invoke-Api -Method Put -Path "/social/comments/$($c3.id)/like" -Token $userA.token -ExpectError
Assert-True ($goneLike.code -eq 'SOCIAL_COMMENT_NOT_FOUND') 'like deleted comment -> SOCIAL_COMMENT_NOT_FOUND'

Invoke-Api -Method DELETE -Path "/social/comments/$($c1.id)" -Token $userA.token | Out-Null
$afterParentGone = Invoke-Api -Path "/social/posts/$postId/comments?limit=20" -Token $userA.token
$replyRow = @($afterParentGone.items) | Where-Object { $_.id -eq $reply.id } | Select-Object -First 1
Assert-True ($null -ne $replyRow -and $replyRow.replyToName -eq $null -and $replyRow.parentId -eq $c1.id) 'parent deleted -> reply still listed, prefix gone'
$finalPost = Invoke-Api -Path "/social/posts/$postId" -Token $userA.token
Assert-True ($finalPost.commentCount -eq 2) 'final commentCount=2 (4 created - 2 deleted)'

$othersDel = Invoke-Api -Method DELETE -Path "/social/comments/$($c2.id)" -Token $userA.token -ExpectError
Assert-True ($othersDel.code -eq 'SOCIAL_COMMENT_NOT_FOUND') 'cannot delete others comment'

Write-Host ''
Write-Host "=== Done: $passed passed, $failed failed ===" -ForegroundColor Cyan
Write-Host ''
if ($failed -gt 0) { exit 1 }
exit 0
