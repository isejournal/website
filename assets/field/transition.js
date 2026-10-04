/* ISEJ cross-document view transition: the window travels (pairs with transition.css). Load on every
   page as a CLASSIC script in <head>, no defer/async: <script src="/assets/field/transition.js"></script>
   (pagereveal fires before the first render; a module runs too late where blocking="render" is unsupported).
   Old page (pageswap): name its field graphic, record where its window sat on screen. New page
   (pagereveal): old screen -> old view px -> field -> new view px -> new screen is a similarity
   Q -> lam*Q + beta (complex; with stretch 1 the view-px part is (s_A/s_B)·R(theta_A - theta_B)).
   No previous window or any doubt: the field stays unnamed and the page cross-fades. No imports. */
{
  const JSON_URL = '/assets/field/isej-field.json';
  const VIEWS = 'isej-views'; // sessionStorage: {name: {size, window, kind}}, cached from the JSON
  const PREV = 'isej-prev'; // sessionStorage: the old page's window on screen, written at pageswap
  const FIELD_EL = '[data-field], .banner .field-bg, #hero, #atlas'; // first one naming a known view
  const FIT = { banner: 'xMinYMax slice', hero: 'xMidYMax slice', atlas: 'xMidYMid meet' }; // as engine.js renders
  const MAX_AGE = 5000; // ms; Chrome abandons a transition whose new page needs more than 4 s
  const NEAR_ONE = 1e-3; // |1 - lam| below this is a pure shift (the pivot would sit far off-screen)
  const AT = { Min: 0, Mid: 0.5, Max: 1 };

  // A missing or unreadable record is the expected "no transition" case (storage may be disabled).
  const read = (key) => { try { return JSON.parse(sessionStorage.getItem(key)); } catch (err) { return null; } };
  const write = (key, v) => { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (err) { console.warn('isej transition:', key, err); } };
  const onScreen = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; // an unsized placeholder is not
  function viewOf(el) { // data-field, else #hero / #atlas, else the banner file (policies shows contact.svg)
    if (el.dataset.field || el.id === 'hero' || el.id === 'atlas') return el.dataset.field || el.id;
    const m = /([\w-]+)\.svg$/.exec(el.getAttribute('src') || '');
    return m ? m[1] : null;
  }
  const pick = (views) => [...document.querySelectorAll(FIELD_EL)].find((el) => views[viewOf(el)]) || null;

  // view px -> viewport px as the element paints its view: k = (slice or cover ? max : min), then aligned.
  // An empty placeholder (engine.js has not mounted yet) is measured as the svg it will hold.
  function screenMap(el, { size: [w, h], kind }) {
    const g = el.matches('img, svg') ? el : el.querySelector('img, svg') || el;
    const r = g.getBoundingClientRect();
    let ax, ay, slice;
    if (g.localName === 'img') {
      const cs = getComputedStyle(g);
      slice = cs.objectFit === 'cover';
      [ax, ay] = cs.objectPosition.split(' ').map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : NaN));
    } else {
      const par = g.localName === 'svg' ? g.getAttribute('preserveAspectRatio') || 'xMidYMid meet' : FIT[kind] || '';
      const [align = '', mode] = par.trim().split(/\s+/);
      [ax, ay, slice] = [AT[align.slice(1, 4)], AT[align.slice(5, 8)], mode === 'slice'];
    }
    const k = (slice ? Math.max : Math.min)(r.width / w, r.height / h);
    const map = { k, x: r.left + ax * (r.width - k * w), y: r.top + ay * (r.height - k * h) };
    return Number.isFinite(map.k + map.x + map.y) && map.k > 0 ? map : null;
  }

  // contours.Window.to_field with stretch 1, and its inverse; win = [cx, cy, scale, theta, stretch]
  function toField([cx, cy, s, t], [w, h], u, v) {
    const du = (u - w / 2) * s, dv = (v - h / 2) * s, c = Math.cos(t), n = Math.sin(t);
    return [cx + c * du - n * dv, cy + n * du + c * dv];
  }
  function toView([cx, cy, s, t], [w, h], x, y) {
    const dx = x - cx, dy = y - cy, c = Math.cos(t), n = Math.sin(t);
    return [w / 2 + (c * dx + n * dy) / s, h / 2 + (c * dy - n * dx) / s];
  }
  const px = (x, y) => `${x.toFixed(3)}px ${y.toFixed(3)}px`; // CSS strings: 3 dp px, 6 dp rad and scale
  const move = (x, y, rad, k) => `translate(${px(x, y).replace(' ', ', ')}) rotate(${rad.toFixed(6)}rad) scale(${k.toFixed(6)})`;

  function plan(prev, el, views) { // -> the six custom properties, or null for a plain cross-fade
    const A = views[prev.view], B = views[viewOf(el)];
    if (!A || !B || A.window[4] !== 1 || B.window[4] !== 1) return null; // stretched windows are not similar
    const r = el.getBoundingClientRect(), map = screenMap(el, B);
    if (!map || !onScreen(r)) return null;
    const phi = (X, Y) => { // where an old on-screen point lands on the new screen
      const [x, y] = toField(A.window, A.size, (X - prev.map.x) / prev.map.k, (Y - prev.map.y) / prev.map.k);
      const [u, v] = toView(B.window, B.size, x, y);
      return [map.x + map.k * u, map.y + map.k * v];
    };
    const beta = phi(0, 0), e1 = phi(1, 0), lam = [e1[0] - beta[0], e1[1] - beta[1]];
    const [ax, ay, aw, ah] = prev.box, dx = r.left - ax, dy = r.top - ay; // the frame travels old box -> new box
    const one = [1 - lam[0], -lam[1]], d2 = one[0] ** 2 + one[1] ** 2;
    let pivot, to, from;
    if (Math.sqrt(d2) >= NEAR_ONE) { // rotate and scale about the fixed point beta / (1 - lam)
      pivot = [(beta[0] * one[0] + beta[1] * one[1]) / d2, (beta[1] * one[0] - beta[0] * one[1]) / d2];
      const rad = Math.atan2(lam[1], lam[0]), k = Math.hypot(lam[0], lam[1]);
      [to, from] = [move(-dx, -dy, rad, k), move(dx, dy, -rad, 1 / k)];
    } else { // a shift: carry the old box's centre exactly
      const c = [ax + aw / 2, ay + ah / 2], q = phi(c[0], c[1]), sx = q[0] - c[0], sy = q[1] - c[1];
      pivot = [ax, ay];
      [to, from] = [move(sx - dx, sy - dy, 0, 1), move(dx - sx, dy - sy, 0, 1)];
    }
    return {
      '--isej-to': to, '--isej-from': from, '--isej-ow': `${aw}px`, '--isej-nw': `${r.width}px`,
      '--isej-oo': px(pivot[0] - ax, pivot[1] - ay), '--isej-no': px(pivot[0] - r.left, pivot[1] - r.top),
    };
  }

  addEventListener('pageswap', (e) => {
    const views = read(VIEWS), el = views && pick(views);
    if (!el) return;
    el.style.viewTransitionName = ''; // a page restored from the back/forward cache may still carry a name
    const view = viewOf(el), r = el.getBoundingClientRect(), map = e.viewTransition && screenMap(el, views[view]);
    if (!map || !onScreen(r)) return; // no transition, nothing measurable, or scrolled away: plain cross-fade
    el.style.viewTransitionName = 'field';
    write(PREV, { view, map, box: [r.left, r.top, r.width, r.height], t: Date.now() });
  });

  addEventListener('pagereveal', (e) => {
    const prev = read(PREV), views = read(VIEWS), el = views && pick(views);
    if (prev) write(PREV, null); // one record, one reveal
    if (!e.viewTransition || !el) return;
    const props = prev && Date.now() - prev.t < MAX_AGE ? plan(prev, el, views) : null;
    const root = document.documentElement.style;
    el.style.viewTransitionName = props ? 'field' : 'none';
    for (const k in props) root.setProperty(k, props[k]);
    e.viewTransition.finished.finally(() => {
      for (const k in props) root.removeProperty(k);
      el.style.viewTransitionName = '';
    });
  });

  if (!read(VIEWS)) fetch(JSON_URL, { priority: 'low' })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((json) => write(VIEWS, Object.fromEntries(Object.entries(json.views).map(([k, v]) => [k, { size: v.size, window: v.window, kind: v.kind }]))))
    .catch((err) => console.warn('isej transition: no field JSON, pages will cross-fade', err));
}
