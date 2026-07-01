/* Opzava mockups — persistent "Your tools" status bar (doc 12 §11 + §12).
 * A slim, ambient bottom bar (IDE / terminal style) injected into every app page
 * so the health of your linked tools is glanceable WITHOUT opening the page.
 *
 * STATUS SIGNAL (scoped to this bar ONLY): the status mark is the GLYPH itself,
 * BRIGHT-coloured (no occluding behind-dot), with a DISTINCT motion per status —
 *   green  (Active/Connected = go)  — slow steady  (tb-steady 2.6s)
 *   amber  (Degraded = caution)     — fast blink    (tb-fast .8s)
 *   grey   (Disconnected = stopped) — static
 *   blue/accent (Not linked)        — intermittent glow (tb-iglow 2.6s)
 * Never red. Reduced-motion-safe. Glyph shape + label stay colour-blind carriers.
 *
 * POPOVERS (doc 12 §12.8 — per-tool, user 2026-06-24): ONE popover element,
 * repositioned + repopulated per trigger so each control gets its OWN anchored
 * popover. The rollup "🔗 4/5 connected" opens the all-tools OVERVIEW (rows drill
 * into a tool); EACH chip opens THAT tool's DETAIL card (status · connection ·
 * what it can do · version/last-seen · contextual actions), with the arrow
 * pointing at the chip. Only "Connect" on a not-linked tool opens the wizard;
 * "Reconnect" resolves in place. "Open Your tools →" is the link to the page. */
