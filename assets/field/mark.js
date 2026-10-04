// "Our mark" explorable for the About page: four amplitude sliders re-trace this page's
// window on the field. Everything is computed by engine.js from isej-field.json; nothing
// here re-draws random numbers. Without JavaScript the section keeps its <noscript> banner,
// the pre-rendered equation and the code; the slider block stays hidden.
import { loadField, makeField, traceView, renderSvg } from "./engine.js";

const SPAN = 1.5;            // slider range either side of the published amplitude
const STEP = 0.01;
const MIN_STROKE_PX = 0.8;   // contours stay visible when the figure is drawn narrow (kit: hairline, about 1 px)

function _prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function _token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function formatAmplitude(value) {
  const text = Math.abs(value).toFixed(2);
  return value < 0 && text !== "0.00" ? "−" + text : text;
}

// An untouched (or reset) slider uses the exported amplitude itself: browsers normalise a range
// input's value to about 15 significant digits, which would move the field by ~1e-16.
function _amplitude(slider, published) {
  return slider.value === slider.dataset.initial ? published : Number(slider.value);
}

function editedBumps(bumps, sliders) {
  return bumps.map((bump, i) => [_amplitude(sliders[i], bump[0]), ...bump.slice(1)]);
}

// One ochre line: the view's ochre level while it is visible, else the visible level nearest to it.
function keepOneAccent(trace, ochreLevel) {
  const visible = trace.paths.filter((p) => p.d);
  if (!visible.length) return;
  let chosen = visible.find((p) => p.ochre);
  if (!chosen) {
    chosen = visible.reduce((best, p) =>
      Math.abs(p.level - ochreLevel) < Math.abs(best.level - ochreLevel) ? p : best);
  }
  for (const p of trace.paths) p.ochre = p === chosen;
}

function _strokeFor(container, viewWidth, viewStroke) {
  const shown = container.getBoundingClientRect().width;
  if (!shown) return viewStroke;
  return Math.max(viewStroke, (MIN_STROKE_PX * viewWidth) / shown);
}

function _applyStroke(container, viewWidth, viewStroke) {
  const width = _strokeFor(container, viewWidth, viewStroke);
  for (const path of container.querySelectorAll("svg path")) path.style.strokeWidth = String(width);
}

// The <noscript> child stays in place, so the static banner can always be restored from it.
function showFallback(container) {
  const noscript = container.querySelector("noscript");
  if (noscript) container.innerHTML = noscript.textContent;
}

function _swapSvg(container, markup) {
  const template = document.createElement("template");
  template.innerHTML = markup;
  const svg = template.content.querySelector("svg");
  if (!svg) throw new Error("mark: renderSvg returned no <svg>");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const old = container.querySelector(":scope > svg");
  if (old) old.replaceWith(svg);
  else container.append(svg);
}

function _setActive(param, on) {
  for (const word of document.querySelectorAll(`.param[data-param="${param}"]`)) {
    word.classList.toggle("is-active", on);
  }
}

function _wireHighlight(slider) {
  const param = slider.dataset.param;
  const release = () => _setActive(param, document.activeElement === slider);
  slider.addEventListener("pointerdown", () => {
    _setActive(param, true);
    window.addEventListener("pointerup", release, { once: true });
    window.addEventListener("pointercancel", release, { once: true });
  });
  slider.addEventListener("focus", () => _setActive(param, true));
  slider.addEventListener("blur", () => _setActive(param, false));
}

function _initSlider(slider, published) {
  slider.min = String(published - SPAN);
  slider.max = String(published + SPAN);
  slider.step = String(STEP);
  slider.value = String(published);
  slider.dataset.initial = slider.value;   // as the browser normalised it
}

function _showValue(slider) {
  const text = formatAmplitude(Number(slider.value));
  slider.setAttribute("aria-valuetext", text);
  const out = slider.closest(".mark-slider")?.querySelector("output");
  if (out) out.textContent = text;
}

export async function mountMark(container) {
  const section = container.closest("section") || document;
  const sliders = [1, 2, 3, 4].map((k) => section.querySelector(`input[type="range"][data-param="a${k}"]`));
  if (sliders.some((s) => !s)) throw new Error("mark: expected four sliders a1..a4");
  const controls = section.querySelector(".mark-controls");
  const reset = section.querySelector(".mark-reset");

  const json = await loadField();
  const viewName = container.dataset.view || "about";
  const view = json.views[viewName];
  if (!view) throw new Error(`mark: no view "${viewName}" in isej-field.json`);
  const published = json.field.bumps.map((b) => b[0]);
  if (published.length !== sliders.length) throw new Error("mark: bump count does not match the sliders");
  const ink = _token("--isej-navy", "#1B2A4A");
  const accent = _token("--isej-ochre", "#B08D57");
  container.style.aspectRatio = `${view.size[0]} / ${view.size[1]}`;

  let drawn = false;
  let frame = 0;

  function draw(drawIn) {
    const field = makeField(json, { bumps: editedBumps(json.field.bumps, sliders) });
    const trace = traceView(json, viewName, { field });
    keepOneAccent(trace, view.levels[view.ochre]);
    _swapSvg(container, renderSvg(trace, { ink, accent, drawIn, pathLength: drawIn, mask: false, id: "mark" }));
    _applyStroke(container, trace.size[0], view.stroke);
    drawn = true;
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      try {
        draw(false);   // re-traces never draw in
      } catch (error) {
        console.warn("ISEJ mark explorable: re-trace failed, showing the static banner:", error);
        if (controls) controls.hidden = true;
        showFallback(container);
      }
    });
  }

  sliders.forEach((slider, i) => {
    _initSlider(slider, published[i]);
    _showValue(slider);
    _wireHighlight(slider);
    slider.addEventListener("input", () => {
      _showValue(slider);
      schedule();
    });
  });
  reset?.addEventListener("click", (event) => {
    event.preventDefault();
    for (const slider of sliders) {
      slider.value = slider.dataset.initial;
      _showValue(slider);
    }
    schedule();
  });
  if (controls) controls.hidden = false;

  if ("ResizeObserver" in window) {
    new ResizeObserver(() => _applyStroke(container, view.size[0], view.stroke)).observe(container);
  }
  const firstDraw = () => { if (!drawn) draw(!_prefersReducedMotion()); };
  if (!("IntersectionObserver" in window)) return firstDraw();
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    firstDraw();
  }, { threshold: 0.2 });
  io.observe(container);
}

const container = document.querySelector('.isej-field[data-field="mark"]');
if (container) {
  mountMark(container).catch((error) => {
    // Any failure (fetch, missing view, engine error) leaves the static banner in place.
    console.warn("ISEJ mark explorable disabled:", error);
    showFallback(container);
  });
}
