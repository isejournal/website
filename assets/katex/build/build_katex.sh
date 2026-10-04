#!/bin/zsh
# Rebuild assets/katex (CSS + only the fonts used) and assets/field/our-mark-fragment.html
# (ISEJ site, lane C, 2026-10-04). KaTeX runs at build time only, under JavaScriptCore; katex.min.js never ships.
# Inputs: KaTeX from cdnjs (checked against the SRI hashes cdnjs publishes), assets/field/isej-field.json
# (lane A's export), $HOME/isej_identity/field.py.
set -euo pipefail
HERE=${0:A:h}
OUT=${HERE:h}
SITE=${OUT:h:h}
PY=/Library/Frameworks/Python.framework/Versions/3.13/bin/python3
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
V=0.16.47
CDN=https://cdnjs.cloudflare.com/ajax/libs/KaTeX/$V
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/fonts"
curl -sSf -o "$TMP/katex.min.js" "$CDN/katex.min.js"
curl -sSf -o "$TMP/katex.min.css" "$CDN/katex.min.css"
for f in AMS-Regular Main-Regular Main-Bold Math-Italic Size1-Regular Size2-Regular Size3-Regular Size4-Regular; do
  curl -sSf -o "$TMP/fonts/KaTeX_$f.woff2" "$CDN/fonts/KaTeX_$f.woff2"
done
curl -sSf -o "$TMP/LICENSE" "https://raw.githubusercontent.com/KaTeX/KaTeX/v$V/LICENSE"
sri() { print -r -- "sha512-$(openssl dgst -sha512 -binary "$1" | base64)"; }
[[ $(sri "$TMP/katex.min.js") == "sha512-eDHxAxGzhSpNkUD1AP76+u07Nn3VtMwdj9GrN1uXDkjRGsroJhqtEr639ybY3iVOA58R5h+jWMJ9dlV5ilsYBQ==" ]] || { echo "katex.min.js SRI mismatch" >&2; exit 1; }
[[ $(sri "$TMP/katex.min.css") == "sha512-kI2+BaD3/4lqajGWnpHozrL4U8PFaP/ZCbCrMyftFQuzVYIak0qhP2ZJgP0fXNq/myQmRtRvwODhDS2Gxdg6Vg==" ]] || { echo "katex.min.css SRI mismatch" >&2; exit 1; }

"$PY" "$HERE/build_fragment.py" --katex-dir "$TMP" --jsc "$JSC" \
  --field-json "$SITE/assets/field/isej-field.json" --field-py "$HOME/isej_identity/field.py" \
  --katex-out "$OUT" --fragment-out "$SITE/assets/field/our-mark-fragment.html"
