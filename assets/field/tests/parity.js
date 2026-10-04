// Parity test for engine.js against the Python kit, run under JavaScriptCore by run.sh:
//   jsc -m parity.js -- <assets/field dir>      (fixtures/ is filled by run.sh from the kit)
// Per view (9 banners, hero, atlas): equal subpath count per level, symmetric Hausdorff distance
// between the JS path data and the kit's (target <= 0.051 px), z at 20 random view points vs
// numpy (target <= 1e-12), plus the exact sampling grid and Math.cos/sin vs numpy as diagnostics.
import { makeField, sampleView, traceLevel, traceView, viewToField } from '../engine.js';

const FIELD_DIR = globalThis.arguments?.[0] ?? '..';
const HAUSDORFF_MAX = 0.051;
const Z_MAX = 1e-12;
const now = () => (typeof preciseTime === 'function' ? preciseTime() * 1000 : performance.now());

const json = JSON.parse(readFile(`${FIELD_DIR}/isej-field.json`));
const probes = JSON.parse(readFile(`${FIELD_DIR}/tests/fixtures/engine_probes.json`));
const field = makeField(json);

// <path> elements of a kit SVG: d and whether the stroke is ochre
function kitPaths(svg) {
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)].map(([, a]) => ({
    d: /\bd="([^"]*)"/.exec(a)[1], ochre: /\bstroke="([^"]+)"/.exec(a)[1] === '#B08D57' }));
}
const parseD = (d) => d.split('M').filter((s) => s.trim()).map((s) => s.split(' L').map((p) => p.trim().split(' ').map(Number)));

// ------------------------------------------------------------------ Hausdorff between polyline sets

const CELL = 16;
function segIndex(lines) {
  const cells = new Map(), segs = [];
  for (const ln of lines) {
    for (let i = 1; i < ln.length; i++) {
      const a = ln[i - 1], b = ln[i], s = segs.push([a, b]) - 1;
      for (let cx = Math.floor(Math.min(a[0], b[0]) / CELL); cx <= Math.floor(Math.max(a[0], b[0]) / CELL); cx++) {
        for (let cy = Math.floor(Math.min(a[1], b[1]) / CELL); cy <= Math.floor(Math.max(a[1], b[1]) / CELL); cy++) {
          const k = cx + ',' + cy;
          if (!cells.has(k)) cells.set(k, []);
          cells.get(k).push(s);
        }
      }
    }
    if (ln.length === 1) segs.push([ln[0], ln[0]]);
  }
  return { cells, segs };
}
function segDist(p, [a, b]) {
  const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vy);
}
function nearest(p, idx) {
  let best = Infinity;
  const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
  for (let i = cx - 1; i <= cx + 1; i++) {
    for (let j = cy - 1; j <= cy + 1; j++) for (const s of idx.cells.get(i + ',' + j) ?? []) best = Math.min(best, segDist(p, idx.segs[s]));
  }
  if (best < CELL) return best; // anything nearer than one cell lies in the 3 x 3 block
  for (const s of idx.segs) best = Math.min(best, segDist(p, s));
  return best;
}
// directed distance from A to B, A sampled at its vertices and at quarter points of every segment
function directed(A, idxB) {
  let worst = 0;
  for (const ln of A) {
    for (let i = 0; i < ln.length; i++) {
      worst = Math.max(worst, nearest(ln[i], idxB));
      if (i === 0) continue;
      for (const t of [0.25, 0.5, 0.75]) {
        const a = ln[i - 1], b = ln[i];
        worst = Math.max(worst, nearest([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], idxB));
      }
    }
  }
  return worst;
}
const hausdorff = (A, B) => (A.length || B.length ? Math.max(directed(A, segIndex(B)), directed(B, segIndex(A))) : 0);

// ------------------------------------------------------------------ per view

