/* Opzava mockups — the 🔔 bell as a real-time shadcn-style POPOVER (not a page).
 * Injected into every app page. Finds the topbar bell (the <a href=
 * "essential-notifications.html" aria-label="Notifications…">), intercepts its
 * click, and opens a compact notifications popover anchored under it — Needs-you
 * (the accent rows) + recent Updates + "See all →" to the full page. Status is a
 * glyph + label, never colour; --accent only on the needs-you rows. Theme-adaptive. */
(function () {
  var NEEDS = [
    { g: '✓◷', text: 'Approve the <strong>Webinar banner</strong>', meta: 'Maria · 2 days', act: 'Review', href: 'essential-mkt-approvals.html' },
    { g: '◓', text: '<strong>Goal at risk</strong> — 3 marketing assets: 2 of 3', meta: '6 days left', act: 'Open', href: 'essential-goals.html' },
    { g: '○', text: '<strong>Codex Desktop</strong> went offline', meta: '2h ago', act: 'Reconnect', href: 'essential-tools.html' }
  ];
  var UPDATES = [
    { ai: true, text: '<strong>Atlas</strong> drafted the June Launch email brief and moved it to Approve', meta: '2h' },
    { ai: true, text: '<strong>Atlas</strong> finished the daily check-in — support CSAT up to 88%', meta: '4h' },
    { ai: false, text: '<strong>Maria</strong> approved hero-launch.png', meta: 'yesterday' }
  ];

  function build() {
    var bell = document.querySelector('a[aria-label^="Notifications"], button[aria-label^="Notifications"]');
    if (!bell || document.getElementById('notify-pop')) return;

    var css = document.createElement('style');
    css.textContent =
      '#notify-pop{position:fixed;z-index:9999;width:380px;max-width:calc(100vw - 24px);max-height:min(72vh,580px);overflow:auto;display:none;' +
      'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:0}' +
      '#notify-pop[data-open="true"]{display:block}' +
      '#notify-pop .np-hd{display:flex;align-items:center;justify-content:space-between;gap:var(--space-3);padding:var(--space-4) var(--space-4) var(--space-3);border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface)}' +
      '#notify-pop .np-hd strong{font-size:var(--text-sm);color:var(--fg);font-weight:var(--fw-semibold)}' +
      '#notify-pop .np-hd a{font-size:var(--text-xs);color:var(--fg-muted);text-decoration:none}' +
      '#notify-pop .np-hd a:hover{color:var(--accent)}' +
      '#notify-pop .np-grp{font-size:var(--text-xs);color:var(--fg-subtle);text-transform:uppercase;letter-spacing:var(--tracking-caps);font-weight:var(--fw-semibold);padding:var(--space-3) var(--space-4) 4px}' +
      '#notify-pop .np-row{display:flex;align-items:flex-start;gap:10px;padding:8px var(--space-4);text-decoration:none;color:var(--fg)}' +
      '#notify-pop .np-row:hover{background:var(--surface-2)}' +
      '#notify-pop .np-row--needs{border-left:3px solid var(--accent)}' +
      '#notify-pop .np-g{flex:none;line-height:1.3;color:var(--fg-muted);width:18px;text-align:center}' +
      '#notify-pop .np-row--needs .np-g{color:var(--accent)}' +
      '#notify-pop .np-g--ai{color:var(--accent)}' +
      '#notify-pop .np-body{flex:1 1 auto;min-width:0}' +
      '#notify-pop .np-text{display:block;font-size:var(--text-sm);line-height:var(--lh-snug);color:var(--fg)}' +
      '#notify-pop .np-meta{display:block;font-size:var(--text-xs);color:var(--fg-subtle);margin-top:2px}' +
      '#notify-pop .np-act{flex:none;font-size:var(--text-xs);font-weight:var(--fw-medium);color:var(--accent);align-self:center}' +
      '#notify-pop .np-ft{padding:var(--space-3) var(--space-4);border-top:1px solid var(--border);text-align:center;position:sticky;bottom:0;background:var(--surface)}' +
      '#notify-pop .np-ft a{font-size:var(--text-sm);color:var(--fg-muted);text-decoration:none;font-weight:var(--fw-medium)}' +
      '#notify-pop .np-ft a:hover{color:var(--accent)}' +
      '#notify-pop .np-arrow{position:fixed;width:12px;height:12px;background:var(--surface);border-left:1px solid var(--border);border-top:1px solid var(--border);transform:rotate(45deg);z-index:10000;display:none}' +
      '#notify-pop[data-open="true"] ~ #notify-arrow{display:block}';
    document.head.appendChild(css);

    function av(ai) { return '<span class="np-g' + (ai ? ' np-g--ai' : '') + '" aria-hidden="true">' + (ai ? '✦' : '●') + '</span>'; }
    var needsHTML = NEEDS.map(function (n) {
      return '<a class="np-row np-row--needs" href="' + n.href + '"><span class="np-g" aria-hidden="true">' + n.g + '</span>' +
        '<span class="np-body"><span class="np-text">' + n.text + '</span><span class="np-meta">' + n.meta + '</span></span>' +
        '<span class="np-act">' + n.act + ' →</span></a>';
    }).join('');
    var updHTML = UPDATES.map(function (u) {
      return '<a class="np-row" href="essential-notifications.html">' + av(u.ai) +
        '<span class="np-body"><span class="np-text">' + u.text + '</span><span class="np-meta">' + u.meta + '</span></span></a>';
    }).join('');

    var pop = document.createElement('div');
    pop.className = 'sb-popover'; pop.id = 'notify-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Notifications');
    pop.innerHTML =
      '<div class="np-hd"><strong>Notifications · 3 need you</strong><a href="#" id="np-read">Mark all read</a></div>' +
      '<div class="np-grp">Needs you</div>' + needsHTML +
      '<div class="np-grp">Updates</div>' + updHTML +
      '<div class="np-ft"><a href="essential-notifications.html">See all notifications →</a></div>';
    document.body.appendChild(pop);
    var arrow = document.createElement('span'); arrow.id = 'notify-arrow'; arrow.className = 'np-arrow'; arrow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(arrow);

    function place() {
      var r = bell.getBoundingClientRect(), w = Math.min(380, window.innerWidth - 24);
      var left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
      pop.style.left = left + 'px'; pop.style.top = (r.bottom + 11) + 'px'; pop.style.width = w + 'px';
      arrow.style.top = (r.bottom + 5) + 'px';
      arrow.style.left = Math.max(left + 12, Math.min(r.left + r.width / 2 - 6, left + w - 24)) + 'px';
    }
    function open() { place(); pop.setAttribute('data-open', 'true'); arrow.style.display = 'block'; bell.setAttribute('aria-expanded', 'true'); }
    function close() { pop.setAttribute('data-open', 'false'); arrow.style.display = 'none'; bell.setAttribute('aria-expanded', 'false'); }
    bell.setAttribute('aria-haspopup', 'dialog'); bell.setAttribute('aria-expanded', 'false');
    bell.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); (pop.getAttribute('data-open') === 'true') ? close() : open(); });
    pop.addEventListener('click', function (e) { var r = e.target.closest('#np-read'); if (r) { e.preventDefault(); document.querySelectorAll('#notify-pop .np-row--needs').forEach(function (x) { x.classList.remove('np-row--needs'); }); } });
    document.addEventListener('click', function (e) { if (pop.getAttribute('data-open') === 'true' && !pop.contains(e.target) && e.target !== bell && !bell.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pop.getAttribute('data-open') === 'true') { close(); bell.focus(); } });
    window.addEventListener('resize', function () { if (pop.getAttribute('data-open') === 'true') place(); });

    // Screenshot-ready: #notify-open opens the popover.
    if (location.hash === '#notify-open') open();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
