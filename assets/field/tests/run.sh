#!/bin/sh
# engine.js parity test against the Python kit, under JavaScriptCore (no node on this machine).
# Usage: assets/field/tests/run.sh [web_kit dir]   (default: $ISEJ_KIT or ~/isej_identity/assets/web_kit)
# Copies the kit's reference SVGs and probe fixture into tests/fixtures/ (also used by overlay.html),
# checks the site's isej-field.json is the kit's export byte for byte, then runs parity.js.
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
FIELD="$(dirname "$HERE")"
KIT="${1:-${ISEJ_KIT:-$HOME/isej_identity/assets/web_kit}}"
JSC="${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}"
FIX="$HERE/fixtures"
mkdir -p "$FIX"
for slug in home about submit referees advisors people join partners contact; do
  cp "$KIT/01_page_banners/field_only/${slug}_light.svg" "$FIX/$slug.svg"
done
cp "$KIT/02_home_hero/hero_animated_light.svg" "$FIX/hero.svg"
cp "$KIT/14_atlas_nav/atlas_nav_navy.svg" "$FIX/atlas.svg"
cp "$KIT/15_field_engine/engine_probes.json" "$FIX/engine_probes.json"
if ! cmp -s "$KIT/15_field_engine/isej-field.json" "$FIELD/isej-field.json"; then
  echo "FAIL: $FIELD/isej-field.json differs from the kit export; run: .venv/bin/python src/web_engine.py --site $FIELD"
  exit 1
fi
echo "isej-field.json: site copy is the kit export, byte for byte"
"$JSC" -m "$HERE/parity.js" -- "$FIELD"
