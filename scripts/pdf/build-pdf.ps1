param([switch]$ForceFonts)

$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot

'[1/3] 정적 폰트 준비'
& (Join-Path $here 'make-fonts.ps1') -Force:$ForceFonts

'[2/3] HTML 조판본 생성'
& (Join-Path $here 'build-html.ps1')

'[3/3] 헤드리스 크롬으로 PDF 출력'
& (Join-Path $here 'print-pdf.ps1')

$pdf = Join-Path $here 'out\jeongyeong.pdf'
if (Test-Path $pdf) {
  ''
  "완료: $pdf ({0:N0} bytes)" -f (Get-Item $pdf).Length
  'Type 3 폰트가 없는지 확인하려면: pdffonts out\jeongyeong.pdf'
}
