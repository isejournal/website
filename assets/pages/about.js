// About: the eight review steps set along one contour of the journal's field.
// On wide screens the route is one level set, traced with the field engine in a view of its own,
// drawn in ochre with four neighbouring levels in faint navy; each <li> of the steps list is placed
// at an even interval of arc length along it, alternately above and below the line.
// Below 60rem, or without JavaScript, the list is left exactly as it is in the markup.
import { loadField, traceLevel } from '/assets/field/engine.js';

// A view of the field that one level crosses from the left edge to the right edge, winding
// gently past the saddle. Found by a seeded search over windows and levels (one piece spanning
// the width, never running backwards, two or three turns, about a third of the height).
const ROUTE_VIEW = {
  kind: 'banner',
  size: [2400, 940],
  window: [-0.6447733131445821, -0.4935518146928175, 0.001964185845090163, 0.05362382277549425, 1.0],
  pad: 20,
  step: 4.8,
  min_len: 60,
};
const ROUTE_LEVEL = -0.15641025641025652;
const NEIGHBOUR_OFFSETS = [-0.05, -0.025, 0.025, 0.05];
const WIDE = '(min-width: 60rem)';
const SVG_NS = 'http://www.w3.org/2000/svg';

const MAX_LABEL_REM = 14;
const SIDE_GAP_REM = 1.5;    // between two labels on the same side of the line
const LINE_GAP_REM = 1.1;    // between a label and the line
const MARKER_REM = 0.875;    // marker radius

/** The route and its neighbours as polylines in view px, the route oriented left to right. */
function traceRoute(json) {
  const withView = { ...json, views: { ...json.views, route: ROUTE_VIEW } };
  const pieces = traceLevel(withView, 'route', ROUTE_LEVEL);
  const longest = pieces.reduce((a, b) => (b.length > a.length ? b : a));
  const route = longest[0][0] <= longest[longest.length - 1][0] ? longest : [...longest].reverse();
  const minLen = ROUTE_VIEW.size[0] / 3;   // whole neighbouring lines only, no stray fragments
  const neighbours = NEIGHBOUR_OFFSETS.flatMap((d) => traceLevel(withView, 'route', ROUTE_LEVEL + d))
    .filter((pc) => arcLengths(pc).at(-1) >= minLen);
  return { route, neighbours };
}

const pathData = (pts) => 'M' + pts.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join(' L');

function _svgPath(d, attrs) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
  return p;
}

/** The figure's <svg>: faint navy neighbours behind, the ochre route on top. */
function buildSvg({ route, neighbours }) {
  const [w, h] = ROUTE_VIEW.size;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'isej-field route-field');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const common = { fill: 'none', 'vector-effect': 'non-scaling-stroke', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  for (const pc of neighbours) {
    svg.append(_svgPath(pathData(pc), { ...common, stroke: '#1B2A4A', 'stroke-width': '1', 'stroke-opacity': '0.2' }));
  }
  svg.append(_svgPath(pathData(route), { ...common, stroke: '#B08D57', 'stroke-width': '1.25', pathLength: '1', 'data-route': '' }));
  return svg;
}

/** Cumulative arc length of a polyline. */
function arcLengths(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return s;
}

