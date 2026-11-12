// The home hero's field answers the pointer. A shallow hollow follows the cursor and the level sets
// are retraced from the same function the kit draws, so the lines part around it and close behind.
// Mouse and pen only; never under prefers-reduced-motion; idle costs nothing.
// With an opening mount (opening.js) the hollow adds to the bump that keeps the title clear, and it
// fades out as the pointer nears the text, so it can never draw a line into the words.
import { makeField, traceView, viewToField, fieldToView, COLOURS } from "/assets/field/engine.js";

const DEPTH = -0.34;     // amplitude of the hollow, field units
const RADIUS = 0.24;     // its width (one sigma), field units
const FOLLOW = 0.10;     // share of the remaining distance covered per frame
const SWELL = 0.06;      // the same for the hollow's depth, so it eases in and out
const REST = 0.003;      // below this the field is back to itself
const NEAR = 2;          // the hollow is gone within NEAR sigmas of the text block (screen px)...
const FAR = 3;           // ...and full strength from FAR sigmas out

export function attach(svg, json, view = "hero", mount = null) {
  if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const base = () => (mount ? mount.bumps() : json.field.bumps);
  const stage = svg.closest(".cover") ?? svg;
  const spec = json.views[view];
  // while the field is moving it is traced on a grid three times as coarse, which keeps each frame short
  const live = { ...json, views: { ...json.views, [view]: { ...spec, step: spec.step * 3 } } };
  const paths = new Map();
  const now = { x: 0, y: 0, a: 0 }, goal = { x: 0, y: 0, a: 0 };
  let running = false, placed = false;

  const toField = (event) => {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return viewToField(spec, p.x, p.y);
  };

  // 0 when the hollow's centre (field x, y) is near the text block, 1 well away from it; measured on
  // screen, the hollow's sigma converted with the CTM. Worst case it lowers the block by under 0.008.
  const strength = (x, y) => {
    const box = mount?.box();
    if (!box) return 1;
    const ctm = svg.getScreenCTM(), sigma = RADIUS / spec.window[2] * ctm.a;
    const p = new DOMPoint(...fieldToView(spec, x, y)).matrixTransform(ctm);
    const m = mount.margin ?? 0;   // measured from the cleared block, not the bare text
    const dx = Math.max(box.l - m - p.x, 0, p.x - box.r - m);
    const dy = Math.max(box.t - m - p.y, 0, p.y - box.b - m);
    const d = Math.hypot(dx, dy) / sigma;
    return Math.min(1, Math.max(0, (d - NEAR) / (FAR - NEAR)));
  };

  const draw = (trace) => {
    const seen = new Set();
    for (const p of trace.paths) {
      let el = paths.get(p.index);
      if (!el) {
        el = document.createElementNS("http://www.w3.org/2000/svg", "path");
        el.setAttribute("fill", "none");
        el.setAttribute("stroke", p.ochre ? COLOURS.ochre : COLOURS.warmWhite);
        el.setAttribute("stroke-width", trace.stroke);
        svg.append(el);
        paths.set(p.index, el);
      }
      el.setAttribute("d", p.d);
      seen.add(p.index);
    }
    for (const [index, el] of paths) if (!seen.has(index)) el.setAttribute("d", "");
  };

  const frame = () => {
    now.x += (goal.x - now.x) * FOLLOW;
    now.y += (goal.y - now.y) * FOLLOW;
    now.a += (goal.a - now.a) * SWELL;
    const f = strength(now.x, now.y);   // from where the hollow is, not where the pointer is
    const still = goal.a === 0 && now.a < REST;
    const bumps = still ? base() : [...base(), [DEPTH * now.a * f, now.x, now.y, RADIUS, RADIUS, 0]];
    const moving = Math.hypot(goal.x - now.x, goal.y - now.y) > 0.002 || Math.abs(goal.a - now.a) > REST;
    const settling = still || !moving;      // the last frame is traced at full resolution
    draw(traceView(settling ? json : live, view, { field: makeField(json, { bumps }) }));
    if (settling) running = false;
    else requestAnimationFrame(frame);
  };

  const wake = () => { if (!running) { running = true; requestAnimationFrame(frame); } };

  const begin = () => {
    svg.replaceChildren();          // take over from the draw-in paths; the first frame redraws them all
    svg.classList.add("drawn");
    draw(traceView(json, view, { field: makeField(json, { bumps: base() }) }));
    if (mount) mount.render = () => { goal.a = 0; now.a = 0; draw(traceView(json, view, { field: makeField(json, { bumps: base() }) })); };
    stage.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      [goal.x, goal.y] = toField(event);
      if (!placed) { now.x = goal.x; now.y = goal.y; placed = true; }
      goal.a = 1;
      wake();
    });
    stage.addEventListener("pointerleave", () => { goal.a = 0; wake(); });
  };

  // wait for the draw-in to finish (render.css: 3.2 s plus 0.15 s per level) before taking over
  const [duration, stagger] = spec.draw ?? [3.2, 0.15];
  const wait = svg.classList.contains("drawn") ? 0 : (duration + stagger * spec.levels.length + 0.2) * 1000;
  setTimeout(begin, wait);
}
