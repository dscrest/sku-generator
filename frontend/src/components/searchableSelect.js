// Searchable dropdowns (CR-265): every native <select> opens a type-to-filter
// panel instead of the OS popup. The select stays the source of truth — a pick
// sets it and fires a native change, so no call site knows the difference and
// any new <select> is covered without being asked.
// ES5, no imports: everything above the export line is pasted verbatim at the
// top of each widget's <script> (self-contained by packaging; first, so a
// failed widget init can't skip it); searchableSelect.test.js fails on drift.
var SS_MAX_H = 240;   // list height cap
var SS_HEAD = 48;     // search box + panel padding above the list
var SS_PANEL_CSS = 'position:fixed;z-index:2000;box-sizing:border-box;padding:4px;text-align:left;' +
  'background:var(--bg-card,#fff);border:1px solid var(--border,#d9dfe8);border-radius:var(--radius-md,8px);' +
  'box-shadow:var(--shadow-lg);font-size:13px;font-weight:400;color:var(--text-primary,#0f172a);';
var SS_INPUT_CSS = 'display:block;width:100%;box-sizing:border-box;margin:0 0 4px;padding:6px 8px;' +
  'font:inherit;font-size:13px;text-align:left;outline:none;color:inherit;background:var(--bg-card,#fff);' +
  'border:1px solid var(--border,#d9dfe8);border-radius:6px;';
var SS_ROW_CSS = 'padding:7px 10px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

function optionRows(select) {
  var rows = [];
  for (var i = 0; i < select.options.length; i++) {
    var o = select.options[i];
    rows.push({ i: i, label: o.text, disabled: Boolean(o.disabled), selected: i === select.selectedIndex });
  }
  return rows;
}

function filterRows(rows, q) {
  var s = String(q || '').trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(function (r) { return r.label.toLowerCase().indexOf(s) !== -1; });
}

// Next pickable index from `from` in direction `delta`; stays put at the ends,
// -1 when nothing is pickable.
function stepActive(rows, from, delta) {
  for (var i = from + delta; i >= 0 && i < rows.length; i += delta) {
    if (!rows[i].disabled) return i;
  }
  return rows[from] && !rows[from].disabled ? from : -1;
}

// Panel box from the select's rect: below by default, above when that side has
// more room; never narrower than 180 (page-size, table cells) nor off-screen.
function placePanel(rect, vw, vh) {
  var below = vh - rect.bottom;
  var up = below < SS_MAX_H + SS_HEAD && rect.top > below;
  var minWidth = Math.min(Math.max(rect.width, 180), vw - 16);
  var pos = {
    left: Math.max(8, Math.min(rect.left, vw - minWidth - 8)),
    minWidth: minWidth,
    maxWidth: Math.max(minWidth, Math.min(420, vw - 16)),
    maxHeight: Math.max(80, Math.min(SS_MAX_H, (up ? rect.top : below) - SS_HEAD - 12)),
  };
  if (up) pos.bottom = vh - rect.top + 4; else pos.top = rect.bottom + 4;
  return pos;
}

// Keys that open the panel from a focused select. Enter is left alone: it
// submits modal forms and walks grid columns.
function isOpenKey(e) {
  if (e.ctrlKey || e.metaKey) return false;
  var k = e.key || '';
  if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'F4') return true;
  return !e.altKey && k.length === 1;
}

