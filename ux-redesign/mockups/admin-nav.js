(function () {
  'use strict';

  function init() {
    var button = document.querySelector('.header [aria-label="Collapse sidebar"]');
    var app = document.querySelector('.app');
    var rail = app && app.querySelector('.rail');
    var navQuery = window.matchMedia ? window.matchMedia('(max-width: 860px)') : null;
    var scrim = null;

    if (!button || !app || !rail) return;

    if (!rail.id) rail.id = 'admin-rail';
    button.setAttribute('aria-controls', rail.id);

    function isMobile() {
      return navQuery ? navQuery.matches : false;
    }

    function ensureScrim() {
      if (scrim && scrim.parentNode) return scrim;
      scrim = app.querySelector('.rail-scrim');
      if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'rail-scrim';
        scrim.setAttribute('aria-hidden', 'true');
        app.appendChild(scrim);
      }
      if (!scrim.__adminNavBound) {
        scrim.addEventListener('click', function () { closeMobile(true); });
        scrim.__adminNavBound = true;
      }
      return scrim;
    }

    function syncExpanded() {
      button.setAttribute('aria-expanded', isMobile()
        ? String(app.classList.contains('nav-open'))
        : String(!app.classList.contains('is-collapsed')));
      rail.setAttribute('aria-hidden', isMobile() && !app.classList.contains('nav-open') ? 'true' : 'false');
      rail.inert = isMobile() && !app.classList.contains('nav-open');
    }

    function openMobile() {
      app.classList.remove('is-collapsed');
      ensureScrim();
      app.classList.add('nav-open');
      document.body.classList.add('nav-locked');
      syncExpanded();

      var firstItem = rail.querySelector('a, button');
      if (firstItem && firstItem.focus) firstItem.focus();
    }

    function closeMobile(restoreFocus) {
      app.classList.remove('nav-open');
      document.body.classList.remove('nav-locked');
      syncExpanded();
      if (restoreFocus && button.focus) button.focus();
    }

    function toggleMobile() {
      if (app.classList.contains('nav-open')) closeMobile(true);
      else openMobile();
    }

    function syncMode() {
      if (isMobile()) {
        app.classList.remove('is-collapsed');
      } else {
        closeMobile(false);
      }
      syncExpanded();
    }

    button.addEventListener('click', function (event) {
      event.preventDefault();
      if (isMobile()) {
        toggleMobile();
        return;
      }
      closeMobile(false);
      app.classList.toggle('is-collapsed');
      syncExpanded();
    });

    document.addEventListener('keydown', function (event) {
      if ((event.key === 'Escape' || event.key === 'Esc') && isMobile() && app.classList.contains('nav-open')) {
        closeMobile(true);
      }
    });

    if (navQuery) {
      if (navQuery.addEventListener) navQuery.addEventListener('change', syncMode);
      else if (navQuery.addListener) navQuery.addListener(syncMode);
    }
    window.addEventListener('resize', syncMode);
    syncMode();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
