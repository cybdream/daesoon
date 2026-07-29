#!/usr/bin/env python3
"""data/scriptures.json 을 EPUB 3 전자책으로 만든다.

PDF 쪽(scripts/pdf/)은 Paged.js 로 A5 고정 페이지를 조판해 크롬으로 굽지만,
EPUB 은 리플로 형식이라 페이지 개념이 없다. 편·장·절로 묶는 논리만 성격이 같고
출력 계층은 별도다.

  python scripts/epub/make-epub.py
"""

import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DATA = REPO / "data" / "scriptures.json"
OUT_DIR = HERE / "out"
EPUB_PATH = OUT_DIR / "jeongyeong.epub"

# PDF 파이프라인의 정적 인스턴스 생성기를 그대로 재사용한다
PDF_FONT_DIR = REPO / "scripts" / "pdf" / "fonts"
MAKE_FONTS = REPO / "scripts" / "pdf" / "make-fonts.py"

# 전자책 식별자는 빌드마다 바뀌면 안 된다 (리더가 같은 책으로 인식해야 읽던 위치·
# 메모가 유지된다). 새 책을 낼 때가 아니면 이 값을 건드리지 말 것.
BOOK_ID = "urn:uuid:8f3c1a76-5d42-4e18-9b07-2c6ea4f9d310"

# 발행 주체. dc:creator 를 비워 두면 리더 서재에 '작가 없음' 으로 뜨므로
# dc:publisher 와 함께 넣는다.
PUBLISHER = "대순진리회"

# scripts/pdf/build-html.ps1 의 $hanja 와 같은 표. 언어가 달라 공유가 안 되므로
# 복제해 둔다. 편 이름은 고정값이라 어긋날 일이 없다.
SECTION_HANJA = {
    "행록": "行錄", "공사": "公事", "교운": "敎運", "교법": "敎法",
    "권지": "權智", "제생": "濟生", "예시": "豫示",
}

FONTS = [("NotoSerifKR-Regular.ttf", 400), ("NotoSerifKR-SemiBold.ttf", 600)]

# zip 안의 타임스탬프를 고정해 같은 입력이면 같은 파일이 나오게 한다
ZIP_DATE = (2026, 1, 1, 0, 0, 0)


# --------------------------------------------------------------------------
# 데이터
# --------------------------------------------------------------------------

def load_sections():
    """원본 order 를 지키며 편 → 장 → 절로 묶는다."""
    doc = json.loads(DATA.read_text(encoding="utf-8"))
    verses = sorted(doc["verses"], key=lambda v: v["order"])

    sections, cur_sec, cur_ch = [], None, None
    for v in verses:
        if cur_sec is None or cur_sec["name"] != v["section"]:
            cur_sec = {"name": v["section"], "chapters": []}
            sections.append(cur_sec)
            cur_ch = None
        if cur_ch is None or cur_ch["num"] != v["chapter"]:
            cur_ch = {"num": v["chapter"], "verses": []}
            cur_sec["chapters"].append(cur_ch)
        cur_ch["verses"].append(v)

    return doc, sections, verses


def chapter_href(si, num):
    return f"sec{si}-ch{num}.xhtml"


# --------------------------------------------------------------------------
# XHTML
# --------------------------------------------------------------------------

XHTML_HEAD = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<!DOCTYPE html>\n'
    '<html xmlns="http://www.w3.org/1999/xhtml" '
    'xmlns:epub="http://www.idpf.org/2007/ops" lang="ko" xml:lang="ko">\n'
    '<head>\n'
    '  <meta charset="utf-8"/>\n'
    '  <title>{title}</title>\n'
    '  <link rel="stylesheet" type="text/css" href="style.css"/>\n'
    '</head>\n'
    '<body>\n'
)
XHTML_TAIL = "</body>\n</html>\n"


def xhtml(title, body):
    return XHTML_HEAD.format(title=escape(title)) + body + XHTML_TAIL


def build_cover(doc, sections, total_verses):
    gen = datetime.fromisoformat(doc["generatedAt"].replace("Z", "+00:00"))
    body = (
        '<section class="cover" epub:type="cover">\n'
        '  <h1>전경</h1>\n'
        '  <div class="hanja">典經</div>\n'
        '  <hr class="rule"/>\n'
        f'  <div class="sub">전 {len(sections)}편 · 총 {total_verses}절<br/>디지털 정본</div>\n'
        f'  <div class="meta">데이터 버전 {escape(doc["version"])}<br/>'
        f'{gen.strftime("%Y년 %-m월 %-d일" if sys.platform != "win32" else "%Y년 %#m월 %#d일")} 생성<br/>'
        'github.com/cybdream/daesoon</div>\n'
        '</section>\n'
    )
    return xhtml("전경 典經", body)


