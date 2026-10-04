"""Write assets/fonts/fonts.css for the ISEJ site (lane C, 2026-10-04).

Three parts: @font-face rules for the subset web fonts; metric-matched Georgia fallback faces;
the type rules the orchestrator merges into site.css.

Fallback metrics follow CSS Fonts 5. size-adjust = mean advance width of the web font divided
by that of the matching Georgia face, both weighted by the character frequencies of the site's
visible text. The ascent/descent/line-gap overrides are the web font's typo metrics (all three
fonts set USE_TYPO_METRICS) divided by size-adjust, because browsers scale overrides by it.
Source Serif 4 is measured at opsz 18, the optical size of body text.

Run with the python.org 3.13 framework Python (fontTools + brotli); see build_fonts.sh.
"""
from __future__ import annotations

import argparse
import collections
import html
import re
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

GEORGIA = Path("/System/Library/Fonts/Supplemental")
BODY_OPSZ = 18


def site_char_frequencies(site: Path) -> collections.Counter:
    """Characters of the visible text of every page (scripts, styles, inline SVG and <head> removed)."""
    freq: collections.Counter = collections.Counter()
    for page in sorted(site.glob("*.html")):
        raw = page.read_text(encoding="utf-8")
        raw = re.sub(r"(?is)<(script|style|svg|head)\b.*?</\1>", " ", raw)
        raw = re.sub(r"(?s)<[^>]+>", " ", raw)
        freq.update(html.unescape(re.sub(r"\s+", " ", raw)))
    if not freq:
        raise SystemExit(f"no page text found under {site}")
    return freq


def mean_advance(font: TTFont, freq: collections.Counter) -> float:
    """Frequency-weighted advance width in em."""
    cmap, hmtx, upm = font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm
    total = count = 0
    for ch, n in freq.items():
        glyph = cmap.get(ord(ch))
        if glyph is None:
            continue
        total += hmtx[glyph][0] * n
        count += n
    return total / count / upm


def line_metrics(font: TTFont) -> tuple[float, float, float]:
    """Ascent, descent, line gap in em, as browsers read them (typo metrics when USE_TYPO_METRICS is set)."""
    os2, upm = font["OS/2"], font["head"].unitsPerEm
    if os2.fsSelection & (1 << 7):
        return os2.sTypoAscender / upm, -os2.sTypoDescender / upm, os2.sTypoLineGap / upm
    hhea = font["hhea"]
    return hhea.ascent / upm, -hhea.descent / upm, hhea.lineGap / upm


def _pct(x: float) -> str:
    return f"{100 * x:.2f}%"


def fallback_face(family: str, local_names: list[str], style: str, weight: int,
                  web: TTFont, georgia: TTFont, freq: collections.Counter) -> str:
    size_adjust = mean_advance(web, freq) / mean_advance(georgia, freq)
    ascent, descent, gap = line_metrics(web)
    src = ", ".join(f'local("{n}")' for n in local_names)
    return (f'@font-face {{\n  font-family: "{family} Fallback";\n  src: {src};\n'
            f"  font-style: {style};\n  font-weight: {weight};\n"
            f"  size-adjust: {_pct(size_adjust)};\n  ascent-override: {_pct(ascent / size_adjust)};\n"
            f"  descent-override: {_pct(descent / size_adjust)};\n  line-gap-override: {_pct(gap / size_adjust)};\n}}")


def web_face(family: str, file: str, style: str, weights: str, unicode_range: str) -> str:
    return (f'@font-face {{\n  font-family: "{family}";\n  src: url("{file}") format("woff2");\n'
            f"  font-style: {style};\n  font-weight: {weights};\n  font-display: swap;\n"
            f"  unicode-range: {unicode_range};\n}}")