(function () {
  // The five local linked tools + their illustrative detail (matches essential-tools.html).
  var TOOLS = [
    { name: 'Claude Code',    glyph: '✦', label: 'Active',       note: 'Running a deploy step',        where: 'On your computer', via: 'via MCP',        caps: 'Run tasks · edit files · read your repo', ver: 'v1.8.2', seen: 'just now', needs: false },
    { name: 'OpenCode',       glyph: '●', label: 'Connected',    note: 'Idle — ready for work',        where: 'On your computer', via: 'via live agent', caps: 'Run tasks · edit files',                  ver: 'v0.4.1', seen: '3m ago',  needs: false },
    { name: 'Codex CLI',      glyph: '◐', label: 'Degraded',     note: 'Responding slowly (p95 1.8s)', where: 'On your computer', via: 'via MCP',        caps: 'Run tasks · read your repo',              ver: 'v2.0.0', seen: '30s ago', needs: false },
    { name: 'Codex Desktop',  glyph: '○', label: 'Disconnected', note: 'Closed — last seen 2h ago',    where: 'Desktop app',      via: 'via MCP',        caps: 'Run tasks · edit files',                  ver: 'v1.2.0', seen: '2h ago',  needs: false },
    { name: 'Claude Desktop', glyph: '●', label: 'Connected',    note: 'Idle — ready for work',        where: 'Desktop app',      via: 'via MCP',        caps: 'Run tasks · read your repo',              ver: 'v1.5.3', seen: 'just now', needs: false }
  ];
  var REACHABLE = { Active: 1, Connected: 1, Degraded: 1 };

  // State -> coloured-GLYPH class (colour on the glyph; per-status motion).
  function glyphCls(t) {
    if (t.needs) return 'gl gl-link';                                          // ＋ Not linked — blue intermittent glow
    if (t.label === 'Active' || t.label === 'Connected') return 'gl gl-ok';    // green — slow steady
    if (t.label === 'Degraded') return 'gl gl-warn';                           // amber — fast blink
    return 'gl gl-off';                                                        // ○ Disconnected — grey, static
  }
  function byName(n) { for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].name === n) return TOOLS[i]; }
  function esc(n) { return (window.CSS && CSS.escape) ? CSS.escape(n) : n; }

  function build() {
    if (document.getElementById('tools-bar')) return;

    var connected = TOOLS.filter(function (t) { return REACHABLE[t.label]; }).length;
    var needsCount = TOOLS.filter(function (t) { return t.needs; }).length;

    var css = document.createElement('style');
    css.textContent =
      '#tools-bar{position:fixed;left:0;right:0;bottom:0;z-index:9998;display:flex;align-items:center;gap:14px;height:40px;padding:0 16px;' +
      'background:var(--surface);border-top:1px solid var(--border);box-shadow:0 -2px 10px -6px rgba(0,0,0,.18);font-family:var(--font-sans);font-size:var(--text-sm)}' +
      '#tools-bar .tb-roll{display:inline-flex;align-items:center;gap:7px;color:var(--fg);text-decoration:none;font-weight:var(--fw-medium);white-space:nowrap;flex:none;' +
      'border:0;background:none;font-family:inherit;font-size:inherit;cursor:pointer;padding:0}' +
      '#tools-bar .tb-roll:hover{color:var(--accent)}' +
      '#tools-bar .tb-roll .n{font-variant-numeric:tabular-nums}' +
      '#tools-bar .tb-sep{width:1px;height:18px;background:var(--border);flex:none}' +
      '#tools-bar .tb-tools{display:flex;align-items:center;gap:1px;overflow-x:auto;flex:1 1 auto;scrollbar-width:none}' +
      '#tools-bar .tb-tools::-webkit-scrollbar{display:none}' +
      '#tools-bar .tb-chip{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:9999px;color:var(--fg-muted);text-decoration:none;white-space:nowrap;' +
      'border:0;background:none;font-family:inherit;font-size:inherit;cursor:pointer}' +
      '#tools-bar .tb-chip:hover{background:var(--surface-2);color:var(--fg)}' +
      '#tools-bar .tb-chip[aria-expanded="true"]{background:var(--surface-2);color:var(--fg)}' +
      // status mark = the glyph itself, bright + centred
      '#tools-bar .tb-chip .g{display:inline-grid;place-items:center;width:18px;height:18px;line-height:1}' +
      '#tools-bar .tb-chip .g .gl{font-size:var(--text-md)}' +
      '#tools-bar .tb-chip--needs{color:var(--accent);font-weight:var(--fw-medium)}' +
      '#tools-bar .tb-open{color:var(--fg-muted);text-decoration:none;white-space:nowrap;flex:none;font-weight:var(--fw-medium)}' +
      '#tools-bar .tb-open:hover{color:var(--accent)}' +
      // ── Standardised status signal: bright colour + a DISTINCT motion each ──
      '#tools-bar .gl{display:inline-grid;place-items:center;line-height:1}' +
      '#tools-bar .gl-ok{color:#16c060;animation:tb-steady 2.6s ease-in-out infinite}' +
      '#tools-bar .gl-warn{color:#f5a30b;animation:tb-fast .8s ease-in-out infinite}' +
      '#tools-bar .gl-off{color:var(--fg-subtle)}' +
      '#tools-bar .gl-link{color:var(--accent);animation:tb-iglow 2.6s ease-in-out infinite}' +
      '@keyframes tb-steady{0%,100%{opacity:1}50%{opacity:.5}}' +
      '@keyframes tb-fast{0%,100%{opacity:1}50%{opacity:.18}}' +
      '@keyframes tb-iglow{0%,55%,100%{text-shadow:none;opacity:.82}72%{text-shadow:0 0 7px var(--accent);opacity:1}82%{text-shadow:0 0 2px var(--accent);opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){#tools-bar .gl-ok,#tools-bar .gl-warn,#tools-bar .gl-link{animation:none}}' +
      // ── Popover (one element; left + width + arrow set via JS per trigger) ──
      '#tools-bar .tb-pop{position:absolute;bottom:48px;z-index:9999;max-width:calc(100vw - 24px);max-height:min(64vh,540px);overflow:auto;display:none}' +
      '#tools-bar .tb-pop[data-open="true"]{display:block}' +
      '#tools-bar .tb-pop-hd{font-weight:var(--fw-semibold);color:var(--fg);margin-bottom:6px;font-variant-numeric:tabular-nums}' +
      // overview rows (each is a button → opens that tool's card)
      '#tools-bar .tb-row{display:flex;align-items:center;gap:10px;width:100%;padding:8px;border:0;background:none;border-radius:var(--radius-sm);cursor:pointer;text-align:left;font:inherit}' +
      '#tools-bar .tb-row:hover{background:var(--surface-2)}' +
      '#tools-bar .tb-row + .tb-row{border-top:1px solid var(--border)}' +
      '#tools-bar .tb-row .g{display:inline-grid;place-items:center;width:22px;height:22px;flex:none}' +
      '#tools-bar .tb-row .g .gl{font-size:var(--text-lg)}' +
      '#tools-bar .tb-row .tb-id{display:flex;flex-direction:column;min-width:0;gap:1px}' +
      '#tools-bar .tb-row .tb-nm{font-size:var(--text-sm);color:var(--fg);font-weight:var(--fw-medium)}' +
      '#tools-bar .tb-row .tb-sub{font-size:var(--text-xs);color:var(--fg-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#tools-bar .tb-row .tb-sub .sl-label{color:var(--fg-muted);font-weight:var(--fw-medium);margin-right:5px}' +
      '#tools-bar .tb-row .u-grow{flex:1 1 auto}' +
      '#tools-bar .tb-row .tb-row-go{color:var(--fg-subtle);font-size:var(--text-md);flex:none}' +
      // per-tool detail card
      '#tools-bar .tb-card-hd{display:flex;align-items:center;gap:9px;margin-bottom:5px}' +
      '#tools-bar .tb-card-hd .g{display:inline-grid;place-items:center;width:24px;height:24px;flex:none}' +
      '#tools-bar .tb-card-hd .g .gl{font-size:var(--text-xl)}' +
      '#tools-bar .tb-card-nm{font-size:var(--text-md);font-weight:var(--fw-semibold);color:var(--fg)}' +
      '#tools-bar .tb-card-st{font-size:var(--text-xs);font-weight:var(--fw-medium);color:var(--fg-muted)}' +
      '#tools-bar .tb-card-via{font-size:var(--text-xs);color:var(--fg-subtle);margin-bottom:10px}' +
      '#tools-bar .tb-card-body{display:flex;flex-direction:column;gap:7px;padding:10px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:10px}' +
      '#tools-bar .tb-card-line{display:flex;gap:10px;font-size:var(--text-sm);color:var(--fg);line-height:var(--lh-snug)}' +
      '#tools-bar .tb-card-line .k{flex:none;width:58px;color:var(--fg-subtle);font-size:var(--text-xs);padding-top:1px}' +
      '#tools-bar .tb-card-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
      '#tools-bar .tb-foot{margin-top:8px;padding-top:8px;border-top:1px solid var(--border);text-align:right}' +
      '#tools-bar .tb-foot a{color:var(--fg-muted);text-decoration:none;font-weight:var(--fw-medium)}' +
      '#tools-bar .tb-foot a:hover{color:var(--accent)}' +
      '#tools-bar .tb-arrow{position:absolute;bottom:-7px;width:12px;height:12px;background:var(--surface);border-right:1px solid var(--border);border-bottom:1px solid var(--border);transform:rotate(45deg)}' +
      '@media (max-width:1080px){#tools-bar .tb-chip .nm{display:none}}' +
      '@media (max-width:560px){#tools-bar .tb-tools{display:none}}';
    document.head.appendChild(css);

    var bar = document.createElement('nav');
    bar.id = 'tools-bar';
    bar.setAttribute('aria-label', 'Linked tools status');

    // ── ONE popover, repositioned + repopulated per trigger ──
    var pop = document.createElement('div');
    pop.className = 'sb-popover tb-pop';
    pop.id = 'tb-pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = '<div class="tb-pop-inner"></div><span class="tb-arrow" aria-hidden="true"></span>' +
      '<div role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"></div>';
    var inner = pop.querySelector('.tb-pop-inner');
    var arrow = pop.querySelector('.tb-arrow');

    function glyphSpan(t) { return '<span class="g"><span class="' + glyphCls(t) + '" aria-hidden="true">' + t.glyph + '</span></span>'; }

    function overviewHTML() {
      var hd = needsCount
        ? connected + ' of ' + TOOLS.length + ' connected · ' + needsCount + ' needs you'
        : connected + ' of ' + TOOLS.length + ' connected';
      var rows = TOOLS.map(function (t) {
        return '<button class="tb-row" type="button" data-open-tool="' + t.name + '">' + glyphSpan(t) +
          '<span class="tb-id"><span class="tb-nm">' + t.name + '</span>' +
          '<span class="tb-sub"><span class="sl-label">' + t.label + '</span>' + t.note + '</span></span>' +
          '<span class="u-grow"></span><span class="tb-row-go" aria-hidden="true">›</span></button>';
      }).join('');
      return '<div class="tb-pop-hd">' + hd + '</div>' + rows +
        '<div class="tb-foot"><a href="essential-tools.html">Open Your tools <span aria-hidden="true">→</span></a></div>';
    }

    function cardActions(t) {
      if (t.needs)
        return '<a class="btn btn-primary btn-sm" href="essential-connect-wizard.html"><span aria-hidden="true">＋</span> Connect</a>' +
               '<a class="btn btn-ghost btn-sm" href="essential-tools.html">Learn more</a>';
      if (t.label === 'Disconnected')
        return '<button class="btn btn-primary btn-sm" type="button" data-reconnect="' + t.name + '"><span aria-hidden="true">↻</span> Reconnect</button>' +
               '<a class="btn btn-ghost btn-sm" href="essential-tools.html">Technical details</a>';
      if (t.label === 'Degraded')
        return '<a class="btn btn-ghost btn-sm" href="essential-tools.html">Open</a>' +
               '<button class="btn btn-ghost btn-sm" type="button" data-reconnect="' + t.name + '"><span aria-hidden="true">↻</span> Reconnect</button>';
      return '<a class="btn btn-ghost btn-sm" href="essential-tools.html">Open</a>' +
             '<button class="btn btn-ghost btn-sm" type="button">Settings</button>';
    }
    function toolHTML(t) {
      var key = t.needs ? 'Setup' : (t.label === 'Disconnected' ? 'Last seen' : 'Status');
      var lines = '<div class="tb-card-line"><span class="k">' + key + '</span><span>' + t.note + '</span></div>';
      if (t.caps) lines += '<div class="tb-card-line"><span class="k">Can do</span><span>' + t.caps + '</span></div>';
      if (t.ver)  lines += '<div class="tb-card-line"><span class="k">Version</span><span>' + t.ver + ' · seen ' + t.seen + '</span></div>';
      return '<div class="tb-card-hd">' + glyphSpan(t) +
          '<span class="tb-card-nm">' + t.name + '</span><span class="u-grow" style="flex:1 1 auto"></span>' +
          '<span class="tb-card-st">' + t.label + '</span></div>' +
        '<div class="tb-card-via">' + t.where + ' · ' + t.via + '</div>' +
        '<div class="tb-card-body">' + lines + '</div>' +
        '<div class="tb-card-actions">' + cardActions(t) + '</div>';
    }

    var openKey = null;
    function place(triggerEl, width) {
      pop.style.width = width + 'px';
      var vw = window.innerWidth, m = 12;
      var r = triggerEl.getBoundingClientRect();
      var left = Math.max(m, Math.min(r.left, vw - width - m));
      pop.style.left = left + 'px';
      arrow.style.left = Math.max(14, Math.min(r.left + r.width / 2 - left - 6, width - 22)) + 'px';
    }
    function closePop() {
      pop.setAttribute('data-open', 'false');
      roll.setAttribute('aria-expanded', 'false');
      Array.prototype.forEach.call(tools.querySelectorAll('[aria-expanded="true"]'), function (c) { c.setAttribute('aria-expanded', 'false'); });
      openKey = null;
    }
    function openOverview(triggerEl) {
      inner.innerHTML = overviewHTML();
      pop.setAttribute('aria-label', 'Your tools — overview');
      pop.setAttribute('data-open', 'true');
      place(triggerEl, 340);
      roll.setAttribute('aria-expanded', 'true');
      openKey = 'overview';
    }
    function openTool(t, triggerEl) {
      inner.innerHTML = toolHTML(t);
      pop.setAttribute('aria-label', t.name + ' — status & actions');
      pop.setAttribute('data-open', 'true');
      place(triggerEl, 300);
      Array.prototype.forEach.call(tools.querySelectorAll('[aria-expanded="true"]'), function (c) { c.setAttribute('aria-expanded', 'false'); });
      if (triggerEl.classList.contains('tb-chip')) triggerEl.setAttribute('aria-expanded', 'true');
      roll.setAttribute('aria-expanded', 'false');
      openKey = t.name;
    }

    // Left — the rollup → OVERVIEW popover.
    var roll = document.createElement('button');
    roll.type = 'button';
    roll.className = 'tb-roll';
    roll.setAttribute('aria-haspopup', 'dialog');
    roll.setAttribute('aria-expanded', 'false');
    roll.setAttribute('aria-controls', 'tb-pop');
    roll.setAttribute('aria-label', connected + ' of ' + TOOLS.length + ' tools connected — overview');
    roll.innerHTML = '<span aria-hidden="true">🔗</span> <span class="n">' + connected + '/' + TOOLS.length + ' connected</span>';
    roll.addEventListener('click', function (e) { e.stopPropagation(); if (openKey === 'overview') closePop(); else openOverview(roll); });
    bar.appendChild(roll);

    var sep = document.createElement('span'); sep.className = 'tb-sep'; sep.setAttribute('aria-hidden', 'true');
    bar.appendChild(sep);

    // Middle — each chip → THAT tool's DETAIL card, anchored to the chip.
    var tools = document.createElement('div');
    tools.className = 'tb-tools';
    TOOLS.forEach(function (t) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'tb-chip' + (t.needs ? ' tb-chip--needs' : '');
      c.setAttribute('aria-haspopup', 'dialog');
      c.setAttribute('aria-controls', 'tb-pop');
      c.setAttribute('aria-expanded', 'false');
      c.setAttribute('aria-label', t.name + ': ' + t.label + ', ' + t.note);
      c.title = t.name + ' — ' + t.label;
      c.innerHTML = '<span class="g"><span class="' + glyphCls(t) + '" aria-hidden="true">' + t.glyph + '</span></span>' +
        '<span class="nm">' + t.name + '</span>';
      c.addEventListener('click', function (e) { e.stopPropagation(); if (openKey === t.name) closePop(); else openTool(t, c); });
      tools.appendChild(c);
    });
    bar.appendChild(tools);

    var open = document.createElement('a');
    open.className = 'tb-open';
    open.href = 'essential-tools.html';
    open.innerHTML = 'Your tools <span aria-hidden="true">→</span>';
    bar.appendChild(open);

    bar.appendChild(pop);

    // Inside the popover: drill from an overview row into a tool card; Reconnect
    // resolves in place; other links navigate.
    pop.addEventListener('click', function (e) {
      e.stopPropagation();
      var rc = e.target.closest('[data-reconnect]');
      if (rc) {
        e.preventDefault();
        var live = pop.querySelector('[role="status"]');
        rc.outerHTML = '<span class="sb-statusline"><span class="sl-meta">Reconnecting…</span></span>';
        if (live) live.textContent = 'Reconnecting…';
        return;
      }
      var ot = e.target.closest('[data-open-tool]');
      if (ot) {
        var t = byName(ot.getAttribute('data-open-tool'));
        var chip = tools.querySelector('.tb-chip[aria-label^="' + esc(t.name) + ':"]') || roll;
        openTool(t, chip);
      }
    });

    // Dismissal: click-outside + Esc, focus returns to the rollup.
    document.addEventListener('click', function () { if (pop.getAttribute('data-open') === 'true') closePop(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pop.getAttribute('data-open') === 'true') { closePop(); roll.focus(); }
    });

    document.body.appendChild(bar);

    // Screenshot-ready: #tools-open → overview; #tool=<Name> → that tool's card.
    var m = /[#&]tool=([^&]+)/.exec(location.hash) || /[?&]tool=([^&]+)/.exec(location.search);
    if (m) { var t = byName(decodeURIComponent(m[1])); if (t) openTool(t, tools.querySelector('.tb-chip[aria-label^="' + esc(t.name) + ':"]') || roll); }
    else if (location.hash === '#tools-open' || /(\?|&)toolsbar=open(&|$)/.test(location.search)) openOverview(roll);

    // Keep page content clear of the fixed bar.
    var pb = parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0;
    document.body.style.paddingBottom = (pb + 48) + 'px';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
