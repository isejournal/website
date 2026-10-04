/**
 * ISEJ field engine: the identity's contour field, traced live in the browser.
 *
 * A literal port of the Python kit (~/isej_identity) so the browser draws the same lines as the
 * static SVGs. Every number comes from isej-field.json (written by src/web_engine.py); nothing here
 * re-derives a rule. The pipeline, step by step:
 *   sample  numpy.arange grid over the padded view, Window.to_field, Field.__call__ (field.py, contours.py)
 *   trace   skimage.measure.find_contours: marching squares + contour assembly, then np.interp to px
 *   clip    shapely LineString ∩ box(0, 0, w, h) as GEOS returns it, then the min_len filter
 *   format  "M x y L x y ..." with Python's .1f rounding (editorial.field_markup)
 * No dependencies; runs in browsers and in JavaScriptCore (tests/run.sh).
 */

const FIELD_URL = '/assets/field/isej-field.json';
export const COLOURS = { navy: '#1B2A4A', warmWhite: '#F6F2EA', ochre: '#B08D57' };
const DRAWN_KEY = 'isej-drawn';
const FIT = { banner: 'xMinYMax slice', hero: 'xMidYMax slice', atlas: 'xMidYMid meet' };

// ------------------------------------------------------------------------------ the field

const loads = new Map();

/** Fetch the field JSON once per URL; later calls share the promise (a failed load may be retried). */
export function loadField(url = FIELD_URL) {
  if (!loads.has(url)) {
    const p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`isej-field: ${url} answered ${r.status}`);
      return r.json();
    });
    p.catch(() => loads.delete(url));
    loads.set(url, p);
  }
  return loads.get(url);
}

/** { z(x, y), grad(x, y) -> [zx, zy] }; `override` may replace `bumps` ([amp, cx, cy, sx, sy, theta]
 *  each) and `tilt` ([tx, ty]), e.g. for sliders. */
export function makeField(json, override = {}) {
  const [tx, ty] = override.tilt ?? json.field.tilt;
  const bumps = (override.bumps ?? json.field.bumps).map(([amp, cx, cy, sx, sy, theta]) =>
    ({ amp, cx, cy, sx, sy, c: Math.cos(theta), s: Math.sin(theta) }));
  // field.py Field.__call__, operation for operation, so values agree with numpy to the last bit or so
  const z = (x, y) => {
    let out = tx * x + ty * y;
    for (const b of bumps) {
      const p = (b.c * (x - b.cx) + b.s * (y - b.cy)) / b.sx;
      const q = (-b.s * (x - b.cx) + b.c * (y - b.cy)) / b.sy;
      out = out + b.amp * Math.exp(-0.5 * (p * p + q * q));
    }
    return out;
  };
  const grad = (x, y) => {
    let gx = tx, gy = ty;
    for (const b of bumps) {
      const u = b.c * (x - b.cx) + b.s * (y - b.cy), v = -b.s * (x - b.cx) + b.c * (y - b.cy);
      const e = b.amp * Math.exp(-0.5 * ((u / b.sx) ** 2 + (v / b.sy) ** 2));
      const au = u / (b.sx * b.sx), av = v / (b.sy * b.sy);
      gx -= e * (au * b.c - av * b.s);
      gy -= e * (au * b.s + av * b.c);
    }
    return [gx, gy];
  };
  return { z, grad };
}

const fields = new WeakMap();
function defaultField(json) {
  if (!fields.has(json)) fields.set(json, makeField(json));
  return fields.get(json);
}

function viewOf(json, name) {
  const view = json.views[name];
  if (!view) throw new Error(`isej-field: no view "${name}"`);
  return view;
}

function frame(view) {
  const [w, h] = view.size, [cx, cy, scale, theta, stretch] = view.window;
  return { mx: (0 + w) / 2, my: (0 + h) / 2, cx, cy, scale, stretch, c: Math.cos(theta), s: Math.sin(theta) };
}

/** View px -> field coordinates (contours.Window.to_field with rect = (0, 0, w, h)). */
export function viewToField(view, u, v) {
  const f = frame(view);
  const du = (u - f.mx) * f.scale / f.stretch, dv = (v - f.my) * f.scale;
  return [f.cx + f.c * du - f.s * dv, f.cy + f.s * du + f.c * dv];
}

