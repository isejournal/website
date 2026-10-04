# Scroll draw-in: the markup to inline (lane B)

`scroll.css` draws a diagram's lines in as the figure scrolls into view. It acts only on
`svg.scroll-draw path[pathLength]`, so each diagram needs three edits and nothing else:

1. add `scroll-draw` to the inline `<svg>`'s class;
2. turn every solid stroke that should draw into a `<path>` with the same geometry, plus
   `pathLength="1"` and `style="--i:N"` (N = draw order; equal N draw together; each step
   delays the stroke by 3 % of the figure's pass through the viewport);
3. leave everything else as it is: text, filled circles, the hairline leader lines, and every
   dashed shape (the draw-in is done with `stroke-dasharray`, so a dashed line cannot draw this
   way; dashed boxes stay visible throughout, which suits "bodies or pools").

`scroll.css` must be linked on the page (it already is on every page:
`<link rel="stylesheet" href="/assets/field/scroll.css" />`). Keep `role="img"` and the
`aria-label` on each svg.

**Fallback.** Firefox (no `animation-timeline` yet), `prefers-reduced-motion: reduce`, CSS off:
the `@supports`/media guards fail, no `stroke-dasharray` is set and the keyframes never run, so
the diagram is exactly today's static drawing. The hidden state exists only inside the keyframes.

## 1. How the journal is organised (about.html, inline svg `viewBox="0 0 2400 1250"`)

Class: `class=""` becomes `class="scroll-draw"`. Then replace these elements one for one
(stroke `#1B2A4A`, `stroke-width="1.6"` and `fill="none"` on every new path). Rectangles start at
the middle of their top edge, where the connector arrives, and run clockwise.

| now | becomes |
|---|---|
| `<rect x="900" y="250" width="600" height="120" …/>` (The Board) | `<path pathLength="1" style="--i:0" d="M1200 250 H1500 V370 H900 V250 Z" …/>` |
| `<line x1="1200" y1="370" x2="1200" y2="470" …/>` | `<path pathLength="1" style="--i:1" d="M1200 370 V470" …/>` |
| `<rect x="900" y="470" width="600" height="120" …/>` (The Executive) | `<path pathLength="1" style="--i:2" d="M1200 470 H1500 V590 H900 V470 Z" …/>` |
| `<path d="M1200 590 V650 M720 650 H1980" …/>` (one element) | three paths: `<path pathLength="1" style="--i:3" d="M1200 590 V650" …/>`, `<path pathLength="1" style="--i:4" d="M1200 650 H720" …/>`, `<path pathLength="1" style="--i:4" d="M1200 650 H1980" …/>` (the bar grows outwards from the stem) |
| `<line x1="720" y1="650" x2="720" y2="690" …/>` | `<path pathLength="1" style="--i:5" d="M720 650 V690" …/>` |
| `<line x1="1350" y1="650" x2="1350" y2="690" …/>` | `<path pathLength="1" style="--i:5" d="M1350 650 V690" …/>` |
| `<line x1="1980" y1="650" x2="1980" y2="690" …/>` | `<path pathLength="1" style="--i:5" d="M1980 650 V690" …/>` |
| `<rect x="420" y="690" width="600" height="130" …/>` (Editorial line) | `<path pathLength="1" style="--i:6" d="M720 690 H1020 V820 H420 V690 Z" …/>` |
| `<rect x="1050" y="690" width="600" height="130" …/>` (Administrative line) | `<path pathLength="1" style="--i:6" d="M1350 690 H1650 V820 H1050 V690 Z" …/>` |
| `<rect x="1680" y="690" width="600" height="130" …/>` (External line) | `<path pathLength="1" style="--i:6" d="M1980 690 H2280 V820 H1680 V690 Z" …/>` |

Unchanged: the two dashed `<line>`s (x 720 and 1980, y 820 to 900), the two dashed `<rect>`s
(Referee pool, Advisory Board), all `<text>`. The geometry is identical to today's: a closed path
draws the same mitred corners as the rectangle, and the split bar covers the same pixels.

## 2. The route of a paper (index.html, navy band; the same edits fit the light `review_route*.svg`)

Desktop, `svg.fig-desktop` (`viewBox="0 0 2400 900"`): class becomes `fig-desktop scroll-draw`;
the first element, the long route `<path d="M170.0 546.8 L…" fill="none" stroke="#F6F2EA"
stroke-width="2.4"/>`, gains `pathLength="1" style="--i:0"`. The ten station circles, the ten
`#C9C1B2` leader lines and the text stay as they are, so the stations wait on the line as it
arrives.

Mobile, `svg.fig-mobile` (`viewBox="0 0 1080 2000"`): class becomes `fig-mobile scroll-draw`;
replace the spine `<line x1="160.0" y1="300.0" x2="160.0" y2="1785.0" stroke="#F6F2EA"
stroke-width="3"/>` with `<path pathLength="1" style="--i:0" d="M160 300 V1785" fill="none"
stroke="#F6F2EA" stroke-width="3"/>`. Circles and text stay.

Only the svg that is displayed has a box, so the hidden one of the pair never animates.
