/* Opzava mockups — small, dependency-free behaviours shared by the auth
 * storyboards (Set up, Forgot, Reset, Accept invite). Progressive enhancement:
 * every page is fully legible with JS off; these just make the demo feel real.
 *
 *   [data-pw-toggle]      button that shows/hides its nearest password input
 *   [data-strength]       password input wired to a sibling .auth-strength meter
 *
 * No timers, no Date.now(), no network — safe to run on a static file. */
(function () {
  'use strict';

  /* ── Show / hide password ──────────────────────────────────────────────── */
  function wirePwToggles(root) {
    root.querySelectorAll('[data-pw-toggle]').forEach(function (btn) {
      if (btn.__wired) return; btn.__wired = true;
      btn.addEventListener('click', function () {
        var input = btn.closest('.auth-pw').querySelector('input');
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.textContent = show ? '🙈' : '👁';
        input.focus();
      });
    });
  }

  /* ── Password strength — a deliberately simple, honest heuristic ────────── */
  var WORDS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  function score(v) {
    if (!v) return 0;
    var s = 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
    if (v.length < 8) s = Math.min(s, 1);
    return Math.max(1, Math.min(4, s)); // 1..4 once anything is typed
  }
  function wireStrength(root) {
    root.querySelectorAll('[data-strength]').forEach(function (input) {
      if (input.__wired) return; input.__wired = true;
      var meter = document.getElementById(input.getAttribute('data-strength'));
      if (!meter) return;
      var word = meter.querySelector('.auth-strength-word');
      var reqBox = input.getAttribute('data-reqs') ? document.getElementById(input.getAttribute('data-reqs')) : null;
      function paint() {
        var v = input.value;
        var sc = score(v);
        meter.setAttribute('data-score', v ? String(sc) : '0');
        if (word) word.textContent = v ? WORDS[sc] : '';
        if (reqBox) {
          reqBox.querySelectorAll('[data-req]').forEach(function (li) {
            var ok;
            switch (li.getAttribute('data-req')) {
              case 'len':   ok = v.length >= 12; break;
              case 'case':  ok = /[a-z]/.test(v) && /[A-Z]/.test(v); break;
              case 'num':   ok = /\d/.test(v); break;
              case 'sym':   ok = /[^A-Za-z0-9]/.test(v); break;
              default:      ok = false;
            }
            li.classList.toggle('is-met', ok);
            var g = li.querySelector('.rq');
            if (g) g.textContent = ok ? '✓' : '○';
          });
        }
      }
      input.addEventListener('input', paint);
      paint();
    });
  }

  function init() {
    wirePwToggles(document);
    wireStrength(document);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
