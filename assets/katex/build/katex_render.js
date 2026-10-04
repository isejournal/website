// Render TeX snippets to HTML with KaTeX under JavaScriptCore (no DOM needed).
// Usage: jsc katex_render.js -- <katex.min.js> <snippets.json>
// snippets.json: {"name": {"tex": "...", "display": true|false}, ...}
// Prints {"version": "...", "options": {...}, "html": {"name": "<span class=\"katex...\">...", ...}}.
var katexPath = arguments[0];
var snippetsPath = arguments[1];
load(katexPath);
var snippets = JSON.parse(read(snippetsPath));
var base = {throwOnError: true, strict: "error", output: "htmlAndMathml"};
var out = {version: katex.version, options: base, html: {}};
for (var name in snippets) {
  var s = snippets[name];
  var opts = {displayMode: !!s.display, fleqn: !!s.display};
  for (var k in base) opts[k] = base[k];
  out.html[name] = katex.renderToString(s.tex, opts);
}
print(JSON.stringify(out));