def build_nav(sections):
    out = ['<nav id="toc" epub:type="toc">\n', '  <h1>목차</h1>\n', '  <ol>\n']
    for si, sec in enumerate(sections):
        vc = sum(len(c["verses"]) for c in sec["chapters"])
        first = chapter_href(si, sec["chapters"][0]["num"])
        out.append(
            f'    <li><a href="{first}">{escape(sec["name"])}'
            f'<span class="han">{SECTION_HANJA[sec["name"]]}</span></a>\n'
            f'      <span class="cnt">전 {len(sec["chapters"])}장 · {vc}절</span>\n'
            '      <ol>\n'
        )
        for ch in sec["chapters"]:
            out.append(
                f'        <li><a href="{chapter_href(si, ch["num"])}">제{ch["num"]}장</a>'
                f'<span class="cnt">({len(ch["verses"])}절)</span></li>\n'
            )
        out.append('      </ol>\n    </li>\n')
    out.append('  </ol>\n</nav>\n')
    return xhtml("목차", "".join(out))


def build_chapter(si, sec, ch, is_first):
    body = ['<section epub:type="chapter">\n']
    if is_first:
        vc = sum(len(c["verses"]) for c in sec["chapters"])
        body.append(
            '  <header class="section-head">\n'
            f'    <h1>{escape(sec["name"])}</h1>\n'
            f'    <div class="han">{SECTION_HANJA[sec["name"]]}</div>\n'
            f'    <div class="cnt">전 {len(sec["chapters"])}장 · {vc}절</div>\n'
            '    <hr class="rule"/>\n'
            '  </header>\n'
        )
    body.append(f'  <h2 class="chapter-title" id="ch-{si}-{ch["num"]}">제{ch["num"]}장</h2>\n')
    for v in ch["verses"]:
        body.append(
            f'  <p class="v" id="v-{escape(v["id"])}">'
            f'<span class="vn">{v["verse"]}</span>{escape(v["text"])}</p>\n'
        )
    body.append('</section>\n')
    return xhtml(f'{sec["name"]} 제{ch["num"]}장', "".join(body))


# --------------------------------------------------------------------------
# 패키지 문서
# --------------------------------------------------------------------------

def build_opf(doc, chapter_files):
    modified = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    items = [
        '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        '    <item id="css" href="style.css" media-type="text/css"/>',
    ]
    for name, _ in FONTS:
        fid = name.replace(".ttf", "").replace("-", "").lower()
        items.append(f'    <item id="{fid}" href="fonts/{name}" media-type="font/ttf"/>')
    for idx, href in enumerate(chapter_files):
        items.append(
            f'    <item id="ch{idx}" href="{href}" media-type="application/xhtml+xml"/>'
        )

    spine = ['    <itemref idref="cover"/>', '    <itemref idref="nav"/>']
    spine += [f'    <itemref idref="ch{i}"/>' for i in range(len(chapter_files))]

    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" '
        'unique-identifier="book-id" xml:lang="ko">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        f'    <dc:identifier id="book-id">{BOOK_ID}</dc:identifier>\n'
        '    <dc:title>전경 典經</dc:title>\n'
        f'    <dc:creator id="creator">{PUBLISHER}</dc:creator>\n'
        f'    <meta refines="#creator" property="file-as">{PUBLISHER}</meta>\n'
        f'    <dc:publisher>{PUBLISHER}</dc:publisher>\n'
        '    <dc:language>ko</dc:language>\n'
        '    <dc:source>https://github.com/cybdream/daesoon</dc:source>\n'
        f'    <meta property="dcterms:modified">{modified}</meta>\n'
        f'    <meta property="dcterms:hasVersion">{escape(doc["version"])}</meta>\n'
        '  </metadata>\n'
        '  <manifest>\n' + "\n".join(items) + '\n  </manifest>\n'
        '  <spine>\n' + "\n".join(spine) + '\n  </spine>\n'
        '</package>\n'
    )


CONTAINER_XML = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
    '  <rootfiles>\n'
    '    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>\n'
    '  </rootfiles>\n'
    '</container>\n'
)


