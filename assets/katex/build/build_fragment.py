"""Build the "Our mark" section for about.html and the KaTeX assets it needs (ISEJ site, lane C, 2026-10-04).

Every TeX snippet is rendered with KaTeX under JavaScriptCore; only the KaTeX fonts the rendered
HTML uses are shipped (woff2, URLs ./fonts/). Facts in the copy are read or checked here, not typed:
the seed and the code excerpt come from field.py, the level count from isej-field.json, and the
place words for each bump ("the ridge just below the bottom edge", ...) are checked against the
exported About view, so a change to the field fails the build instead of shipping wrong copy.

Run from build_katex.sh, which downloads KaTeX and checks it against the cdnjs SRI hashes.
"""
from __future__ import annotations

import argparse
import html
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

NUMBER_WORDS = {6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve"}
VIEW = "about"

BUMP = r"a_i \exp\Bigl(-\tfrac{1}{2}\bigl[(u_i/\sigma_{x,i})^{2} + (v_i/\sigma_{y,i})^{2}\bigr]\Bigr)"
DISPLAY = {
    # field.py Field.__call__: z = tilt . (x, y) + sum amp * exp(-0.5 * ((u / sx)**2 + (v / sy)**2))
    "main_wide": r"z(x,y) = t\cdot(x,y) + \sum_{i=1}^{4} " + BUMP,
    "main_narrow": r"\begin{aligned} z(x,y) &= t\cdot(x,y) \\ &\quad {}+ \sum_{i=1}^{4} " + BUMP + r" \end{aligned}",
    # field.py: u = c * (x - cx) + s * (y - cy); v = -s * (x - cx) + c * (y - cy)
    "rotation": (r"\begin{pmatrix} u_i \\ v_i \end{pmatrix} = "
                 r"\begin{pmatrix} \cos\theta_i & \sin\theta_i \\ -\sin\theta_i & \cos\theta_i \end{pmatrix}"
                 r"\begin{pmatrix} x - c_{x,i} \\ y - c_{y,i} \end{pmatrix}"),
}
INLINE = {
    "z_xy": "z(x,y)", "z": "z", "t": "t", "i": "i", "a_i": "a_i", "centre": r"(c_{x,i},\,c_{y,i})",
    "sx": r"\sigma_{x,i}", "sy": r"\sigma_{y,i}", "theta": r"\theta_i", "u": "u_i", "v": "v_i",
    "a1": "a_1", "a2": "a_2", "a3": "a_3", "a4": "a_4",
}


# Each slider: the label words, the phrase in the text, and the claim behind both, checked on the
# bump's centre (u, v) in About-view pixels, the view size (w, h) and the bump's amplitude.
def _ridge_below(u, v, w, h, amp, sx, sy): return amp > 0 and 0 < u < w and h < v < 1.3 * h and sx > 2 * sy
def _hollow_lower_right(u, v, w, h, amp, sx, sy): return amp < 0 and 2 * w / 3 < u < w and h / 2 < v < h
def _hill_above(u, v, w, h, amp, sx, sy): return amp > 0 and 0 < u < w and v < 0
def _hollow_left(u, v, w, h, amp, sx, sy): return amp < 0 and abs(u) < 0.05 * w and 0 < v < h


SLIDERS = [
    ("a1", "Ridge, bottom edge", "for the ridge just below the bottom edge", _ridge_below),
    ("a2", "Hollow, lower right", "for the hollow at the lower right", _hollow_lower_right),
    ("a3", "Hill, above the top", "for the hill above the top edge", _hill_above),
    ("a4", "Hollow, left edge", "for the hollow on the left edge", _hollow_left),
]

# KaTeX classes that need a font family this build does not ship: fail rather than fall back.
UNSHIPPED = {"mathbf", "boldsymbol", "amsrm", "mathbb", "textbb", "mathcal", "mathfrak", "textfrak", "mathscr",
             "textscr", "mathsf", "textsf", "mathtt", "texttt", "mathit", "textit", "textbf", "mathboldsf"}


def field_to_view(view: dict, x: float, y: float) -> tuple[float, float]:
    """Inverse of contours.Window.to_field for a view's window [cx, cy, scale, theta, stretch]."""
    cx, cy, scale, theta, stretch = view["window"]
    w, h = view["size"]
    c, s = math.cos(theta), math.sin(theta)
    du, dv = c * (x - cx) + s * (y - cy), -s * (x - cx) + c * (y - cy)
    return w / 2 + du * stretch / scale, h / 2 + dv / scale


def check_places(field_json: dict) -> None:
    view = field_json["views"][VIEW]
    w, h = view["size"]
    bumps = field_json["field"]["bumps"]
    if len(bumps) != len(SLIDERS):
        raise SystemExit(f"{len(bumps)} bumps in the export, {len(SLIDERS)} sliders in the copy")
    for (param, _, phrase, claim), (amp, bx, by, sx, sy, _theta) in zip(SLIDERS, bumps):
        u, v = field_to_view(view, bx, by)
        if not claim(u, v, w, h, amp, sx, sy):
            raise SystemExit(f"copy no longer true: {param} '{phrase}' (centre at u={u:.0f}, v={v:.0f} px, amp={amp:+.3f})")
        print(f"checked {param}: {phrase} (centre u={u:.0f}, v={v:.0f} px in {w}x{h}, amp {amp:+.3f})")


def code_excerpt(field_py: Path) -> tuple[int, int, str]:
    """Lines from the Bump dataclass to the end of Field.__call__, verbatim."""
    lines = field_py.read_text(encoding="utf-8").splitlines()
    start = next(i for i, ln in enumerate(lines) if ln.startswith("class Bump")) - 1
    call = next(i for i, ln in enumerate(lines) if "def __call__" in ln)
    end = next(i for i in range(call, len(lines)) if lines[i].strip() == "return z")
    if not lines[start].startswith("@dataclass") or not 20 <= end - start + 1 <= 30:
        raise SystemExit(f"field.py excerpt out of shape: lines {start + 1}-{end + 1}")
    return start + 1, end + 1, "\n".join(lines[start:end + 1])


def read_seed(field_py: Path) -> int:
    match = re.search(r"^SEED = (\d+)", field_py.read_text(encoding="utf-8"), re.M)
    if not match:
        raise SystemExit("SEED not found in field.py")
    return int(match.group(1))


def render(jsc: str, renderer: Path, katex_js: Path) -> dict:
    snippets = {k: {"tex": v, "display": True} for k, v in DISPLAY.items()}
    snippets.update({k: {"tex": v, "display": False} for k, v in INLINE.items()})
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(snippets, fh)
    result = subprocess.run([jsc, str(renderer), "--", str(katex_js), fh.name], capture_output=True, text=True, check=True)
    Path(fh.name).unlink()
    return json.loads(result.stdout)


def required_fonts(snippets: dict[str, str]) -> list[str]:
    """KaTeX font files the rendered HTML needs, from its class attributes."""
    need = {"KaTeX_Main-Regular"}           # .katex base font
    for markup in snippets.values():
        for attr in re.findall(r'class="([^"]+)"', markup):
            tokens = set(attr.split())
            if tokens & UNSHIPPED:
                raise SystemExit(f"KaTeX output needs an unshipped font family: {sorted(tokens & UNSHIPPED)}")
            if "mathnormal" in tokens:
                need.add("KaTeX_Math-Italic")
            if "delimsizing" in tokens:
                need.update(f"KaTeX_Size{n}-Regular" for n in range(1, 5) if f"size{n}" in tokens)
            if "delim-size1" in tokens or "small-op" in tokens:
                need.add("KaTeX_Size1-Regular")
            if "delim-size4" in tokens:
                need.add("KaTeX_Size4-Regular")
            if "large-op" in tokens:
                need.add("KaTeX_Size2-Regular")
    return sorted(need)


def write_katex_assets(src: Path, out: Path, fonts: list[str], version: str) -> None:
    css = (src / "katex.min.css").read_text(encoding="utf-8")
    kept = []
    for face in re.findall(r"@font-face\{[^}]*\}", css):
        name = re.search(r"url\(fonts/([^)]+)\.woff2\)", face).group(1)
        if name in fonts:
            css = css.replace(face, re.sub(r"src:[^;}]+", f'src:url(./fonts/{name}.woff2) format("woff2")', face), 1)
            kept.append(name)
        else:
            css = css.replace(face, "", 1)
    if sorted(kept) != fonts:
        raise SystemExit(f"@font-face rules missing for {sorted(set(fonts) - set(kept))}")
    header = (f"/* KaTeX {version} (MIT, see LICENSE), from cdnjs. Edited for ISEJ by build/build_fragment.py: "
              f"@font-face rules only for the fonts the About-page equations use ({', '.join(fonts)}), "
              f"woff2 only, URLs ./fonts/. */\n")
    if (out / "fonts").exists():
        shutil.rmtree(out / "fonts")
    (out / "fonts").mkdir(parents=True)
    (out / "katex.min.css").write_text(header + css, encoding="utf-8")
    for name in fonts:
        shutil.copyfile(src / "fonts" / f"{name}.woff2", out / "fonts" / f"{name}.woff2")
    shutil.copyfile(src / "LICENSE", out / "LICENSE")
    print(f"assets/katex: {len(fonts)} fonts ({', '.join(fonts)}), css {len(header + css)} bytes")


def _slider(param: str, label: str, math: str) -> str:
    return (f'          <div class="mark-slider">\n'
            f'            <label for="mark-{param}">{math}{label}</label>\n'
            f'            <input type="range" id="mark-{param}" data-param="{param}" />\n'
            f'            <output for="mark-{param}" class="mark-value"></output>\n'
            f"          </div>")


TEMPLATE = """<!-- "Our mark" for about.html. Generated by assets/katex/build/build_fragment.py; edit that, not this.
     Paste the section into about.html (suggested: after #governance, before #faq). It needs, in <head>:
       <link rel="stylesheet" href="/assets/katex/katex.min.css" />
       <link rel="stylesheet" href="/assets/field/render.css" />
       <link rel="stylesheet" href="/assets/field/mark.css" />
     and as the last element of the body: <script type="module" src="/assets/field/mark.js"></script>
     The equations are KaTeX @@VERSION@@ output rendered at build time; no KaTeX JavaScript ships. -->
<section class="block" id="mark">
  <div class="wrap">
    <h2>Our mark</h2>
    <div class="body">
      <p>Every line on this site is a level set of one function, @@z_xy@@: the points where @@z@@ takes a given value. Economists draw the same object as indifference curves, along which utility is constant, and isoquants, along which output is constant. The cover, the page banners and the map are windows on this one surface.</p>
      <div class="mark-eq">
        <div class="mark-eq-wide">@@main_wide@@</div>
        <div class="mark-eq-narrow">@@main_narrow@@</div>
      </div>
      <p>The surface is a slight tilt, @@t@@, plus four elliptical bumps, with parameters drawn once from a seeded random generator (seed @@SEED@@). Bump @@i@@ has amplitude @@a_i@@, centre @@centre@@, widths @@sx@@ and @@sy@@, and angle @@theta@@. The coordinates @@u@@ and @@v@@ measure the offset from that centre along the bump’s own axes, turned through @@theta@@:</p>
      <div class="mark-eq">@@rotation@@</div>
      <p>The figure is this page’s window on the field. The sliders set the four amplitudes: @@PHRASES@@. Each change redraws the same @@LEVELS@@ level sets of the edited function. Take an amplitude past zero and a hill turns into a hollow, or a hollow into a hill.</p>
    </div>
    <div class="wide">
      <figure class="fig mark-figure">
        <div class="isej-field" data-field="mark" data-view="@@VIEW@@" role="img" aria-label="Contour lines of z(x, y) in this page’s window on the field. The sliders below change the four amplitudes and redraw the lines.">
          <noscript><img src="/assets/banners/about.svg" width="2400" height="800" alt="" /></noscript>
        </div>
      </figure>
      <div class="mark-controls" hidden>
        <div class="mark-head">
          <span class="mark-kicker" id="mark-amplitudes">Amplitudes</span>
          <button type="button" class="mark-reset">Reset</button>
        </div>
        <div class="mark-sliders" role="group" aria-labelledby="mark-amplitudes">
@@SLIDERS@@
        </div>
      </div>
      <details class="mark-code">
        <summary>Show the code</summary>
        <p class="mark-code-source"><code>field.py</code>, lines @@L0@@ to @@L1@@</p>
        <pre><code>@@CODE@@</code></pre>
      </details>
    </div>
  </div>
</section>
"""


def build_fragment(rendered: dict, field_json: dict, field_py: Path) -> str:
    h = rendered["html"]
    l0, l1, code = code_excerpt(field_py)
    n_levels = len(field_json["views"][VIEW]["levels"])
    phrases = [f'<span class="param" data-param="{p}">{h[p]} {phrase}</span>' for p, _, phrase, _ in SLIDERS]
    values = {
        "VERSION": rendered["version"], "VIEW": VIEW, "SEED": str(read_seed(field_py)),
        "LEVELS": NUMBER_WORDS[n_levels], "L0": str(l0), "L1": str(l1), "CODE": html.escape(code, quote=False),
        "PHRASES": ", ".join(phrases[:-1]) + " and " + phrases[-1],
        "SLIDERS": "\n".join(_slider(p, label, h[p]) for p, label, _, _ in SLIDERS),
        **{k: v for k, v in h.items()},
    }
    out = TEMPLATE
    for key, value in values.items():
        out = out.replace(f"@@{key}@@", value)
    leftover = re.findall(r"@@\w+@@", out)
    if leftover:
        raise SystemExit(f"unfilled placeholders: {leftover}")
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--katex-dir", required=True, help="downloaded KaTeX: katex.min.js, katex.min.css, fonts/, LICENSE")
    p.add_argument("--jsc", required=True)
    p.add_argument("--field-json", required=True)
    p.add_argument("--field-py", required=True)
    p.add_argument("--katex-out", required=True, help="assets/katex")
    p.add_argument("--fragment-out", required=True, help="assets/field/our-mark-fragment.html")
    args = p.parse_args()
    field_json = json.loads(Path(args.field_json).read_text(encoding="utf-8"))
    check_places(field_json)
    katex_dir = Path(args.katex_dir)
    rendered = render(args.jsc, Path(__file__).with_name("katex_render.js"), katex_dir / "katex.min.js")
    fonts = required_fonts(rendered["html"])
    write_katex_assets(katex_dir, Path(args.katex_out), fonts, rendered["version"])
    fragment = build_fragment(rendered, field_json, Path(args.field_py))
    Path(args.fragment_out).write_text(fragment, encoding="utf-8")
    print(f"wrote {args.fragment_out} ({len(fragment.encode())} bytes)")


if __name__ == "__main__":
    main()
