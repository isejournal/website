# Motion notes (lane B, 2026-10-04)

Three pieces: the page transition ("the window travels"), the scroll draw-in of the two
diagrams, and the map probe. All hand-written, no libraries, no new dependencies. Tested in
Chrome 154 (headless, driven over the DevTools protocol) and JavaScriptCore; Safari and Firefox
were not available to test.

## Files

| file | what it is |
|---|---|
| `transition.css` | `@view-transition` opt-in (no-preference only), the masthead held still, the `field` group: 520 ms, `cubic-bezier(.3,.1,.2,1)`, clipped frame, old/new transforms from custom properties |
| `transition.js` | classic script, 118 lines: names one field element per page and computes the similarity between the two windows |
| `scroll.css` | scroll-driven draw-in for `svg.scroll-draw path[pathLength]`, staggered by `--i` |
| `scroll-inline.md` | the exact element-by-element edits for the organisation chart and the review route |
| `atlas.js`, `atlas.css` | map page: traces the atlas contours (in a Worker), the probe, the marker fixes |
| `map-fragment.html` | the `<section class="atlas">` markup with a placeholder for the generated svg |

## How the transition works

On `pageswap` the old page names its field element `field` and stores, in sessionStorage, its view
name, its box and how its view px map to screen px (scale and offset of the slice or meet fit).
On `pagereveal` the new page measures its own element and composes old screen → old view px →
field → new view px → new screen. With stretch 1 this is a similarity whose view-px linear part is
(s_A/s_B)·R(θ_A − θ_B), so it is one rotation plus one uniform scale about a fixed point
P = β/(1 − λ), or a pure shift when λ = 1. The old image animates from rest to that move and the
new one from its inverse to rest, both about P (`transform-origin`), with the group's frame
morphing from the old box to the new one and clipping. Only rotate, scale and one shift
interpolate, so the two images agree on every field point at every frame. Windows come from
`isej-field.json` (`views.*.window`, `size`, `kind`), cached in sessionStorage on first load.

Plain cross-fade instead whenever anything is unknown: no record from the old page (first page,
JavaScript off there, record older than 5 s), the old field scrolled out of view, an unsized
placeholder, a view with stretch ≠ 1, or no field element. Reduced motion and Firefox: ordinary
navigation (the opt-in sits inside `prefers-reduced-motion: no-preference`).

## What each piece bends in the kit rules

- **Transition.** It is a camera move (shift, turn, zoom and cross-fade), not a draw-in; it plays
  once per navigation and never loops. For its 520 ms the old and the new ochre line are both
  visible, crossing; that is the one place two ochre lines share the screen. Everything else
  holds: reduced motion gets plain navigation, no script means no move.
- **Scroll draw-in.** Progress is tied to the scroll position, so a reader who scrolls back above
  a figure sees it undraw, and it draws again on the way down. It never runs on its own and the
  hidden state lives only in the keyframes.
- **Map probe.** The ochre line follows the pointer (user-driven; replaced, not animated; one
  150 ms fade on first show). To keep one ochre line per graphic, the atlas's own ochre level
  turns warm white while the probe shows. A 4 px warm-white ring marks the probe point.
