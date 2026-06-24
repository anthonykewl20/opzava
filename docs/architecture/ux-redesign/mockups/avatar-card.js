/* Opzava mockups — avatar person-card popover (Asana-style).
 * Injected into every app page. Hovering, focusing, or clicking any PERSON / AI
 * avatar opens a small shadcn-style card with the person's name, role, presence
 * and quick actions. Hover = preview, click = pin.
 * AI is shown by the ✦ glyph + the square .sb-avatar--ai shape, never by colour.
 * Presence (online/away/offline/active) uses a small dot ALWAYS paired with a word
 * — the same scoped signal-colour convention as the bottom tools-bar (green = here,
 * amber = away, grey = offline; never red). Theme-adaptive. */
(function () {
  // Every avatar-shaped element across the mockups (not just .sb-avatar/.ava).
  var AV = '.sb-avatar, .ava, .ava-sm, .ava-person, .ava-ai, .feed-ava, .header-avatar, .task-avatar, .asst-ava, .agent-avatar, .conv-avatar';

  // ── Who's who ── pres: online | away | offline | active (AI working) | idle (AI)
  var PEOPLE = {
    anthony: { name: 'Anthony Garces', you: true, ai: false, chart: 'var(--chart-2)', init: 'AG',
      role: 'Owner · you', pres: 'online', sw: 'Active now', fact: 'On 4 projects · admin' },
    maria:   { name: 'Maria', ai: false, chart: 'var(--chart-3)', init: 'M',
      role: 'Marketing · teammate', pres: 'online', sw: 'Online', fact: '3 shared projects' },
    dan:     { name: 'Dan', ai: false, chart: 'var(--chart-4)', init: 'D',
      role: 'Support · teammate', pres: 'away', sw: 'Away · back ~1pm', fact: '2 shared projects' },
    dev:     { name: 'Dev', ai: false, chart: 'var(--chart-4)', init: 'Dv',
      role: 'Engineering · teammate', pres: 'offline', sw: 'Offline · last seen 2h ago', fact: 'Series B workspace' },
    atlas:   { name: 'Atlas', ai: true, chart: 'var(--chart-5)', init: 'A',
      role: '✦ AI assistant · Content', pres: 'active', sw: 'Working now', fact: 'Leads Q2 Content Push · 6 tasks today' },
    echo:    { name: 'Echo', ai: true, chart: 'var(--chart-1)', init: 'E',
      role: '✦ AI assistant · Support', pres: 'active', sw: 'Replying now', fact: 'Handles support replies · 3 open' },
    iris:    { name: 'Iris', ai: true, chart: 'var(--chart-6)', init: 'I',
      role: '✦ AI assistant · Social', pres: 'active', sw: 'Active', fact: 'Social captions & scheduling' },
    hermes:  { name: 'Hermes', ai: true, chart: 'var(--chart-2)', init: 'H',
      role: '✦ AI runner · fleet', pres: 'idle', sw: 'Idle · no runs queued', fact: 'Runs a fleet on demand' }
  };
  var PRES = {
    online:  { dot: '#16c060',          word: 'Online' },
    away:    { dot: '#f5a30b',          word: 'Away' },
    offline: { dot: 'var(--fg-subtle)', word: 'Offline' },
    active:  { dot: '#16c060',          word: 'Active' },
    idle:    { dot: 'var(--fg-subtle)', word: 'Idle' }
  };

  var BYNAME = {};
  Object.keys(PEOPLE).forEach(function (k) { BYNAME[PEOPLE[k].name.toLowerCase()] = k; BYNAME[PEOPLE[k].name.split(' ')[0].toLowerCase()] = k; });
  var BYINIT = { ag: 'anthony', m: 'maria', d: 'dan', dv: 'dev', at: 'atlas', a: 'atlas', e: 'echo', i: 'iris', h: 'hermes' };

  function isAi(el) { return /(?:^|[\s-])(?:sb-avatar--ai|ava-sm--ai|ava-ai|agent-avatar|feed-ava--ai|asst-ava)\b|--ai\b/.test(el.className || ''); }

  function resolve(el) {
    if (el.dataset && el.dataset.person && PEOPLE[el.dataset.person]) return el.dataset.person;
    var lbl = ((el.getAttribute('title') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
    for (var nm in BYNAME) { if (lbl.indexOf(nm) !== -1) return BYNAME[nm]; }
    var txt = (el.textContent || '').trim().toLowerCase();
    var ai = isAi(el);
    if (BYINIT[txt]) {
      var k = BYINIT[txt];
      // a bare "a" is Atlas only when it's an AI avatar; otherwise let adjacent text decide
      if (txt === 'a' && !ai) { k = null; }
      if (k) return k;
    }
    // adjacent text: scan the avatar's row/container for a known name
    var scope = el.closest('[class*="row"], .msg, .comment, .inbox-row, .ghost-row, .u-row, li, tr, .card') || el.parentElement;
    if (scope) {
      var st = (scope.textContent || '').toLowerCase();
      for (var nm2 in BYNAME) { if (new RegExp('(^|[^a-z])' + nm2 + '([^a-z]|$)').test(st)) return BYNAME[nm2]; }
    }
    return null;
  }

  function build() {
    if (document.getElementById('avatar-pop')) return;
    var css = document.createElement('style');
    css.textContent =
      '#avatar-pop{position:fixed;z-index:9998;width:304px;max-width:calc(100vw - 24px);display:none;' +
      'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:0}' +
      '#avatar-pop[data-open="true"]{display:block}' +
      '#avatar-pop .ap-hd{display:flex;align-items:center;gap:var(--space-3);padding:var(--space-4) var(--space-4) var(--space-3)}' +
      '#avatar-pop .ap-avwrap{position:relative;flex:none}' +
      '#avatar-pop .ap-av{width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-weight:var(--fw-semibold);font-size:var(--text-md);position:relative}' +
      '#avatar-pop .ap-av--ai{border-radius:var(--radius-md)}' +
      '#avatar-pop .ap-av--ai::after{content:"✦";position:absolute;right:-5px;bottom:-5px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:var(--accent-fg);font-size:11px;display:flex;align-items:center;justify-content:center;border:2px solid var(--surface)}' +
      '#avatar-pop .ap-pres{position:absolute;right:-1px;bottom:-1px;width:13px;height:13px;border-radius:50%;border:2.5px solid var(--surface)}' +
      '#avatar-pop .ap-nm{font-size:var(--text-md);font-weight:var(--fw-semibold);color:var(--fg);line-height:var(--lh-snug)}' +
      '#avatar-pop .ap-role{font-size:var(--text-sm);color:var(--fg-muted);margin-top:1px}' +
      '#avatar-pop .ap-meta{padding:0 var(--space-4) var(--space-3);display:flex;flex-direction:column;gap:7px}' +
      '#avatar-pop .ap-line{display:flex;align-items:center;gap:8px;font-size:var(--text-sm);color:var(--fg)}' +
      '#avatar-pop .ap-line .g{width:16px;text-align:center;color:var(--fg-muted);flex:none}' +
      '#avatar-pop .ap-line .ap-sub{color:var(--fg-muted)}' +
      '#avatar-pop .ap-dot{width:9px;height:9px;border-radius:50%;flex:none;margin:0 3px}' +
      '#avatar-pop .ap-pres-label{font-weight:var(--fw-medium)}' +
      '#avatar-pop .ap-ft{display:flex;gap:var(--space-2);padding:var(--space-3) var(--space-4);border-top:1px solid var(--border)}' +
      '#avatar-pop .ap-ft a{flex:1 1 0;text-align:center;font-size:var(--text-sm);font-weight:var(--fw-medium);text-decoration:none;color:var(--fg);background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);padding:7px 8px}' +
      '#avatar-pop .ap-ft a:hover{background:var(--surface-3);color:var(--fg)}' +
      '#avatar-pop .ap-ft a.ap-primary{color:var(--accent);border-color:var(--accent-soft)}' +
      AV.split(',').map(function (s) { return s.trim() + '{cursor:default}'; }).join('');
    document.head.appendChild(css);

    var pop = document.createElement('div');
    pop.className = 'sb-popover'; pop.id = 'avatar-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Person');
    document.body.appendChild(pop);

    var anchor = null, pinned = false, openTimer = null, closeTimer = null;
    function isOpen() { return pop.getAttribute('data-open') === 'true'; }

    function render(p) {
      var avCls = 'ap-av' + (p.ai ? ' ap-av--ai' : '');
      var pr = PRES[p.pres] || PRES.offline;
      // presence dot on the avatar — humans only (AI keeps its ✦ identity badge in that corner)
      var presDot = p.ai ? '' : '<span class="ap-pres" style="background:' + pr.dot + '" aria-hidden="true"></span>';
      var msgLink = p.ai
        ? '<a class="ap-primary" href="project-assistant.html">✦ Open chat →</a><a href="essential-tools.html">Runs →</a>'
        : '<a class="ap-primary" href="essential-messages.html">Message →</a><a href="essential-team-room.html">Profile →</a>';
      if (p.you) msgLink = '<a class="ap-primary" href="essential-my-stuff.html">My stuff →</a><a href="essential-tools.html">Your tools →</a>';
      pop.innerHTML =
        '<div class="ap-hd"><span class="ap-avwrap"><span class="' + avCls + '" style="background:' + p.chart + '" aria-hidden="true">' + p.init + '</span>' + presDot + '</span>' +
        '<div><div class="ap-nm">' + p.name + '</div><div class="ap-role">' + p.role + '</div></div></div>' +
        '<div class="ap-meta">' +
        '<div class="ap-line" aria-label="Presence: ' + pr.word + (p.ai ? '' : ' — ' + p.sw) + '"><span class="ap-dot" style="background:' + pr.dot + '" aria-hidden="true"></span><span class="ap-pres-label">' + (p.ai ? p.sw : pr.word) + '</span><span class="ap-sub" style="margin-left:auto">' + (p.ai ? '✦ AI' : (p.pres === 'online' ? '' : p.sw.replace(/^[^·]*·\s*/, ''))) + '</span></div>' +
        '<div class="ap-line"><span class="g" aria-hidden="true">▸</span><span class="ap-sub">' + p.fact + '</span></div>' +
        '</div><div class="ap-ft">' + msgLink + '</div>';
    }
    function place(el) {
      var r = el.getBoundingClientRect(), w = Math.min(304, window.innerWidth - 24), gap = 8;
      var left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12));
      var below = r.bottom + gap, h = pop.offsetHeight || 160;
      var top = (below + h < window.innerHeight - 8) ? below : Math.max(8, r.top - gap - h);
      pop.style.left = left + 'px'; pop.style.top = top + 'px'; pop.style.width = w + 'px';
    }
    function openFor(el, key) {
      anchor = el; render(PEOPLE[key]); pop.setAttribute('data-open', 'true'); place(el);
    }
    function close() { pop.setAttribute('data-open', 'false'); pinned = false; anchor = null; }

    document.addEventListener('pointerover', function (e) {
      if (pop.contains(e.target)) { clearTimeout(closeTimer); return; }
      var a = e.target.closest && e.target.closest(AV); if (!a || a.closest('[data-account-trigger]')) return;
      var key = resolve(a); if (!key) return;
      clearTimeout(closeTimer);
      if (anchor === a && isOpen()) return;
      clearTimeout(openTimer); openTimer = setTimeout(function () { if (!pinned) openFor(a, key); }, 110);
    });
    document.addEventListener('pointerout', function (e) {
      if (pinned) return;
      var to = e.relatedTarget;
      if (to && pop.contains(to)) return;
      if (to && to.closest && to.closest(AV) === anchor && anchor) return;
      clearTimeout(openTimer); closeTimer = setTimeout(close, 200);
    });
    document.addEventListener('focusin', function (e) {
      var a = e.target.closest && e.target.closest(AV); if (!a || a.closest('[data-account-trigger]')) return;
      var key = resolve(a); if (key) openFor(a, key);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest(AV);
      if (a && !a.closest('[data-account-trigger]')) { var key = resolve(a); if (key) { e.preventDefault(); e.stopPropagation(); clearTimeout(closeTimer); openFor(a, key); pinned = true; return; } }
      if (isOpen() && !pop.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });
    window.addEventListener('resize', function () { if (isOpen() && anchor) place(anchor); });
    window.addEventListener('scroll', function () { if (isOpen() && anchor) place(anchor); }, true);

    // Screenshot-ready: #avatar-open pins the card on the first resolvable avatar.
    if (location.hash === '#avatar-open') {
      var all = document.querySelectorAll(AV);
      for (var i = 0; i < all.length; i++) { var k = resolve(all[i]); if (k) { openFor(all[i], k); pinned = true; break; } }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
