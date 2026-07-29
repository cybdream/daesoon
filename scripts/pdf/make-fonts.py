"""NotoSerifKR 가변 폰트에서 정적 인스턴스를 뽑아낸다.

크롬 헤드리스로 PDF 를 뽑을 때 가변 폰트를 그대로 쓰면 Skia 가 글리프를
Type 3 프로시저로 구워 넣는다. 파일이 3 배 이상 커지고 상업 인쇄 RIP 이
거부할 수 있어서, 조판에 쓰는 굵기만 정적 TTF 로 미리 고정해 둔다.
"""

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# 조판 CSS 가 실제로 쓰는 굵기만 뽑는다 (본문 400, 제목·강조 600)
WEIGHTS = [(400, "Regular"), (600, "SemiBold")]


def main() -> int:
    src = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    for wght, style in WEIGHTS:
        dst = out_dir / f"NotoSerifKR-{style}.ttf"
        font = TTFont(src)
        instancer.instantiateVariableFont(
            font, {"wght": wght}, inplace=True, updateFontNames=True
        )
        font.save(dst)

        check = TTFont(dst, lazy=True)
        if "fvar" in check:
            raise SystemExit(f"인스턴스화 실패 — 가변 축이 남아 있습니다: {dst}")
        print(f"  {dst.name}  wght={wght}  glyphs={check['maxp'].numGlyphs}  "
              f"{dst.stat().st_size:,} bytes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
