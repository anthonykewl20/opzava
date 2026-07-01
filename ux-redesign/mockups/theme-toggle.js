/* Opzava mockups — light/dark theme switcher.
 * Injected into every mockup. Applies the saved theme before paint, then mounts
 * a modern segmented switcher in the UPPER RIGHT of the header — a shadcn-style
 * track with a raised active segment: ☀ (light) · ☾ (dark). No overflow menu —
 * the two icon segments are the whole control. The choice is remembered
 * (localStorage) and shared across mockups. ☀ returns to the page's light
 * variant (calm on Essential, light elsewhere); ☾ is dark. */
(function () {
  var KEY = 'opzava-mock-theme';
  var root = document.documentElement;
  var pageDefault = root.getAttribute('data-theme') || 'dark';
  var lightVariant = root.getAttribute('data-light') || (pageDefault === 'calm' ? 'calm' : 'light');
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) root.setAttribute('data-theme', saved);

  function cur() { return root.getAttribute('data-theme') || pageDefault; }
  function isDark(t) { return t === 'dark' || t === 'hc'; }
  function set(t) { root.setAttribute('data-theme', t); try { localStorage.setItem(KEY, t); } catch (e) {} render(); }

  var SEG = [
    { mode: 'light', icon: '☀', label: 'Light mode', apply: function () { set(lightVariant); } },
    { mode: 'dark', icon: '☾', label: 'Dark mode', apply: function () { set('dark'); } }
  ];

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'theme-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Theme');
    wrap.style.cssText = 'display:inline-flex;align-items:center;position:relative;font-family:var(--font-sans);flex:none';

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
    wrap.appendChild(track);

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
  }

  function render() {
    var c = cur();
    Array.prototype.forEach.call(document.querySelectorAll('#theme-switch [data-seg]'), function (b) {
      var on = (b.dataset.seg === 'dark') ? isDark(c) : !isDark(c);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.background = on ? 'var(--surface)' : 'none';
      b.style.color = on ? 'var(--accent)' : 'var(--fg-muted)';
      b.style.boxShadow = on ? 'var(--shadow-sm)' : 'none';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
