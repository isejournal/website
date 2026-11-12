// Contact: trace the page's view of the field behind the address and part the lines around the text.
// Two clearing bumps (opening.js) are added: a broad hill under the kicker and address, then a
// tighter one under the notes, solved on top of the first, so the lines can come up beside the
// notes and cradle the address rather than clearing the whole rectangle around both. Both are then
// deepened until every traced line keeps at least CLEAR CSS px from each text box. Below 60rem the
// lines sit in a band under the text (contact.css), so no bump is added. Recomputed on resize.
import { loadField, makeField, mountBanner, COLOURS } from "/assets/field/engine.js";
import { clearingBump, clearance } from "/assets/field/opening.js";

const VIEW = "contact";
const WIDE = "(min-width: 60rem)";   // matches contact.css
const MARGIN = 48;   // CSS px added around each text box before its bump is solved
const CLEAR = 44;    // CSS px every traced line must keep from the text (the brief asks for 40)
const HEAD = { spread: 1.0, sign: 1 };   // kicker and address: a broad hill
const NOTES = { spread: 0.7, sign: 1 };  // the notes: a tighter hill, so lines rise beside them
const MIN_LEN = 200; // view px; drops the short clipped pieces the kit's 60 keeps (one sat under the masthead)
const GROW = 1.15;   // deepen a bump by this when a line still runs too near its box...
const TRIES = 12;    // ...at most this many times

// Screen box of the text's line boxes, in CSS px.
function textBox(els) {
  let box = null;
  for (const el of els) {
    const range = document.createRange();
    range.selectNodeContents(el);
    for (const r of range.getClientRects()) {
      if (r.width === 0 || r.height === 0) continue;
      box = box ? { l: Math.min(box.l, r.left), t: Math.min(box.t, r.top), r: Math.max(box.r, r.right), b: Math.max(box.b, r.bottom) }
        : { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
  }
  return box;
}

function setMastheadHeight(stage) {
  const head = document.querySelector("header.masthead");
  if (head) stage.style.setProperty("--contact-masthead", `${head.offsetHeight}px`);
}

// A bump for `box` on top of `bumps`; falls back to either sign when the preferred one has none.
function solveOne(json, el, box, bumps, opts) {
  const over = { ...json, field: { ...json.field, bumps } };
  return clearingBump(over, VIEW, el, box, { margin: MARGIN, ...opts })
    ?? clearingBump(over, VIEW, el, box, { margin: MARGIN, spread: opts.spread });
}

// The bumps for the current layout: the kit's own, plus two that clear the text on wide screens.
function solveBumps(json, el, head, notes) {
  const base = json.field.bumps;
  if (!matchMedia(WIDE).matches) return { bumps: base, gap: null };
  const boxes = [textBox(head), textBox(notes)];
  if (boxes.includes(null)) return { bumps: base, gap: null };
  const a = solveOne(json, el, boxes[0], base, HEAD);
  const b = solveOne(json, el, boxes[1], a ? [...base, a] : base, NOTES);
  const extra = [a, b];
  const bumps = () => [...base, ...extra.filter(Boolean)];
  const gaps = () => boxes.map((box) => clearance(json, VIEW, el, box, bumps()));
  let g = gaps();
  for (let i = 0; i < TRIES && Math.min(...g) < CLEAR; i++) {
    g.forEach((gap, k) => { if (gap < CLEAR && extra[k]) extra[k][0] *= GROW; });
    g = gaps();
  }
  if (Math.min(...g) < CLEAR) console.warn("isej contact: a line runs near the text", g.map(Math.round));
  return { bumps: bumps(), gap: Math.min(...g) };
}

// The field with this page's view keeping only pieces at least `minLen` view px long.
function withMinLength(json, minLen) {
  const view = json.views[VIEW];
  return { ...json, views: { ...json.views, [VIEW]: { ...view, min_len: Math.max(view.min_len, minLen) } } };
}

function draw(json, el, text, drawIn) {
  const { bumps, gap } = solveBumps(json, el, text.head, text.notes);
  el.dataset.clearance = gap === null ? "" : String(Math.round(gap));
  mountBanner(el, json, VIEW, { ink: COLOURS.warmWhite, mask: false, field: makeField(json, { bumps }), drawIn });
}

async function main() {
  const el = document.querySelector('.contact-screen .isej-field[data-field="contact"]');
  if (!el) return;
  const stage = el.closest(".contact-screen");
  const text = { head: [...stage.querySelectorAll(".wrap > h1, .wrap > .address")],
    notes: [...stage.querySelectorAll(".notes p")] };
  setMastheadHeight(stage);
  let json;
  try {
    json = withMinLength(await loadField(), MIN_LEN);
  } catch (err) {
    console.warn("isej field engine:", err);   // the copy still reads on navy without the lines
    return;
  }
  await document.fonts.ready;   // the lines part around the text as it is finally set
  draw(json, el, text, undefined);
  let timer = 0, last = [innerWidth, innerHeight];
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (last[0] === innerWidth && Math.abs(last[1] - innerHeight) < 2) return;
      last = [innerWidth, innerHeight];
      setMastheadHeight(stage);
      draw(json, el, text, false);
    }, 180);
  });
}

main();