TYPE_RULES = """/* ---- 3. Type rules: merge into site.css -------------------------------------------
   Each block names the site.css rule it replaces or extends. Until merged, linking this file
   AFTER site.css applies them as they stand. */

/* Replaces the two font stacks in :root: the metric-matched fallbacks come before Georgia */
:root {
  --isej-font-display: "Libre Baskerville", "Libre Baskerville Fallback", Georgia, "Times New Roman", serif;
  --isej-font-text: "Source Serif 4", "Source Serif 4 Fallback", Georgia, "Times New Roman", serif;
  --isej-smcp-tracking: 0.06em;
}

/* Kit rule 5, amended 2026-10-04: kickers, navigation, section labels and the issue spine in real
   small caps of Source Serif 4 instead of tracked Baskerville capitals. Replaces font-family,
   font-size, letter-spacing and text-transform in ".masthead nav, h2" (Tracked capitals),
   ".cover .date", ".issue .spine", ".issue .label" and ".side .label". Small caps at body size
   stand 552.5 units tall against Baskerville's 770-unit capitals at --isej-step--1, about 92%
   of the old height, hence the step up to --isej-step-0. */
.masthead nav, h2, .cover .date, .issue .spine, .issue .label, .side .label {
  font-family: var(--isej-font-text);
  font-size: var(--isej-step-0);
  font-variant-caps: all-small-caps;
  letter-spacing: var(--isej-smcp-tracking);
  text-transform: none;
}

/* Figures: old-style in running text, lining tabular in tables and aligned columns.
   Extends body and .tabular (the old-style rule only takes effect with these self-hosted files:
   the Google Fonts build of Source Serif 4 has no onum, smcp or c2sc). */
body { font-variant-numeric: oldstyle-nums proportional-nums; }
.tabular, table, .list li > span:first-child { font-variant-numeric: lining-nums tabular-nums; }

/* Line breaking: no stranded last words in text, balanced headings and short blocks */
p, li, dd, figcaption, blockquote { text-wrap: pretty; }
h1, h2, h3, .lede, .issue .title, .statement p { text-wrap: balance; }

/* Opening quotation marks hang into the margin where supported (Safari) */
@supports (hanging-punctuation: first) {
  body { hanging-punctuation: first; }
}
"""


def build(args: argparse.Namespace) -> str:
    fonts = Path(args.fonts)
    freq = site_char_frequencies(Path(args.site))
    ss4 = fonts / "SourceSerif4[opsz,wght].ttf"
    lb = fonts / "LibreBaskerville[wght].ttf"
    georgia = {w: TTFont(GEORGIA / name) for w, name in
               (("400", "Georgia.ttf"), ("700", "Georgia Bold.ttf"), ("i400", "Georgia Italic.ttf"))}
    regular, bold, italic = ["Georgia"], ["Georgia Bold", "Georgia-Bold"], ["Georgia Italic", "Georgia-Italic"]
    faces = [
        fallback_face("Source Serif 4", regular, "normal", 400,
                      instantiateVariableFont(TTFont(ss4), {"wght": 400, "opsz": BODY_OPSZ}), georgia["400"], freq),
        fallback_face("Source Serif 4", bold, "normal", 700,
                      instantiateVariableFont(TTFont(ss4), {"wght": 700, "opsz": BODY_OPSZ}), georgia["700"], freq),
        fallback_face("Libre Baskerville", regular, "normal", 400,
                      instantiateVariableFont(TTFont(lb), {"wght": 400}), georgia["400"], freq),
        fallback_face("Libre Baskerville", bold, "normal", 700,
                      instantiateVariableFont(TTFont(lb), {"wght": 700}), georgia["700"], freq),
        fallback_face("Libre Baskerville", italic, "italic", 400,
                      instantiateVariableFont(TTFont(args.italic), {"wght": 400}), georgia["i400"], freq),
    ]
    uni = ", ".join(r.strip() for r in args.unicodes.split(","))
    header = f"""/* ISEJ fonts, self-hosted (generated by build/build_fonts_css.py; do not edit by hand).
   Source Serif 4 4.004 (Adobe, OFL): variable, opsz 8-60, wght limited to 400-700.
   Libre Baskerville 2.005 (Impallari Type, OFL): variable, wght 400-700, upright and italic.
   Subset to: {uni}.
   Licences: OFL-SourceSerif4.txt and OFL-LibreBaskerville.txt in this folder.
   Fallback metrics measured on {sum(freq.values())} characters of the site's visible text. */
"""
    web = "\n".join([
        web_face("Source Serif 4", "source-serif-4.woff2", "normal", "400 700", uni),
        web_face("Libre Baskerville", "libre-baskerville.woff2", "normal", "400 700", uni),
        web_face("Libre Baskerville", "libre-baskerville-italic.woff2", "italic", "400 700", uni),
    ])
    return (header + "\n/* ---- 1. Web fonts ---- */\n" + web +
            "\n\n/* ---- 2. Georgia, scaled to each web font's width and line metrics, so the swap barely reflows ---- */\n"
            + "\n".join(faces) + "\n\n" + TYPE_RULES)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--fonts", required=True, help="folder with SourceSerif4[opsz,wght].ttf and LibreBaskerville[wght].ttf")
    p.add_argument("--italic", required=True, help="LibreBaskerville-Italic[wght].ttf")
    p.add_argument("--site", required=True, help="site root (pages *.html)")
    p.add_argument("--unicodes", required=True, help="the subset's unicode ranges, comma-separated")
    p.add_argument("--out", required=True)
    args = p.parse_args()
    Path(args.out).write_text(build(args), encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
