# 전경 인쇄판 PDF 파이프라인

`data/scriptures.json` 을 A5 인쇄용 PDF 로 조판한다.

```
data/scriptures.json
  → build-html.ps1   Paged.js 조판용 HTML 생성        → out/jeongyeong.html
  → print-pdf.ps1    헤드리스 크롬 + CDP printToPDF    → out/jeongyeong.pdf
```

## 실행

```powershell
pwsh -File scripts/pdf/build-pdf.ps1
# 또는
npm run build:pdf
```

세 단계(폰트 준비 → HTML → PDF)를 순서대로 돌린다. 219 페이지 기준 조판에 5 초 내외,
전체 1 분 안쪽이면 끝난다. 결과물은 `out/` 에 생기고 git 에는 올라가지 않는다.

각 단계를 따로 돌려도 된다.

| 스크립트 | 하는 일 |
|---|---|
| `make-fonts.ps1` | 시스템의 NotoSerifKR-VF 에서 정적 인스턴스 2 개를 뽑아 `fonts/` 에 넣는다. 이미 있으면 건너뛴다 (`-Force` 로 재생성) |
| `build-html.ps1` | 편·장·절 구조로 묶어 조판용 HTML 을 만든다 |
| `print-pdf.ps1` | 크롬을 헤드리스로 띄우고 Paged.js 조판이 끝나길 기다렸다가 PDF 로 출력한다 |

## 폰트를 왜 따로 만드는가

시스템에 설치된 `NotoSerifKR-VF.ttf` 는 **가변 폰트**(wght 200–900)다. CSS 에서 이걸 그대로
참조하면 Skia 가 PDF 에 글리프를 **Type 3 프로시저**로 구워 넣는다. 결과가 이렇게 갈린다.

| | 가변 폰트 직접 참조 | 정적 인스턴스 |
|---|---|---|
| 임베딩 방식 | Type 3 (항목 100 여 개로 파편화) | CID TrueType (7 개) |
| 파일 크기 | 6.08 MB | 1.86 MB |

Type 3 는 상업 인쇄소 RIP 이 거부하거나 품질이 떨어질 수 있어서, 조판에 실제로 쓰는
굵기(400·600)만 미리 정적 TTF 로 고정한다. 폰트 파일은 개당 14 MB 라 커밋하지 않고
빌드할 때마다 만든다 — `fonts/` 와 `out/` 은 `.gitignore` 에 있다.

## 요구사항

- Windows + Chrome (`Page.printToPDF` CDP 사용)
- PowerShell 7+
- Python 3 — `fontTools` 는 `make-fonts.ps1` 이 없으면 자동 설치한다
- **Noto Serif KR** 설치 ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Serif+KR))

## 알려진 사항

본문 폰트와 `바탕`(한자 소제목), `맑은 고딕`(제목·쪽번호)은 CSS 에서 의도적으로 지정한
것이다. 다만 어느 쪽에도 없는 희귀 한자 9 자(`㖿喼焬羑耜耻肜醎黙`, 12 개 페이지)는
크롬이 SimSun·MS-PGothic 으로 대체해 자형이 본문과 다르게 보인다. 글자가 깨지는 것은
아니다. 맞추려면 `build-html.ps1` 의 `body` 폰트 스택 끝에 커버리지가 넓은 한자 폰트를
추가하면 된다.
