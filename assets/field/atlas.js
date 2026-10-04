/* ISEJ map page (map.html): trace the atlas into its contour group, then run the probe.
   Load on map.html only, before </body>:  <script type="module" src="/assets/field/atlas.js"></script>

   1. Contours. map.html ships <g class="contours" data-field="atlas"></g> inside svg#atlas; the 24
      levels are traced from isej-field.json by engine.js in a module Worker (this same file, see the
      bottom), or on the main thread if a Worker cannot start. A group that already holds paths is
      left as it is.
   2. Probe. Pointer move (mouse, pen), a tap or click on open ground, or keyboard focus on a marker
      places it. The panel (.atlas .probe, markup in map-fragment.html) reads x and y (2 dp), z (3 dp)
      and the ground from landform(): saddle, basin, summit or "slope facing ...", with the nearest
      page that exists (landform's own nearest also counts places with no page yet, such as news).
      ONE ochre contour runs through z; while it shows, the atlas's own ochre level turns warm white
      (atlas.css), so the graphic keeps one ochre line. Values are exact and the line is replaced,
      not animated; it fades in once over 150 ms (atlas.css). Rendering is synchronous: pointermove
      already arrives at most once per frame.
   3. URL. The place is kept as ?x=&y= (history.replaceState after 250 ms of stillness) and read on
      load, so a shared link re-opens the same probe. */
import { COLOURS, fieldToView, landform, loadField, renderSvg, traceLevel, traceView, viewToField } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SNAP = 1000; // the probe sits on a 0.001 grid in field units, so ?x=&y= restores it exactly
const URL_DELAY = 250; // ms of stillness before the place is written to the URL
const DOT_PX = 4; // radius of the probe ring in CSS px, whatever the map's size
const KIND = { saddle: 'Saddle', min: 'Basin', max: 'Summit' };

/** The atlas contour paths as SVG markup: 24 levels, warm white, ochre on the middle level. */
export function atlasMarkup(json) {
  const svg = renderSvg(traceView(json, 'atlas'), { ink: COLOURS.warmWhite, accent: COLOURS.ochre });
  return svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
}

/** "−1.25" with a true minus sign, never "−0.00". */
export function formatNumber(value, digits) {
  const s = Math.abs(value).toFixed(digits);
  return (value < 0 && /[1-9]/.test(s) ? '\u2212' : '') + s;
}

/** Saddle, Basin, Summit, or "Slope facing north-east". */
export function describeGround(form) {
  return form.kind === 'slope' ? `Slope facing ${form.facing}` : KIND[form.kind] ?? form.kind;
}

/** ?x=&y= inside the field's domain, or null. */
export function placeFromQuery(search, [x0, x1, y0, y1]) {
  const q = new URLSearchParams(search);
  const num = (v) => (v == null || v.trim() === '' ? NaN : Number(v)); // empty is missing, not 0
  const x = num(q.get('x')), y = num(q.get('y'));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [x, y] : null;
}

const pathData = (lines) => lines.map((pts) => 'M' + pts.map(([u, v]) => `${u.toFixed(1)} ${v.toFixed(1)}`).join(' L')).join(' ');

function traceInWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(import.meta.url, { type: 'module' });
    worker.onmessage = ({ data }) => { worker.terminate(); data.markup ? resolve(data.markup) : reject(new Error(data.error)); };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(e.message || 'atlas worker failed to start')); };
    worker.postMessage('trace');
  });
}

async function drawContours(group) {
  let markup;
  try {
    markup = await traceInWorker();
  } catch (err) {
    console.warn('isej atlas: tracing on the main thread instead of a Worker:', err);
    markup = atlasMarkup(await loadField());
  }
  const tpl = document.createElement('template');
  tpl.innerHTML = `<svg xmlns="${SVG_NS}">${markup}</svg>`;
  group.replaceChildren(...tpl.content.firstElementChild.childNodes);
}

