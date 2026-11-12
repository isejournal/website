// The home hero's field answers the pointer. A shallow hollow follows the cursor and the level sets
// are retraced from the same function the kit draws, so the lines part around it and close behind.
// Mouse and pen only; never under prefers-reduced-motion; idle costs nothing.
import { makeField, traceView, viewToField, COLOURS } from "/assets/field/engine.js";

const DEPTH = -0.34;     // amplitude of the hollow, field units
const RADIUS = 0.24;     // its width (one sigma), field units
const FOLLOW = 0.10;     // share of the remaining distance covered per frame
const SWELL = 0.06;      // the same for the hollow's depth, so it eases in and out
const REST = 0.003;      // below this the field is back to itself

export function attach(svg, json, view = "hero") {
  if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    const still = goal.a === 0 && now.a < REST;
    const bumps = still ? json.field.bumps : [...json.field.bumps, [DEPTH * now.a, now.x, now.y, RADIUS, RADIUS, 0]];
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
    draw(traceView(json, view));
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