function installSearchableSelects(doc) {
  if (doc.__searchableSelects) return;
  doc.__searchableSelects = true;
  var win = doc.defaultView;
  // ponytail: touch devices keep the OS picker (no search there) — build a
  // touch panel if phones/tablets become a target.
  if (win.matchMedia && win.matchMedia('(hover: none)').matches) return;

  var cur = null; // the open panel: { select, panel, input, list, rows, shown, active, observer }

  function close(refocus) {
    if (!cur) return;
    var c = cur;
    cur = null;
    c.observer.disconnect();
    if (c.panel.parentNode) c.panel.parentNode.removeChild(c.panel);
    if (refocus && c.select.isConnected) c.select.focus();
  }

  // Close first: a change handler may rebuild the row this select lives in.
  function pick(row) {
    if (row.disabled) return;
    var select = cur.select;
    close(false);
    if (select.selectedIndex !== row.i) {
      select.selectedIndex = row.i;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (select.isConnected) select.focus();
  }

  function paint(scroll) {
    var kids = cur.list.children;
    for (var n = 0; n < cur.shown.length; n++) {
      kids[n].style.background = n === cur.active ? 'var(--bg-secondary,#eef2f7)' : 'none';
      if (scroll && n === cur.active && kids[n].scrollIntoView) kids[n].scrollIntoView({ block: 'nearest' });
    }
    cur.input.setAttribute('aria-activedescendant', cur.active >= 0 ? 'ss-opt-' + cur.active : '');
  }

  function build() {
    cur.shown = filterRows(cur.rows, cur.input.value);
    cur.list.textContent = '';
    cur.shown.forEach(function (r, n) {
      var d = doc.createElement('div');
      d.id = 'ss-opt-' + n;
      d.setAttribute('role', 'option');
      d.setAttribute('aria-selected', r.selected ? 'true' : 'false');
      if (r.disabled) d.setAttribute('aria-disabled', 'true');
      d.textContent = r.label || ' ';
      d.title = r.label;
      d.style.cssText = SS_ROW_CSS + (r.disabled ? 'opacity:.5;cursor:default;' : 'cursor:pointer;') +
        (r.selected ? 'font-weight:600;' : '');
      d.addEventListener('mouseenter', function () { if (!r.disabled) { cur.active = n; paint(false); } });
      d.addEventListener('click', function () { pick(r); });
      cur.list.appendChild(d);
    });
    if (!cur.shown.length) {
      var none = doc.createElement('div');
      none.textContent = 'No matches';
      none.style.cssText = SS_ROW_CSS + 'color:var(--text-muted,#94a3b8);';
      cur.list.appendChild(none);
    }
  }

  function show(select, typed) {
    var pos = placePanel(select.getBoundingClientRect(), win.innerWidth, win.innerHeight);
    var panel = doc.createElement('div');
    panel.setAttribute('data-searchable-select', '');
    panel.style.cssText = SS_PANEL_CSS + 'left:' + pos.left + 'px;min-width:' + pos.minWidth + 'px;max-width:' + pos.maxWidth + 'px;' +
      (pos.top === undefined ? 'bottom:' + pos.bottom + 'px;' : 'top:' + pos.top + 'px;');
    var input = doc.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search…';
    input.autocomplete = 'off';
    input.value = typed;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', 'ss-list');
    input.setAttribute('aria-label', 'Search options');
    input.style.cssText = SS_INPUT_CSS;
    var list = doc.createElement('div');
    list.id = 'ss-list';
    list.setAttribute('role', 'listbox');
    list.style.cssText = 'overflow-y:auto;max-height:' + pos.maxHeight + 'px;';
    panel.appendChild(input);
    panel.appendChild(list);

    // Rebuild when the app re-renders the options; vanish with the select.
    var observer = new win.MutationObserver(function (muts) {
      if (!cur) return;
      if (!cur.select.isConnected) return close(false);
      for (var m = 0; m < muts.length; m++) {
        if (cur.select.contains(muts[m].target)) {
          cur.rows = optionRows(cur.select);
          build();
          cur.active = stepActive(cur.shown, -1, 1);
          paint(true);
          return;
        }
      }
    });
    cur = { select: select, panel: panel, input: input, list: list, rows: optionRows(select), shown: [], active: -1, observer: observer };
    build();
    cur.active = -1;
    if (!typed) cur.shown.forEach(function (r, n) { if (r.selected && !r.disabled) cur.active = n; });
    if (cur.active < 0) cur.active = stepActive(cur.shown, -1, 1);

    input.addEventListener('input', function () {
      build();
      cur.active = stepActive(cur.shown, -1, 1);
      paint(true); // back to the top match
    });
    input.addEventListener('keydown', function (e) {
      // Nothing typed here may reach page shortcuts or an open modal's Escape.
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur.active = stepActive(cur.shown, cur.active, e.key === 'ArrowDown' ? 1 : -1);
        paint(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cur.shown[cur.active]) pick(cur.shown[cur.active]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
      } else if (e.key === 'Tab') {
        close(true); // Tab then moves on from the select
      }
    });
    // Other popovers (calendar, row menu) close on a document mousedown outside
    // themselves — ours must not count. Rows keep the search box focused.
    panel.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      if (e.target !== input) e.preventDefault();
    });

    doc.body.appendChild(panel);
    // Content can be wider than the select: pull back inside the viewport.
    var over = pos.left + panel.offsetWidth + 8 - win.innerWidth;
    if (over > 0) panel.style.left = Math.max(8, pos.left - over) + 'px';
    observer.observe(doc.body, { childList: true, subtree: true });
    paint(true);
    input.focus();
  }

  function usable(el) {
    return el && el.tagName === 'SELECT' && !el.disabled && !el.multiple && !(el.size > 1);
  }

  doc.addEventListener('mousedown', function (e) {
    if (cur && cur.panel.contains(e.target)) return;
    var was = cur && cur.select;
    close(false);
    // Firefox reports the <option> as the target.
    var select = e.target.closest ? e.target.closest('select') : null;
    if (e.button !== 0 || !usable(select)) return;
    e.preventDefault(); // no native popup
    if (was === select) return select.focus(); // second click closes
    show(select, '');
  }, true);

  doc.addEventListener('keydown', function (e) {
    if (cur || !usable(e.target) || !isOpenKey(e)) return;
    e.preventDefault();
    show(e.target, e.key.length === 1 && e.key !== ' ' ? e.key : '');
  }, true);

  // The anchor moved → close. Scrolling our own list must neither close us nor
  // reach the capture-phase scroll closers of the popover we may be opened from.
  win.addEventListener('scroll', function (e) {
    if (!cur) return;
    if (cur.panel.contains(e.target)) return e.stopImmediatePropagation();
    close(false);
  }, true);
  win.addEventListener('resize', function () { close(false); });
}

export { optionRows, filterRows, stepActive, placePanel, isOpenKey, installSearchableSelects };
