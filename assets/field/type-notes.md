# Type and the "Our mark" explorable: integration notes (lane C, 2026-10-04)

## Already wired (checked on disk, 2026-10-04)

- No page loads Google Fonts. All 13 pages link `/assets/fonts/fonts.css` and preload the two text faces.
- `about.html` holds the `#mark` section, byte-identical to the section in `our-mark-fragment.html`. It
  links `katex.min.css`, `render.css` and `mark.css`, and its mount script skips `data-field="mark"`.

## Remaining steps

1. **about.html: load the explorable.** Add this as the last element of `<body>`:
   `<script type="module" src="/assets/field/mark.js"></script>`
   Today the tag appears only inside the fragment's comment, so the page shows the JavaScript-off state:
   static banner, no sliders.
2. **Optional:** replace the fragment comment in about.html with the current one. Only its wording changed:
   it no longer contains a literal `</body>`, which naive string edits can hit.
3. **Type rules.** Part 3 of `fonts.css` applies while `fonts.css` is linked after `site.css`, as now. To
   merge it into site.css, move the part, then delete `TYPE_RULES` from `fonts/build/build_fonts_css.py` so
   a rebuild does not bring it back. The block replaces:
   - the two font stacks in `:root`;
   - `font-family`, `font-size`, `letter-spacing` and `text-transform` in `.masthead nav, h2`, `.cover .date`,
     `.issue .spine`, `.issue .label` and `.side .label`.

   It also extends `body` and `.tabular`, and adds `text-wrap` and `hanging-punctuation`.

Head order, for reference:

```html
<link rel="preload" href="/assets/fonts/source-serif-4.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/assets/fonts/libre-baskerville.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="/assets/site.css" />
<link rel="stylesheet" href="/assets/fonts/fonts.css" />            <!-- after site.css while part 3 lives here -->
<link rel="stylesheet" href="/assets/katex/katex.min.css" />        <!-- about.html only, as are the next two -->
<link rel="stylesheet" href="/assets/field/render.css" />
<link rel="stylesheet" href="/assets/field/mark.css" />
```

These were the Google Fonts lines; they are now gone everywhere:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet" />
```

## Visible changes to expect

- **Old-style figures in running text.** site.css has asked for `oldstyle-nums` all along, but the Google
  Fonts build of Source Serif 4 has no `onum`. It also lacks `smcp`, `c2sc`, `lnum`, `sups` and `subs`, so
  body figures were lining until now. Lists and `.tabular` keep lining tabular figures.
- **Small caps.** The nav, `h2` labels, cover date, issue spine and label, and side labels are now Source
  Serif 4 small caps at `--isej-step-0` with 0.06em tracking. They were Libre Baskerville capitals at
  `--isej-step--1` with 0.14em. Small caps are 552.5 units tall against 770 for Baskerville capitals,
  about 92% of the old height at body size.
- **Real italic for `h3`.** The identity's font folder has only the upright Libre Baskerville. The italic
  comes from google/fonts at the same release, where the upright file is byte-identical to the local one.
- **True bold.** Source Serif bold renders at 700; Google served 400–600.

## Sizes

| File | Source | Shipped |
|---|---|---|
| `fonts/source-serif-4.woff2` (opsz 8–60, wght 400–700) | 1,209,508 | 132,712 |
| `fonts/libre-baskerville.woff2` (wght 400–700) | 171,900 | 35,580 |
| `fonts/libre-baskerville-italic.woff2` (wght 400–700) | 167,456 | 32,956 |
| three faces | 1,548,864 | 201,248 |

- The Google Fonts latin files they replace totalled 177,584 bytes, without small caps or old-style figures.
- Keeping Source Serif's full 200–900 weight range would make its file 191,768 bytes.
- `fonts.css` is 5,286 bytes.
- KaTeX, About only: `katex.min.css` 19,766 plus five fonts totalling 57,012 (Main-Regular, Math-Italic,
  Size1, Size2, Size3). No KaTeX JavaScript ships.
- `our-mark-fragment.html`: 55,700 bytes, 4,268 gzipped.
- `mark.js`: 7,361 bytes. `mark.css`: 5,638 bytes.

## fontTools feature check (`fonts/build/check_fonts.py`; the build fails if any check fails)

- **source-serif-4:**
  - `smcp` has 78 substitutions and `c2sc` 88. Letters and digits map to small-cap glyphs with outlines.
  - `onum` and `pnum` have 20 each, `sups` 75, `subs` 16; `kern` is present.
  - `ss01`/`ss02` were pruned. In the source they substitute only Cyrillic (Bulgarian; Serbian and
    Macedonian alternates), which the Latin subset drops.
- **Libre Baskerville upright and italic:** `liga`, `dlig`, `frac`, `sups`, `subs` and `kern` are all present.
- **In Chrome:** all three faces and the five KaTeX fonts loaded, and `#mark h2` computes to Source Serif 4
  with `all-small-caps`.