/** Field coordinates -> view px (the inverse of viewToField). */
export function fieldToView(view, x, y) {
  const f = frame(view), dx = x - f.cx, dy = y - f.cy;
  return [f.mx + (f.c * dx + f.s * dy) * f.stretch / f.scale, f.my + (-f.s * dx + f.c * dy) / f.scale];
}

// ------------------------------------------------------------------------------ sampling

// numpy.arange(start, stop, step) on floats: n = ceil((stop - start) / step); a[0] = start,
// a[1] = start + step, then a[i] = start + i * (a[1] - a[0]) (PyArray_ArangeObj, then DOUBLE_fill).
function arange(start, stop, step) {
  const n = Math.max(0, Math.ceil((stop - start) / step)), a = new Float64Array(n);
  if (n > 0) a[0] = start;
  if (n > 1) a[1] = start + step;
  const delta = a[1] - a[0];
  for (let i = 2; i < n; i++) a[i] = start + i * delta;
  return a;
}

// contours.sample_target over rect (0, 0, w, h) padded by `pad`: z[j * nu + i] at (us[i], vs[j]).
function sample(view, field) {
  const [w, h] = view.size, { pad, step } = view, f = frame(view);
  const us = arange(0 - pad, w + pad + step, step), vs = arange(0 - pad, h + pad + step, step);
  const nu = us.length, nv = vs.length, z = new Float64Array(nu * nv);
  for (let j = 0; j < nv; j++) {
    const dv = (vs[j] - f.my) * f.scale;
    for (let i = 0; i < nu; i++) {
      const du = (us[i] - f.mx) * f.scale / f.stretch;
      z[j * nu + i] = field.z(f.cx + f.c * du - f.s * dv, f.cy + f.s * du + f.c * dv);
    }
  }
  return { us, vs, z, nu, nv };
}

const grids = new WeakMap(); // field -> WeakMap(view -> grid)
function gridFor(view, field) {
  if (!grids.has(field)) grids.set(field, new WeakMap());
  const byView = grids.get(field);
  if (!byView.has(view)) byView.set(view, sample(view, field));
  return byView.get(view);
}

/** The sampled grid of a view: { us, vs, z (row-major, z[j * nu + i]), nu, nv }. */
export function sampleView(json, viewName, field = defaultField(json)) {
  return gridFor(viewOf(json, viewName), field);
}

// ------------------------------------------------------------------------------ marching squares

// skimage _find_contours_cy._get_contour_segments with fully_connected='low' (the default). Square
// corners ul, ur, ll, lr; crossing points T(op), B(ottom), L(eft), R(ight); each entry lists
// (from, to) pairs. Read off skimage 0.26 by probing all 16 cases (the .pyx is not shipped).
const CASES = ['', 'TL', 'RT', 'RL', 'LB', 'TB', 'RTLB', 'RB', 'BR', 'TLBR', 'BT', 'BL', 'LR', 'TR', 'LT', ''];

// Points are [row, col] (v index, u index) keyed by their exact values, as skimage keys tuples in dicts.
const pt = (r, c) => ({ r, c, k: r + ',' + c });

function segments(g, level) {
  const { z, nu, nv } = g, out = [];
  const frac = (from, to) => (to === from ? 0 : (level - from) / (to - from));
  for (let r0 = 0; r0 < nv - 1; r0++) {
    for (let c0 = 0; c0 < nu - 1; c0++) {
      const k = r0 * nu + c0, ul = z[k], ur = z[k + 1], ll = z[k + nu], lr = z[k + nu + 1];
      if (ul !== ul || ur !== ur || ll !== ll || lr !== lr) continue; // NaN squares are skipped
      const cs = CASES[(ul > level) + 2 * (ur > level) + 4 * (ll > level) + 8 * (lr > level)];
      if (!cs) continue;
      const at = { T: () => pt(r0, c0 + frac(ul, ur)), B: () => pt(r0 + 1, c0 + frac(ll, lr)),
        L: () => pt(r0 + frac(ul, ll), c0), R: () => pt(r0 + frac(ur, lr), c0 + 1) };
      for (let i = 0; i < cs.length; i += 2) out.push([at[cs[i]](), at[cs[i + 1]]()]);
    }
  }
  return out;
}

