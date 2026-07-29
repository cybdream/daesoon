param([switch]$Force)

$ErrorActionPreference = 'Stop'

$here    = $PSScriptRoot
$fontDir = Join-Path $here 'fonts'

$targets = @('NotoSerifKR-Regular.ttf', 'NotoSerifKR-SemiBold.ttf')
$have = $targets | Where-Object { Test-Path (Join-Path $fontDir $_) }
if ($have.Count -eq $targets.Count -and -not $Force) {
  "정적 폰트가 이미 있습니다 (다시 만들려면 -Force): $fontDir"
  return
}

# 가변 폰트 원본 찾기 — 시스템 설치본 우선, 없으면 사용자 폰트 폴더
$vf = @(
  "$env:WINDIR\Fonts\NotoSerifKR-VF.ttf"
  "$env:LOCALAPPDATA\Microsoft\Windows\Fonts\NotoSerifKR-VF.ttf"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $vf) {
  throw @'
NotoSerifKR-VF.ttf 를 찾을 수 없습니다.
Google Fonts 에서 Noto Serif KR 을 받아 설치한 뒤 다시 실행하세요:
  https://fonts.google.com/noto/specimen/Noto+Serif+KR
'@
}

"원본 가변 폰트: $vf"

python -c "import fontTools" 2>$null
if ($LASTEXITCODE -ne 0) {
  '  fontTools 설치 중...'
  python -m pip install --quiet fonttools
  if ($LASTEXITCODE -ne 0) { throw 'fontTools 설치 실패' }
}

python (Join-Path $here 'make-fonts.py') $vf $fontDir
if ($LASTEXITCODE -ne 0) { throw '폰트 인스턴스 생성 실패' }

"정적 폰트 생성 완료: $fontDir"