# --------------------------------------------------------------------------
# 폰트
# --------------------------------------------------------------------------

def find_variable_font():
    import os
    candidates = [
        Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts" / "NotoSerifKR-VF.ttf",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Windows/Fonts/NotoSerifKR-VF.ttf",
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise SystemExit(
        "NotoSerifKR-VF.ttf 를 찾을 수 없습니다.\n"
        "  https://fonts.google.com/noto/specimen/Noto+Serif+KR 에서 설치 후 다시 실행하세요."
    )


def ensure_static_fonts():
    """정적 인스턴스가 없으면 PDF 쪽 생성기를 그대로 불러 만든다."""
    if all((PDF_FONT_DIR / name).is_file() for name, _ in FONTS):
        return
    print("  정적 인스턴스가 없어 scripts/pdf/make-fonts.py 로 생성합니다")
    subprocess.run(
        [sys.executable, str(MAKE_FONTS), str(find_variable_font()), str(PDF_FONT_DIR)],
        check=True,
    )


def subset_fonts(charset):
    """실사용 글자만 남긴 서브셋을 만들어 {파일명: bytes} 로 돌려준다."""
    from fontTools import subset as ftsubset
    from fontTools.ttLib import TTFont

    ensure_static_fonts()
    tmp = OUT_DIR / "_fonts"
    tmp.mkdir(parents=True, exist_ok=True)

    result = {}
    for name, _weight in FONTS:
        src = PDF_FONT_DIR / name
        dst = tmp / name

        options = ftsubset.Options()
        options.layout_features = ["*"]
        options.notdef_outline = True

        font = ftsubset.load_font(str(src), options)
        subsetter = ftsubset.Subsetter(options=options)
        subsetter.populate(text=charset)
        subsetter.subset(font)
        ftsubset.save_font(font, str(dst), options)
        font.close()

        # 서브셋이 요구한 글자를 실제로 담고 있는지 확인
        cmap = TTFont(dst, lazy=True).getBestCmap()
        missing = {c for c in charset if ord(c) not in cmap}
        result[name] = (dst.read_bytes(), missing)
        print(f"  {name}: {src.stat().st_size:,} → {dst.stat().st_size:,} bytes"
              f" (누락 {len(missing)}자)")

    return result


# --------------------------------------------------------------------------
# 쓰기
# --------------------------------------------------------------------------

def write_epub(files):
    """files: [(zip 내부 경로, bytes)] — mimetype 은 여기서 따로 넣는다."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(EPUB_PATH, "w") as z:
        # mimetype 은 반드시 첫 엔트리이면서 무압축이어야 한다 (EPUB 강제 규칙)
        info = zipfile.ZipInfo("mimetype", date_time=ZIP_DATE)
        info.compress_type = zipfile.ZIP_STORED
        z.writestr(info, b"application/epub+zip")

        for path, data in files:
            info = zipfile.ZipInfo(path, date_time=ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)


# --------------------------------------------------------------------------
# 자체 점검
# --------------------------------------------------------------------------

def self_check(expected_anchors):
    from xml.etree import ElementTree as ET

    OPF_NS = "{http://www.idpf.org/2007/opf}"
    problems = []

    with zipfile.ZipFile(EPUB_PATH) as z:
        names = z.namelist()

        # 1. mimetype
        first = z.infolist()[0]
        if first.filename != "mimetype":
            problems.append(f"mimetype 이 첫 엔트리가 아님 (실제: {first.filename})")
        elif first.compress_type != zipfile.ZIP_STORED:
            problems.append("mimetype 이 압축되어 있음")

        # 2. container → OPF
        container = ET.fromstring(z.read("META-INF/container.xml"))
        ns = "{urn:oasis:names:tc:opendocument:xmlns:container}"
        rootfile = container.find(f"{ns}rootfiles/{ns}rootfile")
        opf_path = rootfile.get("full-path")
        if opf_path not in names:
            problems.append(f"container 가 가리키는 OPF 없음: {opf_path}")
            return problems

        # 3. XML well-formed
        for name in names:
            if name.endswith((".xhtml", ".opf", ".xml")):
                try:
                    ET.fromstring(z.read(name))
                except ET.ParseError as exc:
                    problems.append(f"XML 파싱 실패 {name}: {exc}")

        opf = ET.fromstring(z.read(opf_path))
        base = opf_path.rsplit("/", 1)[0]

        # 4. manifest ↔ 실파일 양방향
        manifest = {}
        for item in opf.findall(f"{OPF_NS}manifest/{OPF_NS}item"):
            href = f'{base}/{item.get("href")}'
            manifest[item.get("id")] = href
            if href not in names:
                problems.append(f"manifest 항목의 실파일 없음: {href}")

        exempt = {"mimetype", "META-INF/container.xml", opf_path}
        for name in names:
            if name not in exempt and name not in manifest.values():
                problems.append(f"manifest 에 없는 파일이 들어 있음: {name}")

        # 5. spine idref
        for ref in opf.findall(f"{OPF_NS}spine/{OPF_NS}itemref"):
            if ref.get("idref") not in manifest:
                problems.append(f"spine idref 를 manifest 에서 못 찾음: {ref.get('idref')}")

        # 6. 절 앵커
        found = []
        for name in names:
            if name.endswith(".xhtml"):
                found += re.findall(r'id="(v-[^"]+)"', z.read(name).decode("utf-8"))
        if len(found) != len(set(found)):
            problems.append("절 앵커가 중복됨")
        if set(found) != expected_anchors:
            problems.append(
                f"절 앵커 수 불일치: 기대 {len(expected_anchors)} / 실제 {len(set(found))}"
            )

        # 7. nav 문서
        if not any(
            item.get("properties", "").find("nav") >= 0
            for item in opf.findall(f"{OPF_NS}manifest/{OPF_NS}item")
        ):
            problems.append('properties="nav" 인 항목이 manifest 에 없음')

    return problems


# --------------------------------------------------------------------------

def main():
    print(f"[1/4] 데이터 읽기: {DATA.relative_to(REPO)}")
    doc, sections, verses = load_sections()
    total_ch = sum(len(s["chapters"]) for s in sections)
    print(f"  {len(sections)}편 {total_ch}장 {len(verses)}절")

    print("[2/4] XHTML 생성")
    files = [("META-INF/container.xml", CONTAINER_XML.encode("utf-8"))]
    files.append(("OEBPS/style.css", (HERE / "style.css").read_bytes()))
    files.append(("OEBPS/cover.xhtml", build_cover(doc, sections, len(verses)).encode("utf-8")))
    files.append(("OEBPS/nav.xhtml", build_nav(sections).encode("utf-8")))

    chapter_files = []
    for si, sec in enumerate(sections):
        for ci, ch in enumerate(sec["chapters"]):
            href = chapter_href(si, ch["num"])
            chapter_files.append(href)
            files.append(
                (f"OEBPS/{href}", build_chapter(si, sec, ch, ci == 0).encode("utf-8"))
            )
    print(f"  본문 {len(chapter_files)}개 + 표지 + 목차")

    print("[3/4] 폰트 서브셋")
    charset = set()
    for v in verses:
        charset |= set(v["text"])
    for name, han in SECTION_HANJA.items():
        charset |= set(name) | set(han)
    charset |= set("전경典經목차제장절0123456789 ·—-()[]{}<>「」『』\"'…·,.!?~%/\n")
    charset.discard("\n")
    print(f"  실사용 {len(charset)}자")

    subsets = subset_fonts("".join(sorted(charset)))
    uncovered = set()
    for name, (data, missing) in subsets.items():
        files.append((f"OEBPS/fonts/{name}", data))
        uncovered |= missing

    files.append(("OEBPS/package.opf", build_opf(doc, chapter_files).encode("utf-8")))

    write_epub(files)
    size = EPUB_PATH.stat().st_size
    print(f"  EPUB 작성: {EPUB_PATH} ({size:,} bytes)")

    print("[4/4] 자체 점검")
    expected = {f'v-{v["id"]}' for v in verses}
    problems = self_check(expected)
    if problems:
        print("\n점검 실패:")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("  7개 항목 통과")

    # 폰트 커버리지는 실패가 아니라 경고다. NotoSerifKR 에 없는 글자는 리더 기본
    # 폰트로 넘어가며, 자형만 달라 보일 뿐 글자가 깨지지는 않는다.
    if uncovered:
        chars = "".join(sorted(uncovered))
        print(f"\n경고: 서브셋 폰트에 없는 글자 {len(uncovered)}자 — 리더 기본 폰트로 표시됩니다")
        print(f"  {chars}")
    print(f"\n완료: {EPUB_PATH} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