// collections.deque with the operations _assemble_contours uses; `front` is stored reversed.
class Deque {
  constructor(a, b) { this.front = []; this.back = [a, b]; }
  first() { return this.front.length ? this.front[this.front.length - 1] : this.back[0]; }
  last() { return this.back.length ? this.back[this.back.length - 1] : this.front[0]; }
  items() { return this.front.slice().reverse().concat(this.back); }
}

// skimage _find_contours._assemble_contours, branch for branch: segments are chained through dicts
// of open starts and ends; joins keep the older contour, so output order is creation order.
function assemble(segs) {
  let current = 0;
  const contours = new Map(), starts = new Map(), ends = new Map();
  for (const [from, to] of segs) {
    if (from.k === to.k) continue; // degenerate: one corner exactly at the level
    const t = starts.get(to.k), hd = ends.get(from.k);
    starts.delete(to.k);
    ends.delete(from.k);
    if (t && hd) {
      const [tail, tailNum] = t, [head, headNum] = hd;
      if (tail === head) {
        head.back.push(to); // closes a ring
      } else if (tailNum > headNum) { // tail is younger: append it to head
        for (const p of tail.items()) head.back.push(p);
        contours.delete(tailNum);
        starts.set(head.first().k, [head, headNum]);
        ends.set(head.last().k, [head, headNum]);
      } else { // head is younger: prepend it to tail
        const hs = head.items();
        for (let i = hs.length - 1; i >= 0; i--) tail.front.push(hs[i]);
        starts.delete(head.first().k);
        contours.delete(headNum);
        starts.set(tail.first().k, [tail, tailNum]);
        ends.set(tail.last().k, [tail, tailNum]);
      }
    } else if (!t && !hd) {
      const c = new Deque(from, to);
      contours.set(current, c);
      starts.set(from.k, [c, current]);
      ends.set(to.k, [c, current]);
      current += 1;
    } else if (!hd) { // an open contour starts at `to`: prepend
      t[0].front.push(from);
      starts.set(from.k, t);
    } else { // an open contour ends at `from`: append
      hd[0].back.push(to);
      ends.set(to.k, hd);
    }
  }
  return [...contours.keys()].sort((a, b) => a - b).map((n) => contours.get(n).items());
}

// np.interp(x, arange(n), grid): the grid value at integer x, else slope * (x - j) + grid[j].
function interp(x, grid) {
  const n = grid.length;
  if (x <= 0) return grid[0];
  if (x >= n - 1) return grid[n - 1];
  const j = Math.floor(x);
  return j === x ? grid[j] : (grid[j + 1] - grid[j]) * (x - j) + grid[j];
}

// ------------------------------------------------------------------------------ clipping

// Points where segment a-b properly crosses the box boundary, in order along the segment.
function crossings(a, b, w, h) {
  const out = [];
  for (const X of [0, w]) {
    if (a[0] !== X && b[0] !== X && (a[0] < X) !== (b[0] < X)) {
      const t = (X - a[0]) / (b[0] - a[0]), y = a[1] + t * (b[1] - a[1]);
      if (y >= 0 && y <= h) out.push([t, X, y]);
    }
  }
  for (const Y of [0, h]) {
    if (a[1] !== Y && b[1] !== Y && (a[1] < Y) !== (b[1] < Y)) {
      const t = (Y - a[1]) / (b[1] - a[1]), x = a[0] + t * (b[0] - a[0]);
      if (x >= 0 && x <= w) out.push([t, x, Y]);
    }
  }
  out.sort((p, q) => p[0] - q[0]);
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0]).map((p) => [p[1], p[2]]);
}

// shapely LineString(line).intersection(box(0, 0, w, h)) as GEOS (OverlayNG) builds it: repeated
// points dropped, the line noded where it meets the boundary, the edges between nodes kept when they
// lie inside, returned in line order and never merged. A closed ring whose start vertex is inside
// therefore comes back split at that vertex (the start and end of a line are always nodes).
function clip(line, w, h) {
  const pts = line.filter((p, i) => i === 0 || p[0] !== line[i - 1][0] || p[1] !== line[i - 1][1]);
  if (pts.length < 2) return [];
  const inside = (p) => p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h;
  const onBoundary = (p) => inside(p) && (p[0] === 0 || p[0] === w || p[1] === 0 || p[1] === h);
  const edges = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    for (const x of crossings(pts[i - 1], pts[i], w, h)) {
      cur.push(x);
      edges.push(cur);
      cur = [x];
    }
    cur.push(pts[i]);
    if (i < pts.length - 1 && onBoundary(pts[i])) {
      edges.push(cur);
      cur = [pts[i]];
    }
  }
  edges.push(cur);
  // an edge lies wholly inside or outside; its first segment's midpoint tells which
  return edges.filter((e) => inside([(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2]));
}