const VIEWS = ['home', 'about', 'submit', 'referees', 'advisors', 'people', 'join', 'partners', 'contact', 'hero', 'atlas'];
const rows = [];
let failures = 0;
for (const name of VIEWS) {
  const view = json.views[name];
  const t0 = now();
  const trace = traceView(json, name);
  const ms = now() - t0;
  const py = kitPaths(readFile(`${FIELD_DIR}/tests/fixtures/${name}.svg`)).filter((p) => p.d);
  const js = trace.paths;
  const row = { name, levels: `${js.length}/${py.length}`, spPy: 0, spJs: 0, countsOk: js.length === py.length,
    identical: 0, haus: 0, raw: 0, zErr: 0, xyErr: 0, gridOk: true, gridZ: 0, ms };
  for (let i = 0; i < Math.min(js.length, py.length); i++) {
    const a = parseD(js[i].d), b = parseD(py[i].d);
    row.spJs += a.length;
    row.spPy += b.length;
    if (a.length !== b.length || js[i].ochre !== py[i].ochre) row.countsOk = false;
    if (js[i].d === py[i].d) row.identical += 1;
    row.haus = Math.max(row.haus, hausdorff(a, b));
    row.raw = Math.max(row.raw, hausdorff(traceLevel(json, name, js[i].level), b));
  }
  const pr = probes.views[name];
  for (const [u, v, x, y, z] of pr.points) {
    const [jx, jy] = viewToField(view, u, v);
    row.xyErr = Math.max(row.xyErr, Math.abs(jx - x), Math.abs(jy - y));
    row.zErr = Math.max(row.zErr, Math.abs(field.z(x, y) - z), Math.abs(field.z(jx, jy) - z));
  }
  const g = sampleView(json, name);
  const pick = (a) => [a[0], a[1], a[2], a[a.length - 1]];
  row.gridOk = g.nu === pr.grid.nu && g.nv === pr.grid.nv
    && pick(g.us).every((v, i) => v === pr.grid.us[i]) && pick(g.vs).every((v, i) => v === pr.grid.vs[i]);
  for (const [i, j, z] of pr.grid.nodes) row.gridZ = Math.max(row.gridZ, Math.abs(g.z[j * g.nu + i] - z));
  const ok = row.countsOk && row.haus <= HAUSDORFF_MAX && row.zErr <= Z_MAX && row.gridOk;
  if (!ok) failures += 1;
  row.ok = ok;
  rows.push(row);
}

const pad = (s, n) => String(s).padEnd(n);
const e = (x) => (x === 0 ? '0' : x.toExponential(1));
print(pad('view', 9) + pad('paths js/py', 12) + pad('subpaths js/py', 15) + pad('per-level', 10) + pad('d identical', 12)
  + pad('Hausdorff px', 13) + pad('raw->py px', 11) + pad('z err', 9) + pad('xy err', 9) + pad('grid', 6) + pad('grid z', 8) + 'trace ms');
for (const r of rows) {
  print(pad(r.name, 9) + pad(r.levels, 12) + pad(`${r.spJs}/${r.spPy}`, 15) + pad(r.countsOk ? 'equal' : 'DIFFER', 10)
    + pad(`${r.identical}/${r.levels.split('/')[1]}`, 12) + pad(r.haus.toFixed(4), 13) + pad(r.raw.toFixed(4), 11)
    + pad(e(r.zErr), 9) + pad(e(r.xyErr), 9) + pad(r.gridOk ? 'exact' : 'DIFF', 6) + pad(e(r.gridZ), 8) + r.ms.toFixed(0)
    + (r.ok ? '' : '   FAIL'));
}
// render.css hard-codes the draw-in timing; it must stay the kit's (json.views.hero.draw)
const css = readFile(`${FIELD_DIR}/render.css`);
const [dur, stagger, ease] = json.views.hero.draw;
const easeCss = `cubic-bezier(${ease.map((v) => String(v).replace(/^0\./, '.')).join(', ')})`;
const cssOk = css.includes(`isej-field-draw ${dur}s ${easeCss} both`) && css.includes(`var(--i, 0) * ${stagger}s`);
if (!cssOk) failures += 1;
print(`render.css timing vs json.views.hero.draw (${dur}s, ${stagger}s, ${easeCss}): ${cssOk ? 'agree' : 'DIFFER'}`);
let ulps = 0;
for (const [t, c, s] of probes.trig) ulps += (Math.cos(t) !== c) + (Math.sin(t) !== s);
print(`Math.cos/sin vs numpy at ${probes.trig.length} angles: ${ulps} differ`);
print(failures ? `FAIL: ${failures} check(s) outside the targets` : `PASS: all ${rows.length} views within Hausdorff <= ${HAUSDORFF_MAX} px, z <= ${Z_MAX}`);
if (failures) throw new Error(`${failures} check(s) failed`);
