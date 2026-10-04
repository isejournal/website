#!/bin/zsh
# Rebuild assets/fonts (ISEJ site, lane C, 2026-10-04): subset woff2 files, licences, fonts.css.
# Inputs: $HOME/isej_identity/fonts (Source Serif 4 4.004, Libre Baskerville 2.005, Source Serif's OFL.txt)
#         and LibreBaskerville-Italic[wght].ttf + its OFL.txt from google/fonts at a pinned commit
#         (same release as the local upright file, which is byte-identical to the one at that commit).
# Tools: the python.org 3.13 framework Python, which has fontTools and brotli.
set -euo pipefail
HERE=${0:A:h}
OUT=${HERE:h}
SITE=${OUT:h:h}
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
SRC=$HOME/isej_identity/fonts
# Italic: the commit that last changed it ("VF replacement", 2025-10-17). Licence: the commit that last changed
# OFL.txt (2025-03-21), whose copyright line matches the fonts' name tables; the font commit's tree has an older text.
GF=https://raw.githubusercontent.com/google/fonts/9e63336c5ec724faa1e1e394745b33dcbb58a9c9/ofl/librebaskerville
GF_OFL=https://raw.githubusercontent.com/google/fonts/1fee23aceb88190a096292788d35bf7ca0d03968/ofl/librebaskerville
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ITALIC="$TMP/LibreBaskerville-Italic[wght].ttf"
curl -sSf -o "$ITALIC" "$GF/LibreBaskerville-Italic%5Bwght%5D.ttf"
curl -sSf -o "$TMP/OFL-LibreBaskerville.txt" "$GF_OFL/OFL.txt"
shasum -a 256 -c - <<SUMS
223959683dc73ec4437bd61fabaa4b3f22209e22855ffd3aee36ba61a5116e97  $ITALIC
3624eddd4c8f8a908130a417ae7cd089c9da69899c4e0ca1a5217d0a6fae16fd  $TMP/OFL-LibreBaskerville.txt
SUMS

# Basic Latin, Latin-1, Google's "latin" extras, general punctuation, super/subscripts, arrows, minus.
UNI="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2070-209F,U+20AC,U+2122,U+2190-21FF,U+2212,U+2215"
COMMON=(--flavor=woff2 --unicodes="$UNI" --name-IDs='*' --name-languages=0x0409)
SS4_FEATURES=smcp,c2sc,onum,lnum,tnum,pnum,liga,kern,ss01,ss02,sups,subs,frac,ccmp,locl,mark,mkmk
LB_FEATURES=liga,dlig,kern,sups,subs,frac,ccmp,locl,mark,mkmk

# Source Serif 4 keeps both axes; wght is limited to 400-700, the weights the site uses (full range: +59 KB).
"$PY" -m fontTools.varLib.instancer "$SRC/SourceSerif4[opsz,wght].ttf" wght=400:700 -q -o "$TMP/ss4.ttf"
"$PY" -m fontTools.subset "$TMP/ss4.ttf" $COMMON --layout-features="$SS4_FEATURES" --output-file="$OUT/source-serif-4.woff2"
"$PY" -m fontTools.subset "$SRC/LibreBaskerville[wght].ttf" $COMMON --layout-features="$LB_FEATURES" --output-file="$OUT/libre-baskerville.woff2"
"$PY" -m fontTools.subset "$ITALIC" $COMMON --layout-features="$LB_FEATURES" --output-file="$OUT/libre-baskerville-italic.woff2"
cp "$SRC/OFL.txt" "$OUT/OFL-SourceSerif4.txt"
cp "$TMP/OFL-LibreBaskerville.txt" "$OUT/OFL-LibreBaskerville.txt"

"$PY" "$HERE/build_fonts_css.py" --fonts "$SRC" --italic "$ITALIC" --site "$SITE" --unicodes "$UNI" --out "$OUT/fonts.css"
"$PY" "$HERE/check_fonts.py" "$OUT"
