# 전경 EPUB 파이프라인

`data/scriptures.json` 을 EPUB 3 전자책으로 만든다.

```powershell
python scripts/epub/make-epub.py
# 또는
npm run build:epub
```

결과물은 `out/jeongyeong.epub` (약 1.5 MB) 이고 git 에는 올라가지 않는다.
신규 의존성은 없다 — 압축은 파이썬 표준 `zipfile`, 폰트 서브셋은 PDF 쪽에서 이미
쓰는 `fontTools` 를 그대로 쓴다.

## PDF 파이프라인과의 관계

`scripts/pdf/` 는 Paged.js 로 A5 고정 페이지를 조판해 헤드리스 크롬으로 굽는다.
EPUB 은 리플로 형식이라 페이지 개념도 `@page` 규칙도 크롬도 필요 없어서, 출력
계층은 공유하지 않는다. 공유하는 것은 두 가지다.

- **폰트 생성기** — `scripts/pdf/make-fonts.py` 를 그대로 호출해 정적 인스턴스를
  얻은 뒤 서브셋한다. `scripts/pdf/fonts/` 가 비어 있으면 알아서 만든다
- **절 앵커 규칙** — `id="v-{verse.id}"` (예: `v-haengnok-1-1`). PDF·PWA 와 같은
  형식이라 세 산출물의 딥링크가 호환된다

## 구조

```
mimetype                     첫 엔트리 · 무압축 (EPUB 강제 규칙)
META-INF/container.xml
OEBPS/package.opf            metadata + manifest + spine
OEBPS/nav.xhtml              편 7 → 장 17 2단계 목차
OEBPS/cover.xhtml            표지
OEBPS/style.css
OEBPS/fonts/*.ttf            서브셋 2종 (400 · 600)
OEBPS/sec{0-6}-ch{n}.xhtml   본문 17개 (장 단위)
```

`dc:identifier` 는 `make-epub.py` 의 `BOOK_ID` 상수로 고정돼 있다. 리더가 같은 책으로
인식해야 읽던 위치와 메모가 유지되므로, **새 책을 낼 때가 아니면 바꾸지 말 것.**

## 폰트

본문 실사용 2,711자만 남겨 임베딩한다. 14 MB → 약 1.26 MB (개당).
Noto 계열은 OFL 이라 임베딩·재배포에 문제가 없다.

빌드 끝에 뜨는 경고는 정상이다.

```
경고: 서브셋 폰트에 없는 글자 13자 — 리더 기본 폰트로 표시됩니다
  ∙㖿喼焬羑耜耻肜醎黙更寧吏
```

NotoSerifKR 자체에 없는 글자라 서브셋에도 담기지 않는다. 리더 기본 폰트로 넘어가며
자형만 달라 보일 뿐 글자가 깨지지는 않는다. 인쇄판 PDF 도 같은 글자에서 시스템 폰트로
폴백한다.

## 자체 점검

빌드 마지막에 산출물을 다시 열어 7 항목을 확인하고, 하나라도 어긋나면 실패한다.
mimetype 위치·압축 방식, container→OPF 연결, 전 XML 문서의 well-formed 여부,
manifest ↔ 실파일 양방향 일치, spine idref 해소, 절 앵커 839 개의 존재와 유일성,
nav 문서 선언.

공식 검증기인 epubcheck 은 Java 런타임이 필요해 쓰지 않는다. 서점·스토어에 등록할
계획이 생기면 그때 도입하는 편이 낫다.

## 데이터에 대해 알아둘 것

본문에 **CJK 호환 한자**(U+F900–FAFF)가 66 종 섞여 있다. 六(U+F9D1) 75 회,
金(U+F90A) 64 회, 李(U+F9E1) 29 회 등으로, 두 가지 음으로 읽는 한자를 구분하는
한국식 표기다. 겉보기에는 일반 한자와 똑같지만 코드포인트가 다르다.

검색 기능에서 이 글자들이 문제가 될 수 있다. 사용자가 일반 金(U+91D1)을 입력하면
호환 金(U+F90A)과 매칭되지 않는다. 색인이나 질의를 NFC 정규화하면 해소되지만,
본문 데이터 자체를 정규화하면 원문의 독음 구분 정보가 사라지므로 신중해야 한다.
