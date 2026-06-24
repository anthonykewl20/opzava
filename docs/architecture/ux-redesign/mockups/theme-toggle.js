/* Opzava mockups — light/dark (+ Calm / High-contrast) theme switcher.
 * Injected into every mockup. Applies the saved theme before paint, then mounts
 * a modern segmented switcher in the UPPER RIGHT of the header (a shadcn-style
 * track with a raised active segment + a small overflow menu for all themes).
 * The choice is remembered (localStorage) and shared across mockups. */
(function () {
  var KEY = 'opzava-mock-theme';
  var root = document.documentElement;
  var pageDefault = root.getAttribute('data-theme') || 'dark';
  // The light theme this page returns to when you toggle out of dark.
  var lightVariant = root.getAttribute('data-light') || (pageDefault === 'calm' ? 'calm' : 'light');
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) root.setAttribute('data-theme', saved);

  var THEMES = [
    { id: 'light', label: 'Light', icon: '☀' },
    { id: 'calm', label: 'Calm (warm)', icon: '◐' },
    { id: 'dark', label: 'Dark', icon: '☾' },
    { id: 'hc', label: 'High contrast', icon: '◼' }
  ];
  function cur() { return root.getAttribute('data-theme') || pageDefault; }
  function isDark(t) { return t === 'dark' || t === 'hc'; }
  function set(t) { root.setAttribute('data-theme', t); try { localStorage.setItem(KEY, t); } catch (e) {} render(); }

  // Segmented control: two quick segments (Light / Dark) + a ⋯ overflow menu.
  var SEG = [
    { mode: 'light', icon: '☀', label: 'Light mode', apply: function () { set(lightVariant); } },
    { mode: 'dark', icon: '☾', label: 'Dark mode', apply: function () { set('dark'); } }
  ];

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'theme-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Theme');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;position:relative;font-family:var(--font-sans);flex:none';

    // ── Segmented track (raised active segment = the modern look) ──
    var track = document.createElement('div');
    track.style.cssText = 'display:inline-flex;align-items:center;gap:2px;padding:3px;background:var(--surface-2);border:1px solid var(--border);border-radius:9999px';
    SEG.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.seg = s.mode;
      b.setAttribute('aria-label', s.label);
      b.title = s.label;
      b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:9999px;background:none;color:var(--fg-muted);font-size:15px;line-height:1;cursor:pointer;transition:background 140ms ease,color 140ms ease,box-shadow 140ms ease';
      b.textContent = s.icon;
      b.addEventListener('click', s.apply);
      b.addEventListener('mouseenter', function () { if (b.getAttribute('aria-pressed') !== 'true') b.style.color = 'var(--fg)'; });
      b.addEventListener('mouseleave', function () { if (b.getAttribute('aria-pressed') !== 'true') b.style.color = 'var(--fg-muted)'; });
      track.appendChild(b);
    });

    // ── Overflow ⋯ button → full theme menu ──
    var more = document.createElement('button');
    more.type = 'button'; more.id = 'theme-more';
    more.setAttribute('aria-label', 'More themes');
    more.setAttribute('aria-haspopup', 'menu');
    more.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:9999px;background:none;color:var(--fg-muted);font-size:17px;line-height:1;cursor:pointer';
    more.textContent = '⋯';
    more.addEventListener('mouseenter', function () { more.style.background = 'var(--surface-2)'; more.style.color = 'var(--fg)'; });
    more.addEventListener('mouseleave', function () { more.style.background = 'none'; more.style.color = 'var(--fg-muted)'; });

    var menu = document.createElement('div');
    menu.id = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'display:none;position:absolute;top:calc(100% + 8px);right:0;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:6px;min-width:200px';
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.theme = t.id; b.setAttribute('role', 'menuitemradio');
      b.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:var(--radius-md);background:none;color:var(--fg);font:inherit;font-size:var(--text-sm);cursor:pointer;text-align:left';
      b.innerHTML = '<span aria-hidden="true" style="width:18px;text-align:center">' + t.icon + '</span><span style="flex:1">' + t.label + '</span><span class="chk" aria-hidden="true" style="color:var(--accent)"></span>';
      b.addEventListener('mouseenter', function () { b.style.background = 'var(--surface-2)'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
      b.addEventListener('click', function () { set(t.id); menu.style.display = 'none'; });
      menu.appendChild(b);
    });
    more.addEventListener('click', function (e) { e.stopPropagation(); menu.style.display = (menu.style.display === 'none' ? 'block' : 'none'); });

    wrap.appendChild(track);
    wrap.appendChild(more);
    wrap.appendChild(menu);

    // ── Mount upper-right: into the header's right cluster, after .u-grow.
    //    Falls back to a fixed top-right anchor if no header is present. ──
    var header = document.querySelector('.topbar') || document.querySelector('.header');
    var grow = header && header.querySelector(':scope > .u-grow');
    if (grow) {
      grow.insertAdjacentElement('afterend', wrap);
    } else if (header) {
      header.appendChild(wrap);
    } else {
      wrap.style.cssText += ';position:fixed;top:14px;right:16px;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:9999px;padding:4px 6px;box-shadow:var(--shadow-md)';
      document.body.appendChild(wrap);
    }

    render();
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) menu.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.style.display = 'none'; });
  }

  function render() {
    var c = cur();
    // Segmented track active state — raised pill on the active segment.
    Array.prototype.forEach.call(document.querySelectorAll('#theme-switch [data-seg]'), function (b) {
      var on = (b.dataset.seg === 'dark') ? isDark(c) : !isDark(c);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.background = on ? 'var(--surface)' : 'none';
      b.style.color = on ? 'var(--accent)' : 'var(--fg-muted)';
      b.style.boxShadow = on ? 'var(--shadow-sm)' : 'none';
    });
    var menu = document.getElementById('theme-menu');
    if (menu) Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      var on = b.dataset.theme === c;
      b.querySelector('.chk').textContent = on ? '✓' : '';
      b.style.color = on ? 'var(--accent)' : 'var(--fg)';
      b.style.fontWeight = on ? '600' : '400';
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
