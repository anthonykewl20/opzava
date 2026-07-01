/* Opzava mockups — make every "Find a …" search inside an .sb-menu actually
 * filter that menu's items. Covers the project/board quick-switchers and any
 * other dropdown that pairs a text input with .sb-menu-item rows. Vanilla,
 * theme-adaptive; typing hides non-matching items, hides section labels while
 * searching (a flat list reads calmer), and shows a calm "no matches" line. */
(function () {
  function wire(input) {
    var menu = input.closest('.sb-menu'); if (!menu || input.dataset.mfWired) return;
    input.dataset.mfWired = '1';
    var empty = document.createElement('div');
    empty.className = 'mf-empty';
    empty.style.cssText = 'padding:8px 10px;font-size:var(--text-sm);color:var(--fg-muted);display:none';
    menu.appendChild(empty);
    input.addEventListener('input', function () {
      var q = (input.value || '').toLowerCase().trim();
      var items = menu.querySelectorAll('.sb-menu-item');
      var any = false;
      items.forEach(function (it) {
        var match = it.textContent.toLowerCase().indexOf(q) !== -1;
        it.style.display = match ? '' : 'none';
        if (match) any = true;
      });
      // quiet the section labels + separators while a query is active
      menu.querySelectorAll('.sb-menu-label, .sb-menu-sep').forEach(function (l) { l.style.display = q ? 'none' : ''; });
      empty.textContent = (q && !any) ? ('No matches for “' + input.value.trim() + '”') : '';
      empty.style.display = (q && !any) ? 'block' : 'none';
    });
  }
  function init() {
    document.querySelectorAll('.sb-menu input[type="text"], .sb-menu input[type="search"]').forEach(wire);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
