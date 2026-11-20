// Runs before the page is painted (small, synchronous, same-origin: allowed by the strict CSP).
// - marks that JavaScript is available (CSS only hides "reveal" elements when it is);
// - applies the visitor's theme choice, or their system preference, without a light/dark flash.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch {
    /* storage blocked: follow the system */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  root.setAttribute('data-theme', theme);
})();
