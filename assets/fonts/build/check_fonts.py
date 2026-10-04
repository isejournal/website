"""Check the shipped woff2 subsets (ISEJ site, lane C): required OpenType features survived,
small caps and figure substitutions reach real outlines, kerning is present, axes are as declared.
Exits non-zero on any failure. Usage: python3 check_fonts.py <assets/fonts>
"""
from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont

REQUIRED = {
    "source-serif-4.woff2": {
        "gsub": ["smcp", "c2sc", "onum", "lnum", "tnum", "pnum", "liga", "sups", "subs", "frac"],
        "axes": {"wght": (400, 700), "opsz": (8, 60)},
        "single": {"smcp": "abcxyz0123456789", "c2sc": "ABCXYZ0123456789", "onum": "0123456789",
                   "pnum": "0123456789", "sups": "123", "subs": "123"},
    },
    "libre-baskerville.woff2": {
        "gsub": ["liga", "dlig", "sups", "subs", "frac"],
        "axes": {"wght": (400, 700)},
        "single": {"sups": "123", "subs": "123"},
    },
    "libre-baskerville-italic.woff2": {
        "gsub": ["liga", "dlig", "sups", "subs", "frac"],
        "axes": {"wght": (400, 700)},
        "single": {"sups": "123", "subs": "123"},
    },
}
# Present in the source but act only on Cyrillic, which the Latin subset drops; pruning them is expected.
EXPECTED_PRUNED = {"source-serif-4.woff2": ["ss01", "ss02"]}


def _features(font: TTFont, table: str) -> set[str]:
    return {fr.FeatureTag for fr in font[table].table.FeatureList.FeatureRecord} if table in font else set()


def _single_map(font: TTFont, tag: str) -> dict[str, str]:
    gsub, out = font["GSUB"].table, {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != tag:
            continue
        for index in fr.Feature.LookupListIndex:
            for sub in gsub.LookupList.Lookup[index].SubTable:
                sub = getattr(sub, "ExtSubTable", sub)
                out.update(getattr(sub, "mapping", {}) or {})
    return out


def _has_kerning(font: TTFont) -> bool:
    gpos = font["GPOS"].table
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern" and fr.Feature.LookupListIndex:
            return True
    return False


def check(folder: Path) -> list[str]:
    failures = []
    for name, spec in REQUIRED.items():
        font = TTFont(folder / name)
        cmap, glyf = font.getBestCmap(), font["glyf"]
        gsub = _features(font, "GSUB")
        axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes}
        print(f"{name}: {(folder / name).stat().st_size} bytes, {len(font.getGlyphOrder())} glyphs, "
              f"axes {axes}, GSUB {' '.join(sorted(gsub))}, GPOS {' '.join(sorted(_features(font, 'GPOS')))}")
        failures += [f"{name}: missing GSUB {t}" for t in spec["gsub"] if t not in gsub]
        failures += [f"{name}: axis {t} is {axes.get(t)}, expected {r}" for t, r in spec["axes"].items() if axes.get(t) != r]
        if not _has_kerning(font):
            failures.append(f"{name}: no kern lookups")
        for tag, sample in spec["single"].items():
            mapping = _single_map(font, tag)
            for ch in sample:
                target = mapping.get(cmap.get(ord(ch), ""))
                if target is None or glyf[target].numberOfContours == 0:
                    failures.append(f"{name}: {tag} does not map {ch!r} to a glyph with outlines")
            print(f"  {tag}: {len(mapping)} substitutions, sample {sample!r} all mapped to outlined glyphs"
                  if not any(f.startswith(f"{name}: {tag} ") for f in failures) else f"  {tag}: FAILED")
        for tag in EXPECTED_PRUNED.get(name, []):
            print(f"  {tag}: pruned (Cyrillic-only in the source)" if tag not in gsub else f"  {tag}: kept")
    return failures


if __name__ == "__main__":
    problems = check(Path(sys.argv[1]))
    for p in problems:
        print("FAIL", p)
    sys.exit(1 if problems else 0)
