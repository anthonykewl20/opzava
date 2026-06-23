/* Opzava mockups — light/dark (+ Calm / High-contrast) theme switcher.
 * Injected into every mockup. Applies the saved theme before paint, then mounts
 * a floating switcher (bottom-right): a Light/Dark toggle + a "⋯" menu of all
 * themes. The choice is remembered (localStorage) and shared across mockups. */
(function () {
  var KEY = 'opzava-mock-theme';
  var root = document.documentElement;
  var pageDefault = root.getAttribute('data-theme') || 'dark';
  // The light theme this page returns to when you toggle out of dark.
  var lightVariant = root.getAttribute('data-light') || (pageDefault === 'calm' ? 'calm' : 'light');
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) root.setAttribute('data-theme', saved);

  var THEMES = [
    { id: 'light', label: 'Light', icon: '☀︎' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'calm', label: 'Calm (warm)', icon: '☕︎' },
    { id: 'hc', label: 'High contrast', icon: '◐' }
  ];
  function cur() { return root.getAttribute('data-theme') || pageDefault; }
  function isDark(t) { return t === 'dark' || t === 'hc'; }
  function set(t) { root.setAttribute('data-theme', t); try { localStorage.setItem(KEY, t); } catch (e) {} render(); }
  function toggle() { set(isDark(cur()) ? lightVariant : 'dark'); }

  function build() {
    var wrap = document.createElement('div');
    wrap.id = 'theme-switch';
    wrap.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:var(--font-sans)';

    var menu = document.createElement('div');
    menu.id = 'theme-menu';
    menu.setAttribute('role', 'menu');
    menu.style.cssText = 'display:none;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);padding:6px;min-width:194px';
    THEMES.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.theme = t.id;
      b.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:var(--radius-md);background:none;color:var(--fg);font:inherit;font-size:var(--text-sm);cursor:pointer;text-align:left';
      b.innerHTML = '<span aria-hidden="true" style="width:18px;text-align:center">' + t.icon + '</span><span style="flex:1">' + t.label + '</span><span class="chk" aria-hidden="true"></span>';
      b.addEventListener('mouseenter', function () { b.style.background = 'var(--surface-2)'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
      b.addEventListener('click', function () { set(t.id); menu.style.display = 'none'; });
      menu.appendChild(b);
    });

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:2px;background:var(--surface);border:1px solid var(--border-strong);border-radius:9999px;box-shadow:var(--shadow-md);padding:4px';
    var tog = document.createElement('button');
    tog.type = 'button'; tog.id = 'theme-toggle';
    tog.setAttribute('aria-label', 'Toggle light or dark mode');
    tog.style.cssText = 'display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border:0;border-radius:9999px;background:none;color:var(--fg);font:inherit;font-size:var(--text-sm);font-weight:600;cursor:pointer';
    tog.addEventListener('click', toggle);
    var more = document.createElement('button');
    more.type = 'button';
    more.setAttribute('aria-label', 'Choose a theme');
    more.setAttribute('aria-haspopup', 'menu');
    more.style.cssText = 'width:34px;height:34px;border:0;border-radius:50%;background:none;color:var(--fg-muted);font-size:18px;line-height:1;cursor:pointer';
    more.textContent = '⋯';
    more.addEventListener('click', function (e) { e.stopPropagation(); menu.style.display = (menu.style.display === 'none' ? 'block' : 'none'); });

    bar.appendChild(tog); bar.appendChild(more);
    wrap.appendChild(menu); wrap.appendChild(bar);
    document.body.appendChild(wrap);
    render();
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) menu.style.display = 'none'; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.style.display = 'none'; });
  }

  function render() {
    var c = cur(), dark = isDark(c);
    var tog = document.getElementById('theme-toggle');
    if (tog) tog.innerHTML = '<span aria-hidden="true">' + (dark ? '🌙' : '☀︎') + '</span> ' + (dark ? 'Dark' : 'Light');
    var menu = document.getElementById('theme-menu');
    if (menu) Array.prototype.forEach.call(menu.querySelectorAll('button'), function (b) {
      var on = b.dataset.theme === c;
      b.querySelector('.chk').textContent = on ? '✓' : '';
      b.style.color = on ? 'var(--accent)' : 'var(--fg)';
      b.style.fontWeight = on ? '600' : '400';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
