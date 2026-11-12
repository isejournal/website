// Submit: the timetable on a time axis. On wide screens the timetable's own list items are placed
// along one real level set of the journal's field that runs the full content width. The five dated
// entries sit at arc-length positions proportional to their day from receipt (5, 14, 21, 42, 56);
// after a short break in the line the two open-ended entries follow at even spacing. Below 60rem,
// or without JavaScript, the list stays as it is in the markup.
import { loadField, makeField, traceLevel, viewToField, COLOURS } from "/assets/field/engine.js";

const WIDE = "(min-width: 60rem)";       // matches site.css's .cols breakpoint
// The window on the field: centre (field units), the field width the figure spans, rotation. Chosen
// so one level crosses the figure from edge to edge as a single, gently rising line.
const CENTRE = [2.150489149988903, -1.0737997859101975];
const SPAN = 2.6;                        // field units across the full content width
const THETA = 0.6;
const LEVEL = 0.15664878223325707;       // the axis: z at the centre of the line's band
const STEP = 0.0039;                     // level spacing of the neighbours (about 12 px at 1200 px)
const NEIGHBOURS = [-2, -1, 1];          // at most three, behind the axis
const DAYS = [5, 14, 21, 42, 56];        // the dated entries, days from receipt
const DATED = 0.62;                      // share of the line's length that day 56 falls at
const GAP = [0.645, 0.685];              // the break in the line (shares of its length)
const OPEN_STEP = 0.10;                  // even spacing of the two open-ended entries after day 56
const TICK = 8;                          // tick half-length, CSS px
const CLEAR = 18;                        // label distance from the outermost line, CSS px
const LABEL_MAX = 13 * 16;               // label width cap, CSS px

function makeView(w, h) {
  const scale = SPAN / w;
  return { kind: "banner", size: [w, h], window: [CENTRE[0], CENTRE[1], scale, THETA, 1], pad: 20, step: 4, min_len: 60 };
}

// The single piece of a level, ordered left to right.
function axisLine(json, view, field, level) {
  const pieces = traceLevel({ ...json, views: { t: view } }, "t", level, field);
  if (pieces.length === 0) return null;
  const line = pieces.reduce((a, b) => (b.length > a.length ? b : a));
  return line[0][0] <= line[line.length - 1][0] ? line : line.slice().reverse();
}

