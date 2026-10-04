# Field engine

Live contours of the ISEJ field. `engine.js` is a literal port of the Python kit in
`~/isej_identity` (field.py, src/contours.py, src/editorial.py, src/web_fields.py); every number it
uses comes from `isej-field.json`, which `src/web_engine.py` writes. Nothing in the engine re-derives
a rule, so the browser draws the same path data as the kit's static SVGs, byte for byte.

| File | What it is |
|---|---|
| `engine.js` | ES module, no dependencies (20 KB, 7.7 KB gzipped) |
| `isej-field.json` | the exported numbers; never hand-edit, regenerate (below) |
| `render.css` | the draw-in keyframes, scoped to `.isej-field` |
| `overlay.html` | visual parity check against the kit (local only) |
| `tests/` | parity test under JavaScriptCore |

## API

```js
import { loadField, traceView, renderSvg, mountBanner } from '/assets/field/engine.js';
const json = await loadField();                // fetches /assets/field/isej-field.json once
```

- `loadField(url?)` → `Promise<json>`, cached per URL (a failed load may be retried).
- `makeField(json, override?)` → `{ z(x, y), grad(x, y) → [zx, zy] }`. `override.bumps`
  (`[amp, cx, cy, sx, sy, theta]` each) and `override.tilt` (`[tx, ty]`) replace the kit's.
- `viewToField(view, u, v)` → `[x, y]`; `fieldToView(view, x, y)` → `[u, v]`. `view` is
  `json.views[name]`; u, v are view px (the view's `size`), x, y field units (y down).
- `traceView(json, name, opts?)` → `{ view, kind, size, stroke, opacity, mask, paths: [{ level,
  index, d, ochre }] }`. `d` is the kit's path data (`.1f`, clipped, min_len-filtered). Levels with
  no lines are left out; `index` keeps the level's position. `opts.field`: a `makeField` result;
  `opts.levels`: other levels (e.g. with slider overrides).
- `traceLevel(json, name, level, field?)` → `[[ [u, v], ... ], ...]` polylines in view px, full precision.
- `sampleView(json, name, field?)` → the sampled grid `{ us, vs, z, nu, nv }` (z row-major, `z[j * nu + i]`).
- `renderSvg(trace, { ink, accent, drawIn, pathLength, mask, id })` → `<svg>` string: viewBox =
  size, no background, `class="isej-field"`, `aria-hidden`. preserveAspectRatio: banners
  `xMinYMax slice`, hero `xMidYMax slice`, atlas `xMidYMid meet`. `drawIn` gives every path
  `pathLength="1" class="c" style="--i:n"`, ordered by rising level with the ochre level last.
  `mask` adds the kit's radial fade (ids prefixed by `id`). Defaults: navy ink, ochre accent.
- `landform(json, x, y, field?)` → `{ kind: 'saddle'|'min'|'max'|'slope', facing?, z, grad,
  nearest: { slug, label, distance } }`. A critical kind when the Newton step `|H⁻¹∇z|` is at most
  `json.probe.radius` (0.12 field units; Hessian by central differences of the gradient, step
  `json.probe.h`): `det < 0` saddle, else min if `z_xx > 0`, else max. Otherwise a slope; `facing`
  is the downhill compass direction, north up the page. `nearest` is the closest page marker.
- `mountBanner(el, json, name, opts?)` fills a placeholder (`<div data-field="about">`) or replaces
  a static fallback `<svg>`/`<img>`, keeping its id and classes; returns the new `<svg>`. It draws in
  once per session (`sessionStorage["isej-drawn"] = "1"`), never under `prefers-reduced-motion`,
  and otherwise adds `.drawn`. `opts`: `drawIn` (force), `ink`, `accent`, `mask` (default on for
  banners), `field`, `levels`, `id`.
- `mountHero(el, json, opts?)`: `mountBanner` for the `hero` view, warm-white ink, no mask.
- `COLOURS`: `{ navy, warmWhite, ochre }`.

## The JSON

`field` (domain, tilt, bumps), `places` (the five named landforms: xy, kind, z, name, used_by),
`probe` (landform tuning), `views` (home, about, submit, referees, advisors, people, join,
partners, contact, hero, atlas: kind, size, window `[cx, cy, scale, theta, stretch]`, pad, step,
band_top, levels, ochre, stroke, min_len, opacity, mask `[cx, cy, r, first stop]` as fractions,
and for the hero `draw` `[duration s, stagger s, cubic-bezier]`), `pages` (n, slug, href, view,
label, title, kicker, landform, field_xy, atlas_px, label_side; `news` has `href` and `view` null).
Floats are `json.dumps` reprs, so they parse bit-identically.

## Regenerate the JSON

```sh
cd ~/isej_identity && .venv/bin/python src/web_engine.py --site ~/isej_website_clone/assets/field
```

`build_web.py` also runs the export last (into `assets/web_kit/15_field_engine/` only). Before
writing, the exporter re-traces every view from the JSON alone and raises unless the result equals
the kit's own SVG markup path for path (ochre level and stroke width included).

## Test

```sh
assets/field/tests/run.sh            # or: run.sh /path/to/web_kit, or ISEJ_KIT=...
```

It copies the kit's reference SVGs and the probe fixture into `tests/fixtures/` (gitignored), fails
if the site's `isej-field.json` is not the kit's export byte for byte, then runs `parity.js` under
`jsc`. Per view: equal subpath count per level, symmetric Hausdorff distance between the JS and
kit path data (target ≤ 0.051 px), z at 20 random points vs numpy (≤ 1e-12), the exact numpy
grid; it also checks that `render.css` carries the hero's draw timing. Exit status is non-zero on
any failure.

## Overlay

```sh
cd ~/isej_website_clone && python3 -m http.server 8787 --bind 127.0.0.1
# http://127.0.0.1:8787/assets/field/overlay.html#home   (run tests/run.sh first)
```

engine.js in navy, the kit's SVG in ochre with `mix-blend-mode: difference`, at 2× by default.
Coincident lines show as one olive line; "shift the kit layer" shows what a mismatch looks like.

## Integration notes

- `render.css` names its keyframes `isej-field-draw` and keeps the hidden start only in the
  keyframes (`animation-fill-mode: both`), so reduced motion, `.drawn` or a missing stylesheet
  leave the lines drawn. A shared name would clash with the inline hero's `@keyframes isej-draw`.
- Replacing `<img class="field-bg">` gives `<svg class="isej-field field-bg">`; site.css's
  `.banner img.field-bg` does not match an svg, so that rule needs to cover `.banner .field-bg`.
- index.html's inline script sets `isej-drawn` before any module runs; remove it when wiring
  `mountHero`, or the first draw-in never plays.
- `overlay.html` and `tests/` are development files.