## The equation and the explorable

- **Notation** follows the brief: t·(x, y), a_i, σ_{x,i}, σ_{y,i}, θ_i. The rotation is the matrix from
  `field.py` lines 42–43, which settles the sign that the kit PNG's "rotated by θ_k" leaves open.
- **Faithfulness:** the typeset formula, transcribed to numpy, reproduces `Field.__call__` at 1,000 random
  points (largest difference 0). As a control, a transposed matrix would be off by up to 0.332.
- **Initial state:** the untouched figure's path data equals the page banner's. mark.js uses the exported
  amplitudes exactly; Chrome would otherwise round slider values to 15 digits.
- **Chrome tests:**
  - every slider at both ends re-traces with no draw-in and exactly one ochre line;
  - Reset restores the banner's paths;
  - an edited trace takes 12.4 ms;
  - the parameter word highlights on pointer and focus;
  - at 320, 375, 430, 480, 600 and 834 px the page never scrolls sideways and both equations fit.

## Rebuild

- **Fonts:** `assets/fonts/build/build_fonts.sh`. Downloads are pinned and sha256-checked. It instances,
  subsets, writes fonts.css and runs `check_fonts.py`.
- **KaTeX and fragment:** `assets/katex/build/build_katex.sh`.
  - Fetches KaTeX 0.16.47 from cdnjs and checks the SRI hash, then renders with jsc.
  - Reads the seed and the code excerpt from `field.py`, and the level count from `isej-field.json`.
  - Fails if the four place phrases ("the ridge just below the bottom edge", and so on) stop being true of
    the exported About view.
  - After a rebuild, paste the section into about.html again.

## Open issues

1. **Latin Extended-A is not in the subset** (per brief). Names with ł, ő, č or ş fall back to Georgia glyph
   by glyph. Adding U+0100–017F costs 27,208 bytes across the three files (Source Serif +14,644, upright
   +6,784, italic +5,780). Worth adding before the masthead lists such names.
2. **Rebuilds are not byte-identical.** The instancer's GPOS overflow repair and font timestamps vary from
   run to run; sizes stay within about 250 bytes. `check_fonts.py` re-checks the features on every build.
3. **These files deploy with the site.** `fonts/build/`, `katex/build/` and this note are public unless
   excluded (for example with `.vercelignore`) or moved to `~/isej_identity`. They hold no secrets.
4. **a₃ does little in this view.** At its full ±1.5 swing it moves z by up to 0.28 (5.3 level gaps), but
   only over the top 9% of the About frame; the other sliders reach 36–95% of it. `data-view` on the figure
   can select another view, but the copy is written and checked for `about` only.
5. **Testing limits.** The shared Chrome window was occluded, so the test page shimmed
   `requestAnimationFrame` and `IntersectionObserver`. The draw-in was applied (`isej-field-draw` on 10
   paths) but not watched, and `prefers-reduced-motion` was not emulated; under it mark.js passes
   `drawIn: false`.
6. **Caching.** Chrome served a stale mark.css during testing. Version the asset URLs after edits if the
   host caches `/assets`.
