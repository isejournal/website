// Call-for-papers film: play once when it scrolls into view; click or tap to play it again.
// With reduced motion requested, or if playback is refused, the poster stays and the browser's controls show.
(() => {
  const film = document.querySelector("figure.film video");
  if (!film) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    film.controls = true;
    return;
  }
  const watcher = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    watcher.disconnect();
    film.play().catch(() => { film.controls = true; });
  }, { threshold: 0.6 });
  watcher.observe(film);
  film.addEventListener("click", () => {
    film.currentTime = 0;
    film.play().catch(() => { film.controls = true; });
  });
})();
