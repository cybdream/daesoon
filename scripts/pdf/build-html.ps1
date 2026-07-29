$ErrorActionPreference = 'Stop'

# 레포 안에서 자기 위치를 기준으로 경로를 잡는다 (절대경로 하드코딩 금지)
$here    = $PSScriptRoot
$repo    = (Resolve-Path (Join-Path $here '..\..')).Path
$fontDir = Join-Path $here 'fonts'
$outDir  = Join-Path $here 'out'
$out     = Join-Path $outDir 'jeongyeong.html'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not (Test-Path (Join-Path $fontDir 'NotoSerifKR-Regular.ttf'))) {
  throw "정적 폰트가 없습니다. 먼저 make-fonts.ps1 을 실행하세요: $fontDir"
}

$json = Get-Content (Join-Path $repo 'data\scriptures.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$verses = $json.verses | Sort-Object order

# 편 이름 -> 한자
$hanja = @{
  '행록' = '行錄'; '공사' = '公事'; '교운' = '敎運'; '교법' = '敎法'
  '권지' = '權智'; '제생' = '濟生'; '예시' = '豫示'
}

function Esc([string]$s) {
  $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;')
}

# 편 -> 장 -> 절 구조로 묶기 (원본 order 순서 유지)
$sections = [System.Collections.Generic.List[object]]::new()
$curSec = $null; $curCh = $null
foreach ($v in $verses) {
  if ($null -eq $curSec -or $curSec.name -ne $v.section) {
    $curSec = [pscustomobject]@{ name = $v.section; chapters = [System.Collections.Generic.List[object]]::new() }
    $sections.Add($curSec); $curCh = $null
  }
  if ($null -eq $curCh -or $curCh.num -ne $v.chapter) {
    $curCh = [pscustomobject]@{ num = $v.chapter; verses = [System.Collections.Generic.List[object]]::new() }
    $curSec.chapters.Add($curCh)
  }
  $curCh.verses.Add($v)
}

$sb = [System.Text.StringBuilder]::new(4MB)
function W([string]$s) { [void]$sb.AppendLine($s) }

$genDate = ([datetime]$json.generatedAt).ToString('yyyy년 M월 d일')
$totalVerses = $verses.Count

W '<!DOCTYPE html>'
W '<html lang="ko"><head><meta charset="utf-8"><title>전경 典經</title>'
W @'
<script>
// 조판이 끝난 뒤 각 페이지 위쪽 여백 상자에 머리말을 채운다.
// 규칙: 페이지에 진입한 시점의 편·장을 표시하고, 표지/목차와 편 표제가 시작되는
// 페이지에는 머리말을 넣지 않는다.
function applyRunningHeads() {
  var pages = document.querySelectorAll('.pagedjs_page');
  var sec = '', chap = '';
  for (var i = 0; i < pages.length; i++) {
    var pg = pages[i];
    var body = pg.querySelector('.pagedjs_page_content');
    var box = pg.querySelector('.pagedjs_margin-top-center .pagedjs_margin-content');
    if (!body) { continue; }

    var secHeads = body.querySelectorAll('.section-head h1');
    var chapHeads = body.querySelectorAll('.chapter > h2');

    var entrySec = sec || (secHeads.length ? secHeads[0].textContent.trim() : '');
    var entryChap = chap || (chapHeads.length ? chapHeads[0].textContent.trim() : '');

    if (secHeads.length) { sec = secHeads[secHeads.length - 1].textContent.trim(); }
    if (chapHeads.length) { chap = chapHeads[chapHeads.length - 1].textContent.trim(); }

    if (!box) { continue; }
    var isFront = !!body.querySelector('.cover, .toc');
    var opensSection = secHeads.length > 0;
    if (isFront || opensSection || !entrySec) {
      box.removeAttribute('data-rh');
    } else {
      box.setAttribute('data-rh', entrySec + '  ·  ' + entryChap);
    }
  }
}
window.PagedConfig = {
  auto: true,
  after: function () {
    applyRunningHeads();
    window.__PAGED_DONE__ = true;
  }
};
</script>
'@
$pagedUrl = 'file:///' + ((Join-Path $here 'paged.polyfill.js') -replace '\\', '/')
W "<script src=`"$pagedUrl`"></script>"
W '<style>'

# 시스템의 NotoSerifKR-VF.ttf 는 가변 폰트라 Skia 가 PDF 에 Type 3 로 굽는다.
# fonts\ 의 정적 인스턴스(400/600)를 웹폰트로 물려 CID TrueType 임베딩을 강제한다.
$fontUrl = $fontDir -replace '\\', '/'
W @"
@font-face {
  font-family: "Noto Serif KR";
  src: url("file:///$fontUrl/NotoSerifKR-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
}
@font-face {
  font-family: "Noto Serif KR";
  src: url("file:///$fontUrl/NotoSerifKR-SemiBold.ttf") format("truetype");
  font-weight: 600;
  font-style: normal;
}
"@

W @'
@page {
  size: 148mm 210mm;
  margin: 17mm 14mm 16mm 14mm;
  /* 실제 머리말 문자열은 paged.js 조판 후 data-rh 속성으로 주입한다
     (이 빌드의 paged.js는 string-set 을 지원하지 않음) */
  @top-center {
    content: " ";
    padding-bottom: 4mm;
  }
  @bottom-center {
    content: counter(page);
    font-family: "맑은 고딕", sans-serif;
    font-size: 8pt; color: #6b6257;
    padding-top: 5mm;
  }
}
@page cover {
  margin: 0;
  @top-center { content: none; }
  @bottom-center { content: none; }
}
@page front {
  @top-center { content: none; }
}

.pagedjs_margin-top-center .pagedjs_margin-content::after {
  content: attr(data-rh) !important;
  font-family: "맑은 고딕", sans-serif;
  font-size: 7.5pt;
  letter-spacing: .08em;
  color: #9a8f80;
  white-space: pre;
}

* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  font-family: "Noto Serif KR", "바탕", serif;
  font-size: 10.2pt;
  line-height: 1.78;
  color: #1c1a17;
  word-break: keep-all;
  overflow-wrap: break-word;
}

/* ---------- 표지 ---------- */
.cover {
  page: cover;
  break-after: page;
  height: 210mm; width: 148mm;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  background: #f6f2ea;
  border-top: 9mm solid #6b3f2a;
  padding: 0 20mm;
}
.cover .rule { width: 42mm; height: 1px; background: #b9a88f; margin: 9mm 0; }
.cover h1 {
  font-size: 40pt; font-weight: 600; margin: 0;
  letter-spacing: .3em; text-indent: .3em; color: #4a2c1c;
}
.cover .hanja {
  font-size: 15pt; color: #8a6a4f; margin-top: 5mm;
  letter-spacing: .55em; text-indent: .55em;
}
.cover .sub {
  font-family: "맑은 고딕", sans-serif;
  font-size: 9.5pt; color: #6f6355; line-height: 2;
}
.cover .meta {
  position: absolute; bottom: 20mm; left: 0; right: 0;
  font-family: "맑은 고딕", sans-serif;
  font-size: 7.5pt; color: #9a8f80; line-height: 1.9;
}

/* ---------- 목차 ---------- */
.toc { page: front; break-after: page; }
.toc > h2 {
  font-family: "맑은 고딕", sans-serif;
  font-size: 15pt; font-weight: 600; color: #4a2c1c;
  letter-spacing: .35em; text-indent: .35em;
  text-align: center; margin: 0 0 4mm;
}
.toc > h2 + .rule { width: 26mm; height: 1px; background: #c8b8a0; margin: 0 auto 9mm; }
.toc ul { list-style: none; margin: 0; padding: 0; }
.toc .sec-item { margin-top: 5.5mm; }
.toc .sec-item:first-child { margin-top: 0; }
.toc-link {
  display: flex; align-items: baseline;
  text-decoration: none; color: inherit;
}
.toc-link .dots {
  flex: 1; border-bottom: 1px dotted #cfc3b0;
  margin: 0 2.5mm; position: relative; top: -3px;
}
.toc-link::after {
  content: target-counter(attr(href), page);
  font-family: "맑은 고딕", sans-serif;
  font-size: 8.5pt; color: #6b6257;
}
.toc .sec-link { font-size: 11.5pt; font-weight: 600; color: #4a2c1c; }
.toc .sec-link .han {
  font-size: 8pt; color: #a0917d; margin-left: 2mm; font-weight: 400;
}
.toc .ch-list { margin: 1.5mm 0 0 6mm; }
.toc .ch-link { font-size: 9.3pt; color: #40382e; padding: .6mm 0; }

/* ---------- 편 표제 ---------- */
.section { break-before: page; }
.section-head {
  text-align: center;
  padding: 26mm 0 14mm;
  break-after: avoid;
}
.section-head h1 {
  font-size: 24pt; font-weight: 600; margin: 0;
  letter-spacing: .3em; text-indent: .3em; color: #4a2c1c;
}
.section-head .han {
  font-family: "바탕", serif;
  font-size: 11pt; color: #8a6a4f; margin-top: 4mm;
  letter-spacing: .4em; text-indent: .4em;
}
.section-head .cnt {
  font-family: "맑은 고딕", sans-serif;
  font-size: 7.5pt; color: #a89c8b; margin-top: 6mm; letter-spacing: .1em;
}
.section-head .rule { width: 22mm; height: 1px; background: #c8b8a0; margin: 8mm auto 0; }

/* ---------- 장 ---------- */
.chapter { break-inside: auto; }
.chapter > h2 {
  font-family: "맑은 고딕", sans-serif;
  font-size: 11pt; font-weight: 600; color: #6b3f2a;
  letter-spacing: .18em;
  margin: 9mm 0 4.5mm;
  padding-bottom: 2mm;
  border-bottom: 1px solid #ddd0bc;
  break-after: avoid;
}
.chapter:first-of-type > h2 { margin-top: 2mm; }

/* ---------- 절 ---------- */
.v {
  margin: 0 0 3.2mm;
  padding-left: 7.5mm;
  text-indent: -7.5mm;
  /* keep-all 상태에서 justify 를 쓰면 한자 괄호 묶음 때문에 어절 간격이 크게 벌어진다 */
  text-align: left;
  orphans: 2; widows: 2;
}
.vn {
  display: inline-block;
  width: 7.5mm;
  text-indent: 0;
  font-family: "맑은 고딕", sans-serif;
  font-size: 7.8pt;
  color: #a8724e;
  vertical-align: baseline;
}
'@
W '</style></head><body>'

# ---------- 표지 ----------
W '<section class="cover">'
W '  <h1>전경</h1>'
W '  <div class="hanja">典經</div>'
W '  <div class="rule"></div>'
W ('  <div class="sub">전 {0}편 · 총 {1}절<br>디지털 정본 인쇄판</div>' -f $sections.Count, $totalVerses)
W ('  <div class="meta">데이터 버전 {0}<br>{1} 생성<br>github.com/cybdream/daesoon</div>' -f (Esc $json.version), $genDate)
W '</section>'

# ---------- 목차 ----------
W '<nav class="toc">'
W '  <h2>목차</h2><div class="rule"></div>'
W '  <ul>'
$si = 0
foreach ($s in $sections) {
  $sid = "sec-$si"
  $vc = ($s.chapters | ForEach-Object { $_.verses.Count } | Measure-Object -Sum).Sum
  W '    <li class="sec-item">'
  W ('      <a class="toc-link sec-link" href="#{0}"><span>{1}<span class="han">{2}</span></span><span class="dots"></span></a>' -f $sid, (Esc $s.name), $hanja[$s.name])
  W '      <ul class="ch-list">'
  foreach ($c in $s.chapters) {
    W ('        <li><a class="toc-link ch-link" href="#ch-{0}-{1}"><span>제{1}장 <span style="color:#9a8f80">({2}절)</span></span><span class="dots"></span></a></li>' -f $si, $c.num, $c.verses.Count)
  }
  W '      </ul>'
  W '    </li>'
  $si++
}
W '  </ul>'
W '</nav>'

# ---------- 본문 ----------
$si = 0
foreach ($s in $sections) {
  $vc = ($s.chapters | ForEach-Object { $_.verses.Count } | Measure-Object -Sum).Sum
  W ('<section class="section" id="sec-{0}">' -f $si)
  W '  <header class="section-head">'
  W ('    <h1>{0}</h1>' -f (Esc $s.name))
  W ('    <div class="han">{0}</div>' -f $hanja[$s.name])
  W ('    <div class="cnt">전 {0}장 · {1}절</div>' -f $s.chapters.Count, $vc)
  W '    <div class="rule"></div>'
  W '  </header>'
  foreach ($c in $s.chapters) {
    W ('  <div class="chapter"><h2 id="ch-{0}-{1}">제{1}장</h2>' -f $si, $c.num)
    foreach ($v in $c.verses) {
      W ('    <p class="v" id="v-{0}"><span class="vn">{1}</span>{2}</p>' -f (Esc $v.id), $v.verse, (Esc $v.text))
    }
    W '  </div>'
  }
  W '</section>'
  $si++
}

W '</body></html>'

[System.IO.File]::WriteAllText($out, $sb.ToString(), [System.Text.UTF8Encoding]::new($false))
"HTML written: $out  ({0:N0} bytes)" -f (Get-Item $out).Length
"sections: $($sections.Count), chapters: $(($sections | ForEach-Object { $_.chapters.Count } | Measure-Object -Sum).Sum), verses: $totalVerses"
