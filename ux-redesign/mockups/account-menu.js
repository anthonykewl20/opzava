/* Opzava mockups — the account dropdown on the topbar avatar (every page).
 * Finds the top-right account avatar, marks it data-account-trigger (so
 * avatar-card.js leaves it alone), and opens a calm shadcn .sb-menu: a header
 * (you), View profile, Your tools, Settings, Appearance, Help, Sign out.
 * Theme-adaptive; one accent (none here — the menu is all-neutral navigation). */
(function () {
  var ME = { name: 'Anthony Garces', email: 'anthony@opzava.io', init: 'AG', chart: 'var(--chart-2)' };
  var ITEMS = [
    { g: '👤', label: 'View profile', href: 'essential-profile.html' },
    { g: '🔗', label: 'Your tools', href: 'essential-tools.html', note: '5 / 7' },
    { g: '⚙', label: 'Settings', href: 'essential-profile.html#security' },
    { g: '◐', label: 'Appearance', href: 'essential-profile.html#appearance' },
    { g: '❔', label: 'Help & support', href: 'essential-ask-opzava.html' },
    { sep: true },
    { g: '↪', label: 'Sign out', href: 'essential-signout.html' }
  ];

  function findTrigger() {
    var explicit = document.getElementById('acctBtn');
    if (explicit) return explicit;
    var bar = document.querySelector('.topbar, .header, header');
    if (!bar) return null;
    // the account avatar is the LAST avatar in the bar (the logo, if an avatar, is first)
    var avs = bar.querySelectorAll('.ava, .sb-avatar');
    for (var i = avs.length - 1; i >= 0; i--) {
      var t = (avs[i].textContent || '').trim();
      if (/^[A-Za-z]{1,3}$/.test(t)) return avs[i];   // initials, not the ◆ logo glyph
    }
    return avs.length ? avs[avs.length - 1] : null;
  }

  function build() {
    if (document.getElementById('acct-menu')) return;
    var trigger = findTrigger();
    if (!trigger) return;
    trigger.setAttribute('data-account-trigger', '');          // avatar-card.js skips this one
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('tabindex', '0');
    trigger.style.cursor = 'pointer';

    var css = document.createElement('style');
    css.textContent =
      '#acct-menu{position:fixed;z-index:9997;min-width:248px;max-width:calc(100vw - 24px);display:none;' +
      'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:6px}' +
      '#acct-menu[data-open="true"]{display:block}' +
      '#acct-menu .am-hd{display:flex;align-items:center;gap:10px;padding:8px 8px 10px;margin-bottom:4px;border-bottom:1px solid var(--border)}' +
      '#acct-menu .am-av{width:38px;height:38px;flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:var(--fw-semibold);font-size:var(--text-sm)}' +
      '#acct-menu .am-nm{font-size:var(--text-sm);font-weight:var(--fw-semibold);color:var(--fg);line-height:1.25}' +
      '#acct-menu .am-em{font-size:var(--text-xs);color:var(--fg-subtle);line-height:1.25}' +
      '#acct-menu .am-item{display:flex;align-items:center;gap:10px;padding:8px;border-radius:var(--radius-sm);text-decoration:none;color:var(--fg);font-size:var(--text-sm)}' +
      '#acct-menu .am-item:hover{background:var(--surface-2);text-decoration:none}' +
      '#acct-menu .am-g{width:18px;text-align:center;flex:none;color:var(--fg-muted)}' +
      '#acct-menu .am-note{margin-left:auto;font-size:var(--text-xs);color:var(--fg-subtle)}' +
      '#acct-menu .am-sep{height:1px;background:var(--border);margin:5px 2px}';
    document.head.appendChild(css);

    var menu = document.createElement('div');
    menu.id = 'acct-menu'; menu.className = 'sb-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Account');
    menu.innerHTML =
      '<div class="am-hd"><span class="am-av" style="background:' + ME.chart + '" aria-hidden="true">' + ME.init + '</span>' +
      '<div><div class="am-nm">' + ME.name + '</div><div class="am-em">' + ME.email + '</div></div></div>' +
      ITEMS.map(function (it) {
        if (it.sep) return '<div class="am-sep" role="separator"></div>';
        return '<a class="am-item" role="menuitem" href="' + it.href + '"><span class="am-g" aria-hidden="true">' + it.g + '</span>' +
          it.label + (it.note ? '<span class="am-note">' + it.note + '</span>' : '') + '</a>';
      }).join('');
    document.body.appendChild(menu);

    function place() {
      var r = trigger.getBoundingClientRect(), w = menu.offsetWidth || 248;
      var left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
      menu.style.left = left + 'px'; menu.style.top = (r.bottom + 8) + 'px';
    }
    function open() { menu.setAttribute('data-open', 'true'); place(); trigger.setAttribute('aria-expanded', 'true'); }
    function close() { menu.setAttribute('data-open', 'false'); trigger.setAttribute('aria-expanded', 'false'); }
    function isOpen() { return menu.getAttribute('data-open') === 'true'; }

    trigger.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); isOpen() ? close() : open(); });
    trigger.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen() ? close() : open(); } });
    document.addEventListener('click', function (e) { if (isOpen() && !menu.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) { close(); trigger.focus && trigger.focus(); } });
    window.addEventListener('resize', function () { if (isOpen()) place(); });
    window.addEventListener('scroll', function () { if (isOpen()) place(); }, true);

    if (location.hash === '#account-open') open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
