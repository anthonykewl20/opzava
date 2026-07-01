/* Opzava mockups — a small accessibility enhancement applied to every Essential
 * page: a "Skip to content" link (WCAG 2.2 SC 2.4.1 Bypass Blocks; Nielsen #7
 * Flexibility & efficiency) so keyboard users can jump past the repeated topnav.
 * Visually hidden until focused, then it slides in. Theme-adaptive. */
(function () {
  function init() {
    if (document.querySelector('.skip-link')) return;
    var main = document.querySelector('main') || document.querySelector('[role="main"]') ||
               document.querySelector('.bc-wrap') || document.querySelector('.bc') || document.body;
    if (!main.id) main.id = 'main-content';

    var css = document.createElement('style');
    css.textContent =
      '.skip-link{position:fixed;top:8px;left:8px;z-index:10001;background:var(--accent);color:var(--accent-fg);' +
      'padding:9px 16px;border-radius:var(--radius-md);font-size:var(--text-sm);font-weight:var(--fw-medium);' +
      'text-decoration:none;transform:translateY(-160%);transition:transform var(--dur-fast,.15s) var(--ease-standard,ease)}' +
      '.skip-link:focus{transform:translateY(0);outline:2px solid var(--fg);outline-offset:2px}';
    document.head.appendChild(css);

    var a = document.createElement('a');
    a.className = 'skip-link'; a.href = '#' + main.id; a.textContent = 'Skip to content';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      main.setAttribute('tabindex', '-1');
      main.focus();
      main.scrollIntoView({ block: 'start' });
    });
    document.body.insertBefore(a, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