- **Map without JavaScript.** With the contour group shipped empty (the orchestrator's plan), the
  no-script map is markers on navy without contours. Every marker and the legend list still link.

## Browser support

- Cross-document view transitions: Chromium 126+ (tested in 154). Safari 18.2+ has the opt-in;
  not tested here. Where `pageswap`/`pagereveal` do not fire, nothing is named and the page
  cross-fades. Firefox: ordinary navigation.
- Scroll-driven animations: Chromium 115+ (tested); Safari 26 should run them (not tested);
  Firefox without a flag shows the static drawing.
- Module Worker for the atlas: if it cannot start, the trace runs on the main thread and a
  console warning says so.
- `@media (scripting: enabled)` reserves the probe panel's room so revealing it shifts nothing;
  where unsupported the panel appears on reveal (a small shift on narrow screens only).
- CSS `r` on `circle.hit` (touch targets) was tested in Chromium; generator equivalent `r="108"`.

## What the pages need

Already in place on every page (checked 14:56): `transition.css` and `scroll.css` in `<head>`,
`transition.js` as a classic script in `<head>`, and `data-field="<view>"` on each field element.
transition.js names the element itself and picks the first `[data-field]` whose value is a view in
the JSON (so `data-field="mark"` on About is skipped), then `#hero`, `#atlas`, `.banner .field-bg`.
Nothing else to tag; do not add `view-transition-name` in CSS (a duplicate name cancels the move).

Still to do:

1. **map.html** is broken at the moment: it holds `map-fragment.html` verbatim, with the
   `<!-- PASTE … -->` placeholder unreplaced and no `<svg id="atlas">`, so there are no markers.
   Paste the generated svg there with `role="group"`, `aria-describedby="atlas-legend"` and
   `<g class="contours" data-field="atlas"></g>` (no `isej-field` class, so the generic mount
   loop leaves it to atlas.js), drop the comments, and add
   `<link rel="stylesheet" href="/assets/field/atlas.css" />` in `<head>` and
   `<script type="module" src="/assets/field/atlas.js"></script>` before `</body>`.
2. **Hero height**: add `.cover .hero-mount { height: clamp(14rem, 36vw, 30rem); }` (the svg's own
   height). Without it the placeholder is 0 px tall until the engine mounts, so arriving at Home
   cross-fades instead of travelling, and the cover shifts when the hero mounts. Verified by
   injecting the rule: about → home then travels.
3. **about.html and index.html**: apply `scroll-inline.md`.
4. Optional: the banner placeholders hold the static image only inside `<noscript>`, so an
   arriving page has no lines until the engine mounts (empty at reveal in 4 of 5 test runs). The
   move is still exact (the empty box is measured as the svg it will hold), but the new lines
   appear partway through. A visible static `<img>` inside the placeholder, which `mountBanner`
   replaces, would have them there from the first frame.

Map accessibility in this fragment: a visually hidden description (`#atlas-legend`) referenced by
`aria-describedby`; keyboard focus on a marker dims the others (`:focus-within`, which also
covers the `:has(:focus-visible)` rule in site.css; either can go); touch hit circles of
r = 108 view units (24 px needs 100 at a 320 px viewport); the legend list is hidden on wide
screens, where the svg's links are reachable, because visually hidden links there are invisible
focus stops. Readout text: warm white 12.7:1 and ochre labels 4.6:1 on navy.

## How it was tested

Scripts live in the session scratchpad (`…/scratchpad/laneb/`), not in the site; move them into
`assets/field/tests/` if they should stay.

- **Transform maths, JavaScriptCore** (`test_transition.js`): transition.js loaded twice against a
  fake DOM (old page fires `pageswap`, new page `pagereveal`), checked against an independent
  derivation (inverse window by a 2×2 solve, CSS interpolation emulated). Nine pairs on the real
  JSON windows: about → join (pure shift, 1005.882 px, 270 px), hero → about (scale 1.529412),
  about → people (rotate −π/2, scale 0.85), atlas → partners (rotate −0.51 rad, scale 1.488095),
  referees → atlas, contact → contact, two phone pairs, and an empty placeholder. Old and new agree
  on 200 field points at 9 progress steps to ≤ 1.1e-3 px (the 3-decimal CSS strings); the view-px
  linear part equals (s_A/s_B)·R(θ_A − θ_B) to ≤ 7e-13. Guards: scrolled away, no record, stale
  record all give a plain cross-fade.
- **Transition in Chrome** (`vt_test.py`): paired pages draw the same field grid through their own
  windows (old red, new blue on black; `plus-lighter` keeps them in separate channels). The real
  transition is paused at 0, 130, 260, 390 and 520 ms and screenshotted. Median red/blue centroid
  distance 0.013 to 0.074 px across four pairs; the largest values (up to 2.6 px) are dots cut by
  the frame's edge. At 0 ms red sits on the old page's dots, at 520 ms blue on the new page's.
- **Real pages** (`vt_real.py`, `python3 -m http.server 8788`): about → people, home → about,
  map → about, about → map and referees → policies all travelled (properties set, one element
  named, no console errors); about → home cross-faded (see item 2); reduced motion: no transition.
- **Map** (scratch copy of map.html, since deleted): the Worker traced the 24 levels 164 ms after
  navigation, all 24 `d` strings identical to `14_atlas_nav/atlas_nav_navy.svg`. Readouts at five
  points equal z from `field.py`; one ochre line visible each time; the numeric cells' right edges
  never moved; URL `?x=1.625&y=0.612` written after 250 ms and restored to an identical readout;
  Tab reaches the markers, the readout follows focus and the others dim to 0.5; a probe update
  costs 1.0 to 1.6 ms; at 375 px the hit circles are 30.9 px across and a tap places the probe.
  Found and fixed on the way: a focus listener on the svg made Chrome focus the whole map on tap.
- **Scroll draw-in** (`scroll_test.py`): with motion reduced, the edited organisation chart and
  route render pixel-identical to today's (0 pixels differ); with motion on, strokes complete in
  `--i` order between 40 % and 55 % of the figure's pass through the viewport. A bare `view()` on
  each path also runs in Chrome 154 and follows the svg's box; the named timeline says so
  explicitly.
