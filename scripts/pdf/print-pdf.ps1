$ErrorActionPreference = 'Stop'

$here   = $PSScriptRoot
$outDir = Join-Path $here 'out'

$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Chrome 을 찾을 수 없습니다.' }

$htmlPath = Join-Path $outDir 'jeongyeong.html'
if (-not (Test-Path $htmlPath)) { throw "HTML 이 없습니다. 먼저 build-html.ps1 을 실행하세요: $htmlPath" }

$html = 'file:///' + ($htmlPath -replace '\\', '/')
$pdf  = Join-Path $outDir 'jeongyeong.pdf'
$udd  = Join-Path $outDir 'chrome-profile'
$port = 9333

Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $chrome -and $_.CommandLine -like "*$port*" } |
  Stop-Process -Force -ErrorAction SilentlyContinue

$proc = Start-Process $chrome -PassThru -WindowStyle Hidden -ArgumentList @(
  '--headless=new'
  '--disable-gpu'
  '--no-first-run'
  '--no-default-browser-check'
  '--disable-extensions'
  # file:// 문서에서 file:// 웹폰트(@font-face)를 로드하려면 필요
  '--allow-file-access-from-files'
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

  # --- 새 탭 열기 ---
  $tab = Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:$port/json/new?$([uri]::EscapeDataString($html))" -TimeoutSec 10
  $wsUrl = $tab.webSocketDebuggerUrl
  "target: $($tab.id)"

  $ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $ws.Options.SetBuffer(16MB, 64KB)
  [void]$ws.ConnectAsync([uri]$wsUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()

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

  function Receive-Cdp([int]$waitId, [int]$timeoutSec = 900) {
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

  function Invoke-Cdp([string]$method, [hashtable]$params = @{}, [int]$timeoutSec = 900) {
    $id = Send-Cdp $method $params
    $r  = Receive-Cdp $id $timeoutSec
    if ($r.error) { throw "$method failed: $($r.error.message)" }
    return $r.result
  }

  [void](Invoke-Cdp 'Page.enable')
  [void](Invoke-Cdp 'Runtime.enable')

  # --- paged.js 완료 대기 ---
  $t0 = Get-Date
  $done = $false
  for ($i = 0; $i -lt 480; $i++) {
    $r = Invoke-Cdp 'Runtime.evaluate' @{
      expression    = 'JSON.stringify({done: !!window.__PAGED_DONE__, pages: document.querySelectorAll(".pagedjs_page").length, ready: document.readyState})'
      returnByValue = $true
    } 60
    $st = $r.result.value | ConvertFrom-Json
    if ($st.done) {
      "paged.js done: $($st.pages) pages in $([int]((Get-Date)-$t0).TotalSeconds)s"
      $done = $true; break
    }
    if ($i % 10 -eq 0) { "  ... laying out: $($st.pages) pages ($([int]((Get-Date)-$t0).TotalSeconds)s)" }
    Start-Sleep -Seconds 2
  }
  if (-not $done) { throw 'paged.js did not finish in time' }

  # --- PDF 출력 ---
  $r = Invoke-Cdp 'Page.printToPDF' @{
    printBackground   = $true
    preferCSSPageSize = $true
    marginTop         = 0
    marginBottom      = 0
    marginLeft        = 0
    marginRight       = 0
  } 900

  [System.IO.File]::WriteAllBytes($pdf, [Convert]::FromBase64String($r.data))
  "PDF written: $pdf ({0:N0} bytes)" -f (Get-Item $pdf).Length

  $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Get-Process chrome -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $chrome } |
    Where-Object { $_.StartTime -gt $PID } |
    Out-Null
}