// GEOS Length::ofLine (shapely .length)
function length(piece) {
  let len = 0;
  for (let i = 1; i < piece.length; i++) {
    const dx = piece[i][0] - piece[i - 1][0], dy = piece[i][1] - piece[i - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

function piecesAt(g, view, level) {
  const [w, h] = view.size, out = [];
  for (const c of assemble(segments(g, level))) {
    const line = c.map((p) => [interp(p.c, g.us), interp(p.r, g.vs)]);
    for (const piece of clip(line, w, h)) if (length(piece) >= view.min_len) out.push(piece);
  }
  return out;
}

// ------------------------------------------------------------------------------ path data and SVG

// Python's format(x, '.1f'). toFixed rounds the exact ties (x.25) up where Python rounds half to
// even, and prints -0 as "0.0" where Python keeps the sign.
function f1(x) {
  if (Object.is(x, -0)) return '-0.0';
  if (Math.abs(x) % 1 === 0.25) return (x < 0 ? '-' : '') + Math.trunc(Math.abs(x)) + '.2';
  return x.toFixed(1);
}
// Python's format(x, 'g') for the moderate numbers used here (6 significant digits, no trailing zeros).
const g6 = (x) => String(Number(x.toPrecision(6)));

const pathData = (pieces) => pieces.map((pc) => 'M' + pc.map(([x, y]) => f1(x) + ' ' + f1(y)).join(' L')).join(' ');

/** Polylines [[u, v], ...] of one level in view px (full precision), clipped and min_len-filtered. */
export function traceLevel(json, viewName, level, field = defaultField(json)) {
  const view = viewOf(json, viewName);
  return piecesAt(gridFor(view, field), view, level);
}

/** Every level of a view as SVG path data, as the kit draws it. Levels with no lines are left out
 *  (index keeps the level's position). opts.field: a makeField result; opts.levels: other levels. */
export function traceView(json, viewName, opts = {}) {
  const view = viewOf(json, viewName), g = gridFor(view, opts.field ?? defaultField(json));
  const paths = [];
  (opts.levels ?? view.levels).forEach((level, index) => {
    const d = pathData(piecesAt(g, view, level));
    if (d) paths.push({ level, index, d, ochre: index === view.ochre });
  });
  return { view: viewName, kind: view.kind, size: [...view.size], stroke: view.stroke,
    opacity: view.opacity ?? null, mask: view.mask ?? null, paths };
}

/** An <svg> string for a trace (viewBox = size, no background). drawIn adds pathLength="1",
 *  class="c" and --i, rising levels first and the ochre level last, for render.css; mask adds the
 *  kit's radial fade behind a top-left headline; id prefixes the mask ids. */
export function renderSvg(trace, { ink = COLOURS.navy, accent = COLOURS.ochre, drawIn = false,
  pathLength = drawIn, mask = false, id = `isej-${trace.view}` } = {}) {
  const [w, h] = trace.size;
  let paths = trace.paths;
  if (drawIn) {
    paths = [...paths.filter((p) => !p.ochre).sort((a, b) => a.level - b.level), ...paths.filter((p) => p.ochre)];
  }
  const opacity = trace.opacity == null ? '' : ` opacity="${g6(trace.opacity)}"`;
  let body = paths.map((p, i) => `<path${pathLength ? ' pathLength="1"' : ''}${drawIn ? ` class="c" style="--i:${i}"` : ''}`
    + ` d="${p.d}" fill="none" stroke="${p.ochre ? accent : ink}" stroke-width="${g6(trace.stroke)}"`
    + ` stroke-linecap="butt"${opacity}/>`).join('');
  if (mask && trace.mask) {
    const [cx, cy, r, from] = trace.mask;
    body = `<defs><radialGradient id="${id}-fg" gradientUnits="userSpaceOnUse" cx="${g6(cx * w)}" cy="${g6(cy * h)}"`
      + ` r="${g6(r * w)}"><stop offset="${from}" stop-color="#000"/><stop offset="1" stop-color="#fff"/>`
      + `</radialGradient><mask id="${id}-fm"><rect width="${g6(w)}" height="${g6(h)}" fill="url(#${id}-fg)"/>`
      + `</mask></defs><g mask="url(#${id}-fm)">${body}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="isej-field" viewBox="0 0 ${g6(w)} ${g6(h)}"`
    + ` preserveAspectRatio="${FIT[trace.kind] ?? FIT.banner}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// ------------------------------------------------------------------------------ landform probe

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** What the field does at (x, y). A saddle, min or max when a critical point lies within
 *  json.probe.radius (the Newton step |H⁻¹∇z|; Hessian by central differences of the gradient),
 *  else a slope facing downhill (north is up the page). nearest: the closest page marker. */
export function landform(json, x, y, field = defaultField(json)) {
  const { radius, h } = json.probe;
  const [gx, gy] = field.grad(x, y);
  const [xa, ya] = field.grad(x + h, y), [xb, yb] = field.grad(x - h, y);
  const [xc, yc] = field.grad(x, y + h), [xd, yd] = field.grad(x, y - h);
  const hxx = (xa - xb) / (2 * h), hyy = (yc - yd) / (2 * h), hxy = (ya - yb + xc - xd) / (4 * h);
  const det = hxx * hyy - hxy * hxy;
  const newton = Math.hypot(hyy * gx - hxy * gy, hxx * gy - hxy * gx) / Math.abs(det);
  const out = { kind: 'slope', z: field.z(x, y), grad: [gx, gy] };
  if (newton <= radius) out.kind = det < 0 ? 'saddle' : hxx > 0 ? 'min' : 'max';
  else out.facing = COMPASS[Math.round(Math.atan2(-gx, gy) / (Math.PI / 4)) & 7];
  let best = null;
  for (const p of json.pages) {
    const distance = Math.hypot(x - p.field_xy[0], y - p.field_xy[1]);
    if (!best || distance < best.distance) best = { slug: p.slug, label: p.label, distance };
  }
  out.nearest = best;
  return out;
}

// ------------------------------------------------------------------------------ mounting

let mounts = 0;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
function drawnThisSession() {
  try {
    return globalThis.sessionStorage?.getItem(DRAWN_KEY) != null;
  } catch { // storage blocked (privacy settings): treat as a first visit; the draw-in plays again
    return false;
  }
}
function rememberDrawn() {
  try {
    globalThis.sessionStorage?.setItem(DRAWN_KEY, '1');
  } catch { /* storage blocked: nothing to remember, the page itself is unaffected */ }
}

/** Draw a view into `el`: fill a placeholder (<div data-field="about">) or replace a static fallback
 *  <svg>/<img>, keeping its id and classes. The draw-in plays once per session (sessionStorage
 *  "isej-drawn") and never under prefers-reduced-motion; opts.drawIn forces it on or off.
 *  opts: ink, accent, mask (default on for banners), field, levels, id. Returns the new <svg>. */
export function mountBanner(el, json, viewName, opts = {}) {
  const trace = traceView(json, viewName, opts);
  const animate = opts.drawIn ?? (!reducedMotion() && !drawnThisSession());
  const tpl = el.ownerDocument.createElement('template');
  tpl.innerHTML = renderSvg(trace, { ink: opts.ink, accent: opts.accent, drawIn: animate,
    mask: opts.mask ?? trace.kind === 'banner', id: opts.id ?? `isej-${viewName}-${++mounts}` });
  const svg = tpl.content.firstElementChild;
  if (!animate) svg.classList.add('drawn');
  if (el.localName === 'svg' || el.localName === 'img') {
    if (el.id) svg.id = el.id;
    svg.classList.add(...el.classList);
    el.replaceWith(svg);
  } else {
    el.replaceChildren(svg);
  }
  if (animate) rememberDrawn();
  return svg;
}

/** The home hero (2400 x 1200, warm white on the navy cover by default, no fade mask). */
export function mountHero(el, json, opts = {}) {
  return mountBanner(el, json, 'hero', { ink: COLOURS.warmWhite, mask: false, ...opts });
}
