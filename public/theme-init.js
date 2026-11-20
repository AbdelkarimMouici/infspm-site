// Runs before the page is painted (small, synchronous, same-origin: allowed by the strict CSP).
// - marks that JavaScript is available (CSS only hides "reveal" elements when it is);
// - applies the dark theme before the first paint;
// - applies the visitor's "pause animations" choice.
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  // The site is designed as a dark, glowing world: one theme for everyone.
  root.setAttribute('data-theme', 'dark');
  try {
    if (localStorage.getItem('motion') === 'paused') root.classList.add('motion-paused');
  } catch {
    /* storage blocked: animations on */
  }
})();
