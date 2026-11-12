// Call-for-papers film: play the cut that is on screen once when it comes into view; click or tap replays it.
// With reduced motion requested, or if playback is refused, the poster stays and the browser's controls show.
(() => {
  const film = [...document.querySelectorAll("video.film")].find((v) => v.offsetParent !== null);
  if (!film) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    film.controls = true;
    return;
  }
  const start = () => film.play().catch(() => { film.controls = true; });
  const watcher = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    start();
  }, { threshold: 0.5 });
  watcher.observe(film);
  film.addEventListener("click", () => { film.currentTime = 0; start(); });
})();