function cumulative(line) {
  const s = [0];
  for (let i = 1; i < line.length; i++) s.push(s[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return s;
}

// Point and unit tangent at arc length t.
function pointAt(line, s, t) {
  let i = 1;
  while (i < line.length - 1 && s[i] < t) i++;
  const a = line[i - 1], b = line[i], k = (t - s[i - 1]) / (s[i] - s[i - 1] || 1);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { u: a[0] + k * (b[0] - a[0]), v: a[1] + k * (b[1] - a[1]), tu: (b[0] - a[0]) / len, tv: (b[1] - a[1]) / len };
}

// The part of a polyline whose u lies outside [u0, u1]: the break, applied to every line alike.
function cutBetween(line, u0, u1) {
  const left = [], right = [];
  for (let i = 0; i < line.length; i++) {
    const [u, v] = line[i];
    if (u <= u0) left.push([u, v]);
    else if (u >= u1) right.push([u, v]);
    if (i > 0) {
      const [pu, pv] = line[i - 1];
      for (const edge of [u0, u1]) {
        if ((pu - edge) * (u - edge) < 0) {
          const k = (edge - pu) / (u - pu), q = [edge, pv + k * (v - pv)];
          if (edge === u0) left.push(q); else right.unshift(q);
        }
      }
    }
  }
  return [left, right].filter((p) => p.length > 1);
}

const d = (pts) => "M" + pts.map(([u, v]) => u.toFixed(1) + " " + v.toFixed(1)).join(" L");

// Topmost and bottommost line across [u0, u1].
function envelope(lines, u0, u1) {
  let top = Infinity, bottom = -Infinity;
  for (const line of lines) {
    for (const [u, v] of line) {
      if (u < u0 || u > u1) continue;
      top = Math.min(top, v); bottom = Math.max(bottom, v);
    }
  }
  return { top, bottom };
}

function layout(col, json, field, drawIn, paused) {
  const list = col.querySelector(".list");
  const items = [...list.children];
  const w = list.getBoundingClientRect().width;
  const hView = Math.round(w * 0.5);
  const view = makeView(w, hView);
  const axis = axisLine(json, view, field, LEVEL);
  if (!axis) throw new Error("submit timetable: the axis level left the view");
  const s = cumulative(axis), total = s[s.length - 1];
  const neighbours = NEIGHBOURS.map((n) => axisLine(json, view, field, LEVEL + n * STEP)).filter(Boolean);

  // Arc-length shares of every entry: dated by day, then the open-ended two at even spacing.
  const shares = DAYS.map((day) => DATED * day / DAYS[DAYS.length - 1]);
  for (let k = 1; shares.length < items.length; k++) shares.push(DATED + k * OPEN_STEP);
  const ticks = shares.map((share) => pointAt(axis, s, share * total));
  const gapU = GAP.map((share) => pointAt(axis, s, share * total).u);
  const lines = [axis, ...neighbours];

  // Labels: alternate above and below; each as wide as the room before the next label on its side
  // (or the figure's edge). --label-w, the narrowest, sizes the time labels so they all match.
  const widths = ticks.map((t, i) => Math.min(LABEL_MAX, (i + 2 < ticks.length ? ticks[i + 2].u : w) - t.u - 24));
  list.style.setProperty("--label-w", Math.min(...widths) + "px");
  items.forEach((li, i) => { li.style.width = widths[i] + "px"; });

  const centre = hView / 2;
  let above = 0, below = 0;
  const placed = items.map((li, i) => {
    const t = ticks[i], up = i % 2 === 0, h = li.getBoundingClientRect().height;
    const env = envelope(lines, t.u - 2, t.u + widths[i]);
    const off = up ? env.top - CLEAR - h - centre : env.bottom + CLEAR - centre;
    if (up) above = Math.max(above, -off); else below = Math.max(below, off + h);
    return { li, u: t.u, off, up };
  });
  const half = Math.ceil(Math.max(above, below)) + 4;
  const figH = 2 * half;
  const shift = centre - half;            // view v -> figure y
  list.style.height = figH + "px";
  for (const p of placed) {
    p.li.style.left = p.u + "px";
    p.li.style.top = (half + p.off) + "px";
    p.li.classList.toggle("up", p.up);
  }

  // The drawing: neighbours faint, the axis navy, ticks across the axis, week 8's in ochre.
  const paths = [];
  let n = 0;
  const path = (pts, attrs) => {
    const anim = drawIn ? ` pathLength="1" class="c" style="--i:${n++}"` : "";
    paths.push(`<path${anim} d="${d(pts)}" fill="none" stroke-width="1" ${attrs}/>`);
  };
  for (const line of neighbours) for (const piece of cutBetween(line, gapU[0], gapU[1])) path(piece, `stroke="${COLOURS.navy}" opacity="0.22"`);
  for (const piece of cutBetween(axis, gapU[0], gapU[1])) path(piece, `stroke="${COLOURS.navy}"`);
  ticks.forEach((t, i) => {
    const nu = -t.tv, nv = t.tu;
    const ochre = i === DAYS.length - 1, len = ochre ? TICK * 1.5 : TICK;
    path([[t.u - len * nu, t.v - len * nv], [t.u + len * nu, t.v + len * nv]], `stroke="${ochre ? COLOURS.ochre : COLOURS.navy}"`);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="isej-field${drawIn ? "" : " drawn"}${paused ? " paused" : ""} tt-axis"`
    + ` viewBox="0 ${shift.toFixed(1)} ${w.toFixed(1)} ${figH}" width="${w.toFixed(1)}" height="${figH}"`
    + ` aria-hidden="true" focusable="false">${paths.join("")}</svg>`;
  col.querySelector(".tt-axis")?.remove();
  list.insertAdjacentHTML("beforebegin", svg);
  col.querySelector(".tt-axis").style.top = list.offsetTop + "px";
}

function clear(col) {
  col.classList.remove("axis-on");
  col.querySelector(".tt-axis")?.remove();
  const list = col.querySelector(".list");
  list.style.removeProperty("height");
  list.style.removeProperty("--label-w");
  for (const li of list.children) { li.style.removeProperty("width"); li.style.removeProperty("left"); li.style.removeProperty("top"); li.classList.remove("up"); }
}

async function main() {
  const col = document.getElementById("timetable");
  if (!col) return;
  const json = await loadField();
  const field = makeField(json);
  const wide = matchMedia(WIDE);
  // Draw in once, when the figure first comes into view (held paused until then); later layouts
  // (resize, fonts) redraw without motion.
  let seen = !("IntersectionObserver" in window), drawn = false;
  const render = () => {
    if (!wide.matches) { clear(col); return; }
    col.classList.add("axis-on");
    layout(col, json, field, !drawn, !seen);
    if (seen) drawn = true;
  };
  if (!seen) {
    const io = new IntersectionObserver((e) => {
      if (!e[0].isIntersecting) return;
      io.disconnect();
      seen = true;
      col.querySelector(".tt-axis")?.classList.remove("paused");
      drawn = true;
    }, { threshold: 0.25 });
    io.observe(col);
  }
  let timer = 0;
  render();
  wide.addEventListener("change", render);
  window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
  if (document.fonts) document.fonts.ready.then(render);
}

main().catch((err) => console.warn("submit timetable:", err));
