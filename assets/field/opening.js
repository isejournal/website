// The page opening: the page's own view of the field fills the navy band behind the title, and the
// lines part around the text. One smooth bump is added under the text block, with the smallest
// amplitude (either sign) that puts the whole block, plus a margin, between two neighbouring levels
// (or beyond the outermost), so no line can cross it; the field is
// then traced as the kit traces it. Recomputed on resize (debounced). Below 60rem the lines sit in a
// band under the text instead (CSS), so no bump is added there. A page may crop its view to the
// left, middle or right: <div data-field="about" data-anchor="mid"> (default: as engine.js renders).
// Motion, on every load and never under prefers-reduced-motion: the lines draw in (render.css) with
// the bump OPEN times too strong, then ease to the bump that clears the text, then answer the
// pointer (touch.js). Every amplitude passed through lies in the one gap that keeps the block clear.
import { makeField, traceView, traceLevel, renderSvg, mountBanner, viewToField, COLOURS } from "/assets/field/engine.js";

const WIDE = "(min-width: 60rem)";  // matches site.css
const MARGIN = 50;      // CSS px kept clear around the text block (the check asks for at least 40)
const SPREAD = 1.0;     // bump sigma as a multiple of the cleared block's half-size; wider spreads the rings
const EPS = 0.012;      // field units the block clears the outermost level by
const SAMPLES = 32;     // grid points per side when testing the block
const CLEAR = 44;       // CSS px every traced line must keep from the text, checked after tracing
const GROW = 1.2;       // if a small loop slipped between the samples, deepen the bump by this...
const TRIES = 8;        // ...at most this many times
const FIT = { banner: [0, 1], hero: [0.5, 1] };  // preserveAspectRatio anchors, as engine.js renders (slice)
const ANCHOR = { min: 0, mid: 0.5, max: 1 };     // data-anchor: the x anchor a page may choose instead
const HEADROOM = 0.012; // field units kept for the pointer's hollow (touch.js lowers the block by under 0.008)
const OPEN = 1.6;       // the draw-in starts with the bump this many times its final amplitude...
const KEEP = 0.8;       // ...but never past this share of the way to the far edge of its gap
const SETTLE = 2500;    // ms the bump takes to ease to its final amplitude
const COARSE = 3;       // while settling the field is traced on a grid this many times coarser (as touch.js)
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Screen box of the text itself (line boxes, not the block's max-width), in CSS px.
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

// CSS px (relative to the stage) -> view px, for an svg filling the stage with `slice`.
function stageMap(stage, view) {
  const r = stage.getBoundingClientRect(), [w, h] = view.size, [fx, ay] = FIT[view.kind] ?? FIT.banner;
  const ax = ANCHOR[stage.dataset.anchor] ?? fx;
  const k = Math.max(r.width / w, r.height / h);
  const ox = r.left + ax * (r.width - k * w), oy = r.top + ay * (r.height - k * h);
  return { k, toView: (x, y) => [(x - ox) / k, (y - oy) / k], toScreen: (u, v) => [ox + k * u, oy + k * v] };
}

// The one bump [amp, cx, cy, sx, sy, theta] that clears `box` (screen px), or null when none is needed.
export function clearingBump(json, viewName, stage, box, opts = {}) {
  return solveBump(json, viewName, stage, box, opts)?.bump ?? null;
}

// The bump and the interval [min, max] of amplitudes for which the block stays inside the same gap.
function solveBump(json, viewName, stage, box, { margin = MARGIN, spread = SPREAD, headroom = 0, sign = 0 } = {}) {
  const view = json.views[viewName], map = stageMap(stage, view);
  const base = makeField(json);
  const [l, t, r, b] = [box.l - margin, box.t - margin, box.r + margin, box.b + margin];
  const [u0, v0] = map.toView((l + r) / 2, (t + b) / 2);
  const [cx, cy] = viewToField(view, u0, v0);
  const scale = view.window[2], theta = view.window[3];
  const sx = spread * ((r - l) / 2 / map.k) * scale, sy = spread * ((b - t) / 2 / map.k) * scale;
  // Each gap between neighbouring levels (and above the top one, below the bottom one) admits an
  // interval of amplitudes that puts every sample of the block inside it; take the smallest |amp|.
  const levels = [-Infinity, ...[...view.levels].sort((m, n) => m - n), Infinity];
  const samples = [];
  for (let i = 0; i <= SAMPLES; i++) {
    for (let j = 0; j <= SAMPLES; j++) {
      const [u, v] = map.toView(l + (r - l) * i / SAMPLES, t + (b - t) * j / SAMPLES);
      const [x, y] = viewToField(view, u, v);
      const p = (Math.cos(theta) * (x - cx) + Math.sin(theta) * (y - cy)) / sx;
      const q = (-Math.sin(theta) * (x - cx) + Math.cos(theta) * (y - cy)) / sy;
      samples.push([base.z(x, y), Math.exp(-0.5 * (p * p + q * q))]);
    }
  }
  let amp = null, range = null;
  for (let k = 0; k + 1 < levels.length; k++) {
    const lo = levels[k] + EPS + headroom, hi = levels[k + 1] - EPS;   // the pointer only lowers the field
    let min = -Infinity, max = Infinity;
    for (const [z, g] of samples) { min = Math.max(min, (lo - z) / g); max = Math.min(max, (hi - z) / g); }
    if (min > max) continue;
    const best = min > 0 ? min : max < 0 ? max : 0;
    if (sign && best * sign < 0) continue;   // a page may ask for a hill (1) or a hollow (-1) only
    if (amp === null || Math.abs(best) < Math.abs(amp)) { amp = best; range = [min, max]; }
  }
  return !amp ? null : { bump: [amp, cx, cy, sx, sy, theta], range };
}

// The smallest distance (CSS px) from any traced line to `box`, for the field with `bumps`.
export function clearance(json, viewName, stage, box, bumps) {
  const map = stageMap(stage, json.views[viewName]), field = makeField(json, { bumps });
  let min = Infinity;
  for (const level of json.views[viewName].levels) {
    for (const piece of traceLevel(json, viewName, level, field)) {
      for (const [u, v] of piece) {
        const [x, y] = map.toScreen(u, v);
        min = Math.min(min, Math.hypot(Math.max(box.l - x, 0, x - box.r), Math.max(box.t - y, 0, y - box.b)));
      }
    }
  }
  return min;
}

// Mount the opening's field into `el` (a [data-field] placeholder inside `.banner` or `.cover`).
// Returns { svg, bumps(), render, box(), ready }; `render` may be replaced (touch.js does).
// `ready` resolves once the draw-in and the settle are over and the pointer is attached.
export function mountOpening(el, json, viewName, opts = {}) {
  const stage = el.closest(".banner, .cover");
  const text = [...stage.querySelectorAll(".wrap > h1, .wrap > p")];
  const wide = matchMedia(WIDE);
  const mount = { svg: null, extra: [], margin: opts.margin ?? MARGIN, box: () => (wide.matches ? textBox(text) : null) };

  // a page may tune the bump's width in its markup: <div data-field="about" data-spread="1.1">
  // and its sign: data-sign="1" (a hill) or "-1" (a hollow); by default the smaller bump of either
  const tuned = { ...opts, headroom: opts.headroom ?? HEADROOM, spread: opts.spread ?? (Number(el.dataset.spread) || SPREAD),
    sign: opts.sign ?? (Number(el.dataset.sign) || 0) };
  const solve = () => {
    const box = mount.box(), sol = box && solveBump(json, viewName, el, box, tuned), bump = sol?.bump;
    mount.extra = bump ? [bump] : [];
    for (let i = 0; bump && i < TRIES && clearance(json, viewName, el, box, mount.bumps()) < CLEAR; i++) bump[0] *= GROW;
    if (bump && clearance(json, viewName, el, box, mount.bumps()) < CLEAR) console.warn("isej opening: a line runs near the title", viewName);
    mount.final = bump ? bump[0] : 0;
    mount.start = bump ? openAmplitude(bump[0], sol.range) : 0;
  };
  // OPEN times the final amplitude, held inside the gap so no line can reach the block on the way
  const openAmplitude = (a, [min, max]) => {
    const far = a > 0 ? max : min;
    if (!Number.isFinite(far)) return a * OPEN;
    if ((far - a) * Math.sign(a) <= 0) return a;   // GROW already used the whole gap
    return a + Math.sign(a) * Math.min(Math.abs(a) * (OPEN - 1), KEEP * Math.abs(far - a));
  };
  mount.bumps = () => [...json.field.bumps, ...mount.extra];
  mount.field = () => makeField(json, { bumps: mount.bumps() });
  const live = { ...json, views: { ...json.views, [viewName]: { ...json.views[viewName], step: json.views[viewName].step * COARSE } } };
  mount.render = (coarse = false) => {
    const trace = traceView(coarse ? live : json, viewName, { field: mount.field() });
    const tpl = document.createElement("template");
    tpl.innerHTML = renderSvg(trace, { ink: COLOURS.warmWhite, mask: false });
    mount.svg.replaceChildren(...tpl.content.firstElementChild.childNodes);
    mount.svg.classList.add("drawn");
  };

  solve();
  const still = reducedMotion();
  let settling = !still && mount.extra.length > 0;
  if (settling) mount.extra[0][0] = mount.start;
  // the draw-in plays on every load (not once per session); none under reduced motion
  mount.svg = mountBanner(el, json, viewName, { ink: COLOURS.warmWhite, mask: false, field: mount.field(), drawIn: !still });
  if (el.dataset.anchor in ANCHOR) {
    const x = { min: "xMin", mid: "xMid", max: "xMax" }[el.dataset.anchor];
    mount.svg.setAttribute("preserveAspectRatio", `${x}YMax slice`);
  }
  let timer = 0, last = [innerWidth, innerHeight];
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (last[0] === innerWidth && Math.abs(last[1] - innerHeight) < 2) return;
      last = [innerWidth, innerHeight];
      settling = false;   // a resize ends the settle at once, at the new final bump
      solve();
      mount.render();
    }, 180);
  });

  // ease the bump from its open amplitude to its final one, coarse frames, the last at full resolution
  const settle = () => new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (t) => {
      if (!settling || !mount.extra.length) return resolve();
      const k = Math.min(1, (t - t0) / SETTLE);
      mount.extra[0][0] = mount.start + (mount.final - mount.start) * easeInOut(k);
      mount.render(k < 1);
      if (k < 1) requestAnimationFrame(frame);
      else { settling = false; resolve(); }
    };
    requestAnimationFrame(frame);
  });
  const drawn = () => Promise.all(mount.svg.getAnimations({ subtree: true }).map((a) => a.finished)).catch(() => {});
  mount.ready = (async () => {
    await drawn();
    if (settling) await settle();
    mount.svg.classList.add("drawn");
    if (still) return;
    const touch = await import("/assets/field/touch.js");
    touch.attach(mount.svg, json, viewName, mount);
  })();
  return mount;
}