/** The point at arc length t along a polyline. */
function pointAt(pts, cum, t) {
  let i = 1;
  while (i < pts.length - 1 && cum[i] < t) i++;
  const f = (t - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [pts[i - 1][0] + f * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + f * (pts[i][1] - pts[i - 1][1])];
}

/** Highest and lowest point of the line over a horizontal span (px). */
function lineExtent(pts, x0, x1) {
  let top = Infinity, bottom = -Infinity;
  for (const [x, y] of pts) if (x >= x0 && x <= x1) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
  return { top, bottom };
}

/** Horizontal placement of each label: its left edge at its marker where there is room. Labels on
 *  one side of the line are pushed right to keep SIDE_GAP apart, then pulled back left from the
 *  right edge; only if a side still does not fit are its labels narrowed. */
function placeColumns(markers, width, rem) {
  const maxW = MAX_LABEL_REM * rem, gap = SIDE_GAP_REM * rem, inset = MARKER_REM * rem;
  const cols = markers.map(([x]) => ({ x0: x - inset, w: maxW }));
  for (const side of [0, 1]) {
    const idx = cols.map((_, i) => i).filter((i) => i % 2 === side);
    const room = (width - gap * (idx.length - 1)) / idx.length;
    for (const i of idx) cols[i].w = Math.min(maxW, Math.max(room, 0));
    let edge = 0;
    for (const i of idx) { cols[i].x0 = Math.max(cols[i].x0, edge); edge = cols[i].x0 + cols[i].w + gap; }
    edge = width;
    for (const i of [...idx].reverse()) { cols[i].x0 = Math.min(cols[i].x0, edge - cols[i].w); edge = cols[i].x0 - gap; }
  }
  return cols.map(({ x0, w }) => ({ x0, x1: x0 + w }));
}

/** How far each label sits from its own marker (px, summed): vertically, beyond the marker,
 *  and sideways, where a label had to move off its marker to make room. */
function labelDistance(pts, markers, cols, firstAbove, inset) {
  let sum = 0;
  markers.forEach(([mx, my], i) => {
    const ext = lineExtent(pts, cols[i].x0, cols[i].x1);
    sum += (i % 2 === 0) === firstAbove ? my - ext.top : ext.bottom - my;
    sum += Math.abs(cols[i].x0 - (mx - inset));
  });
  return sum;
}

/** The eight stations: even intervals of arc length over a stretch [a, b] of the route, and the
 *  side the first label takes, chosen so that labels sit as close to their markers as the line
 *  allows (a label above a trough or below a crest would float away from its step). */
function chooseStations(pts, cum, n, width, rem) {
  const total = cum[cum.length - 1];
  let best = null;
  for (let a = 0; a <= 0.12 + 1e-9; a += 0.01) {
    for (let b = 0.88; b <= 1 + 1e-9; b += 0.01) {
      const markers = Array.from({ length: n }, (_, i) => pointAt(pts, cum, (a + ((i + 0.5) / n) * (b - a)) * total));
      const cols = placeColumns(markers, width, rem);
      for (const firstAbove of [true, false]) {
        const cost = labelDistance(pts, markers, cols, firstAbove, MARKER_REM * rem);
        if (!best || cost < best.cost) best = { cost, markers, cols, firstAbove };
      }
    }
  }
  return best;
}

function layout(fig, svg, geo) {
  const list = fig.querySelector('ol');
  const items = [...list.children];
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const width = fig.clientWidth, scale = width / ROUTE_VIEW.size[0], height = ROUTE_VIEW.size[1] * scale;
  const pts = geo.route.map(([u, v]) => [u * scale, v * scale]);
  const cum = arcLengths(pts);
  const { markers, cols, firstAbove } = chooseStations(pts, cum, items.length, width, rem);
  const lineGap = LINE_GAP_REM * rem, marker = MARKER_REM * rem;

  const boxes = items.map((li, i) => {
    const { x0, x1 } = cols[i];
    li.style.left = `${x0}px`;
    li.style.width = `${x1 - x0}px`;
    const h = li.offsetHeight;
    const ext = lineExtent(pts, x0, x1), [mx, my] = markers[i];
    const above = (i % 2 === 0) === firstAbove;
    const top = above ? Math.min(ext.top, my - marker) - lineGap - h : Math.max(ext.bottom, my + marker) + lineGap;
    return { li, top, h, mx, my, x0 };
  });

  const minTop = Math.min(0, ...boxes.map((b) => b.top));
  const maxBottom = Math.max(height, ...boxes.map((b) => b.top + b.h));
  const shift = -minTop;
  fig.style.height = `${maxBottom + shift}px`;
  svg.style.top = `${shift}px`;
  for (const b of boxes) {
    b.li.style.top = `${b.top + shift}px`;
    const span = b.li.firstElementChild;
    span.style.left = `${b.mx - b.x0}px`;
    span.style.top = `${b.my + shift - (b.top + shift)}px`;
  }
}

function clearLayout(fig) {
  fig.classList.remove('on');
  fig.style.height = '';
  for (const el of fig.querySelectorAll('li, li > span')) { el.style.left = el.style.top = el.style.width = ''; }
}

/** Draw the route in once, left to right, the first time the figure is in view. */
function drawInOnce(fig, svg) {
  const path = svg.querySelector('[data-route]');
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    path.classList.add('c');
    path.addEventListener('animationend', () => svg.classList.add('drawn'), { once: true });
  }, { threshold: 0.35 });
  io.observe(fig);
}

async function mountRoute(fig) {
  const json = await loadField();
  await document.fonts.ready;
  const geo = traceRoute(json);
  const svg = buildSvg(geo);
  const wide = matchMedia(WIDE);
  let drawn = false;
  const apply = () => {
    if (!wide.matches) { svg.remove(); clearLayout(fig); return; }
    if (!svg.isConnected) fig.prepend(svg);
    fig.classList.add('on');
    layout(fig, svg, geo);
    if (!drawn) { drawn = true; drawInOnce(fig, svg); }
  };
  apply();
  wide.addEventListener('change', apply);
  let lastWidth = fig.clientWidth;
  new ResizeObserver(() => {
    if (!wide.matches || fig.clientWidth === lastWidth) return;   // only a change of width re-lays the labels
    lastWidth = fig.clientWidth;
    layout(fig, svg, geo);
  }).observe(fig);
}

const fig = document.querySelector('[data-route]');
if (fig) {
  mountRoute(fig).catch((err) => {
    console.warn('about route:', err);   // the plain list stays in place
    clearLayout(fig);
  });
}
