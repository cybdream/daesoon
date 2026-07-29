param(
  # pwsh -File 로 넘기면 배열 인자가 뭉개지므로 문자열로 받아 직접 나눈다
  [string]$Pages = '1,2,3',
  [double]$Scale = 2.0
)

# Paged.js 로 조판된 페이지를 PDF 로 굽기 전에 PNG 로 떠서 눈으로 확인한다.
# CSS 를 손봤을 때 레이아웃이 깨지지 않았는지 보는 용도이며, 완성된 PDF 를
# 렌더링하는 것과는 단계가 다르다.
#
#   pwsh -File scripts/pdf/shot-page.ps1                    # 1~3 페이지
#   pwsh -File scripts/pdf/shot-page.ps1 -Pages "1,12,219"  # 특정 페이지
#   pwsh -File scripts/pdf/shot-page.ps1 -Pages "5" -Scale 3

$ErrorActionPreference = 'Stop'

$pageList = $Pages -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [int]$_ }
if (-not $pageList) { throw "페이지 번호를 해석하지 못했습니다: $Pages" }

$here    = $PSScriptRoot
$outDir  = Join-Path $here 'out'
$shotDir = Join-Path $outDir 'shots'

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome 을 찾을 수 없습니다.' }

$htmlPath = Join-Path $outDir 'jeongyeong.html'
if (-not (Test-Path $htmlPath)) { throw "HTML 이 없습니다. 먼저 build-html.ps1 을 실행하세요: $htmlPath" }

$html = 'file:///' + ($htmlPath -replace '\\', '/')
$udd  = Join-Path $outDir 'chrome-profile-shot'
$port = 9334   # print-pdf.ps1 의 9333 과 겹치지 않게

New-Item -ItemType Directory -Force -Path $shotDir | Out-Null

$proc = Start-Process $chrome -PassThru -WindowStyle Hidden -ArgumentList @(
  '--headless=new'
  '--disable-gpu'
  '--no-first-run'
  '--no-default-browser-check'
  '--disable-extensions'
  '--hide-scrollbars'
  # file:// 문서에서 file:// 웹폰트(@font-face)를 로드하려면 필요
  '--allow-file-access-from-files'
  '--window-size=900,1400'
  "--user-data-dir=$udd"
  "--remote-debugging-port=$port"
  'about:blank'
)

try {
  # --- DevTools 엔드포인트 대기 ---
  $ver = $null
  for ($i = 0; $i -lt 60; $i++) {
    try { $ver = Invoke-RestMethod "http://127.0.0.1:$port/json/version" -TimeoutSec 2; break }
    catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ver) { throw 'DevTools endpoint did not come up' }
  "Chrome: $($ver.Browser)"

  $tab = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$port/json/new?$([uri]::EscapeDataString($html))" -TimeoutSec 10
  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $ws.Options.SetBuffer(16MB, 64KB)
  [void]$ws.ConnectAsync([uri]$tab.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

  $script:msgId = 0
  function Send-Cdp([string]$method, [hashtable]$params = @{}) {
    $script:msgId++
    $payload = @{ id = $script:msgId; method = $method; params = $params } | ConvertTo-Json -Depth 10 -Compress
    $buf = [System.Text.Encoding]::UTF8.GetBytes($payload)
    [void]$ws.SendAsync(
      [ArraySegment[byte]]::new($buf),
      [System.Net.WebSockets.WebSocketMessageType]::Text,
      $true, [Threading.CancellationToken]::None
    ).GetAwaiter().GetResult()
    return $script:msgId
  }

  function Receive-Cdp([int]$waitId, [int]$timeoutSec = 300) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
      $ms  = [System.IO.MemoryStream]::new()
      $seg = [ArraySegment[byte]]::new([byte[]]::new(64KB))
      do {
        $res = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        $ms.Write($seg.Array, 0, $res.Count)
      } while (-not $res.EndOfMessage)
      $text = [System.Text.Encoding]::UTF8.GetString($ms.ToArray())
      $ms.Dispose()
      $obj = $text | ConvertFrom-Json
      if ($obj.id -eq $waitId) { return $obj }
    }
    throw "timeout waiting for CDP message id=$waitId"
  }

  function Invoke-Cdp([string]$method, [hashtable]$params = @{}, [int]$timeoutSec = 300) {
    $id = Send-Cdp $method $params
    $r  = Receive-Cdp $id $timeoutSec
    if ($r.error) { throw "$method failed: $($r.error.message)" }
    return $r.result
  }

  [void](Invoke-Cdp 'Page.enable')
  [void](Invoke-Cdp 'Runtime.enable')

  # --- paged.js 조판 완료 대기 ---
  $t0 = Get-Date
  $total = 0
  for ($i = 0; $i -lt 480; $i++) {
    $r = Invoke-Cdp 'Runtime.evaluate' @{
      expression    = 'JSON.stringify({done: !!window.__PAGED_DONE__, pages: document.querySelectorAll(".pagedjs_page").length})'
      returnByValue = $true
    } 60
    $st = $r.result.value | ConvertFrom-Json
    if ($st.done) {
      $total = $st.pages
      "paged.js done: $total pages in $([int]((Get-Date)-$t0).TotalSeconds)s"
      break
    }
    Start-Sleep -Seconds 2
  }
  if (-not $total) { throw 'paged.js did not finish in time' }

  # --- 페이지별 캡처 ---
  foreach ($n in $pageList) {
    if ($n -lt 1 -or $n -gt $total) {
      "  건너뜀: $n 페이지 (전체 $total 페이지)"
      continue
    }

    $expr = @"
(() => {
  const el = document.querySelectorAll('.pagedjs_page')[$($n - 1)];
  if (!el) { return null; }
  const r = el.getBoundingClientRect();
  return JSON.stringify({
    x: r.left + window.scrollX,
    y: r.top + window.scrollY,
    w: r.width,
    h: r.height
  });
})()
"@
    $r = Invoke-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true } 60
    if (-not $r.result.value) { "  건너뜀: $n 페이지 (요소 없음)"; continue }
    $box = $r.result.value | ConvertFrom-Json

    $shot = Invoke-Cdp 'Page.captureScreenshot' @{
      format                = 'png'
      captureBeyondViewport = $true
      clip                  = @{
        x = $box.x; y = $box.y; width = $box.w; height = $box.h; scale = $Scale
      }
    } 120

    $path = Join-Path $shotDir ('page-{0:D3}.png' -f $n)
    [System.IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($shot.data))
    "  page-{0:D3}.png  {1:N0}x{2:N0}pt @{3}x  ({4:N0} bytes)" -f `
      $n, $box.w, $box.h, $Scale, (Get-Item $path).Length
  }

  $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  ''
  "저장 위치: $shotDir"
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
}