function probeLayer(svg) { // above the contours, below the markers
  const layer = document.createElementNS(SVG_NS, 'g'), line = document.createElementNS(SVG_NS, 'path');
  const dot = document.createElementNS(SVG_NS, 'circle');
  layer.setAttribute('class', 'probe-layer');
  layer.setAttribute('aria-hidden', 'true');
  line.setAttribute('class', 'probe-line');
  dot.setAttribute('class', 'probe-dot');
  layer.append(line, dot);
  const contours = svg.querySelector('g.contours');
  if (contours) contours.after(layer);
  else svg.prepend(layer);
  return { line, dot };
}

function keepInUrl(x, y) {
  const url = new URL(location.href);
  url.searchParams.set('x', x.toFixed(3));
  url.searchParams.set('y', y.toFixed(3));
  history.replaceState(history.state, '', url);
}

/** Wire the probe to svg#atlas and its panel; returns place(x, y) for tests. */
/** The nearest page that has a URL (json.pages also lists places without a page yet, e.g. news). */
export function nearestPage(pages, x, y) {
  let best = null, bestDistance = Infinity;
  for (const p of pages) {
    const distance = Math.hypot(x - p.field_xy[0], y - p.field_xy[1]);
    if (p.href && distance < bestDistance) [best, bestDistance] = [p, distance];
  }
  return best;
}

export function mountProbe(svg, panel, json) {
  const view = json.views.atlas, pages = new Map(json.pages.map((p) => [p.slug, p]));
  const out = {};
  for (const node of panel.querySelectorAll('[data-probe]')) out[node.dataset.probe] = node;
  const { line, dot } = probeLayer(svg);
  let timer = 0;

  function place(x, y) {
    [x, y] = [Math.round(x * SNAP) / SNAP, Math.round(y * SNAP) / SNAP];
    const form = landform(json, x, y), near = nearestPage(json.pages, x, y);
    out.x.textContent = formatNumber(x, 2);
    out.y.textContent = formatNumber(y, 2);
    out.z.textContent = formatNumber(form.z, 3);
    out.kind.textContent = describeGround(form);
    out.near.textContent = near.label;
    out.near.href = near.href;
    line.setAttribute('d', pathData(traceLevel(json, 'atlas', form.z)));
    const [u, v] = fieldToView(view, x, y), unit = svg.getBoundingClientRect().width / view.size[0];
    dot.setAttribute('cx', u.toFixed(1));
    dot.setAttribute('cy', v.toFixed(1));
    dot.setAttribute('r', (DOT_PX / unit).toFixed(1));
    svg.classList.add('probing');
    panel.classList.add('placed');
    clearTimeout(timer);
    timer = setTimeout(keepInUrl, URL_DELAY, x, y);
  }

  const at = (e) => { // client px -> atlas view px -> field
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return viewToField(view, p.x, p.y);
  };
  svg.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') place(...at(e)); });
  svg.addEventListener('click', (e) => { if (!e.target.closest('a')) place(...at(e)); });
  // focusin is heard on an HTML ancestor: Chrome makes an svg with focus listeners itself focusable,
  // so a tap on open ground would focus (and ring) the whole map.
  (svg.closest('.atlas-frame, .atlas') || svg.parentElement).addEventListener('focusin', (e) => {
    const page = pages.get(e.target.closest?.('.atlas-link')?.dataset.slug);
    if (page) place(...page.field_xy);
  });
  svg.classList.add('has-probe');
  panel.hidden = false;
  const start = placeFromQuery(location.search, json.field.domain);
  if (start) place(...start);
  return place;
}

async function start(svg) {
  const group = svg.querySelector('g.contours'), panel = document.querySelector('.atlas .probe');
  if (group && !group.querySelector('path')) {
    drawContours(group).catch((err) => console.warn('isej atlas: contours not traced:', err));
  }
  let json;
  try {
    json = await loadField();
  } catch (err) {
    console.warn('isej atlas: field unavailable; the map keeps its markers and links:', err);
    panel?.remove();
    return;
  }
  if (panel) mountProbe(svg, panel, json);
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  // Inside the Worker: one request, one answer with the traced markup.
  self.onmessage = () => loadField().then(
    (json) => self.postMessage({ markup: atlasMarkup(json) }),
    (err) => self.postMessage({ error: String(err) }));
} else if (typeof document !== 'undefined') {
  const svg = document.getElementById('atlas');
  if (svg) start(svg);
}
