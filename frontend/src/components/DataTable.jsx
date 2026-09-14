import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { thStyle, cell } from './woCommon.jsx';

// Config-driven record grid + shared column chooser (show/hide + drag reorder,
// saved org-wide via /api/grid-prefs, applied only on Apply).
//
// Column def: { key, label, render(row), align?:'right', sortKey?, width?, lock?:true }
//   lock: cannot be hidden or reordered (actions/RowMenu column, primary link).
//
// Usage:
//   const { cols, chooser } = useGridColumns('wo.list', COLUMNS);
//   <ColumnChooser chooser={chooser} />           // in the toolbar
//   <DataTable cols={cols} rows={pageRows} ... /> // instead of hand-rolled <table>

import { orderCols } from './gridCols.js';
export { orderCols };

const prefCache = new Map(); // gridKey -> {order,hidden}; one GET per grid per session

export function useGridColumns(gridKey, columns) {
  const [prefs, setPrefs] = useState(prefCache.get(gridKey) || null);

  useEffect(() => {
    if (prefCache.has(gridKey)) { setPrefs(prefCache.get(gridKey)); return; }
    let on = true;
    axios.get(`/api/grid-prefs/${gridKey}`)
      .then(r => { prefCache.set(gridKey, r.data); if (on) setPrefs(r.data); })
      .catch(() => { }); // no prefs = code-order defaults
    return () => { on = false; };
  }, [gridKey]);

  const save = async (next) => {
    await axios.put(`/api/grid-prefs/${gridKey}`, next);
    prefCache.set(gridKey, next);
    setPrefs(next);
  };

  return { cols: orderCols(columns, prefs), chooser: { columns, prefs, save } };
}

export default function DataTable({ cols, rows, rowKey = 'id', onRowClick, rowStyle, sort, onSort }) {
  return (
    <table className="grid-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {cols.map(c => (
            <th
              key={c.key}
              onClick={c.sortKey && onSort ? () => onSort(c.sortKey) : undefined}
              style={{
                ...thStyle, textAlign: c.align === 'right' ? 'right' : 'left', width: c.width,
                cursor: c.sortKey && onSort ? 'pointer' : undefined, userSelect: 'none',
              }}
            >
              {c.label}
              {sort && c.sortKey === sort.key ? (sort.dir === 'desc' ? ' ▼' : ' ▲') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r[rowKey] ?? i}
            className={onRowClick ? 'list-row' : undefined}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            style={{ cursor: onRowClick ? 'pointer' : undefined, ...(rowStyle ? rowStyle(r) : null) }}
          >
            {cols.map(c => (
              <td key={c.key} style={{ ...cell, textAlign: c.align === 'right' ? 'right' : 'left' }}>
                {c.render ? c.render(r) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ColumnChooser({ chooser }) {
  const [pos, setPos] = useState(null);   // null = closed
  const [items, setItems] = useState([]); // staged [{key,label,visible,lock}]
  const [saving, setSaving] = useState(false);
  const dragFrom = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = e => { if (!ref.current?.contains(e.target)) setPos(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [pos]);

  const open = e => {
    if (pos) return setPos(null);
    const { columns, prefs } = chooser;
    const hidden = new Set(prefs?.hidden || []);
    const byKey = new Map(columns.map(c => [c.key, c]));
    const seen = new Set();
    const staged = [];
    for (const k of prefs?.order || []) {
      const c = byKey.get(k);
      if (c && !seen.has(k)) { staged.push(c); seen.add(k); }
    }
    for (const c of columns) if (!seen.has(c.key)) staged.push(c);
    setItems(staged.map(c => ({ key: c.key, label: c.label, lock: !!c.lock, visible: c.lock || !hidden.has(c.key) })));
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  const drop = to => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    setItems(list => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const apply = async () => {
    if (!items.some(i => i.visible)) return toast.error('Keep at least one column visible');
    setSaving(true);
    try {
      await chooser.save({ order: items.map(i => i.key), hidden: items.filter(i => !i.visible).map(i => i.key) });
      toast.success('Column layout saved for all users');
      setPos(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save layout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={ref} style={{ display: 'inline-flex' }}>
      <button
        title="Show / hide columns" onClick={open}
        style={{
          height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
        </svg>
        Columns
      </button>
      {pos && (
        <div style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000,
          width: 240, padding: 8, background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', padding: '2px 6px 6px' }}>
            SHOW / HIDE · DRAG TO REORDER
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {items.map((it, i) => (
              <div
                key={it.key}
                draggable={!it.lock}
                onDragStart={() => { dragFrom.current = i; }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => drop(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px',
                  fontSize: 13, color: 'var(--text-primary)', borderRadius: 'var(--radius-sm)',
                  cursor: it.lock ? 'default' : 'grab', background: 'none',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ color: 'var(--text-muted)', visibility: it.lock ? 'hidden' : 'visible', lineHeight: 1 }}>⠿</span>
                <input
                  type="checkbox" checked={it.visible} disabled={it.lock}
                  onChange={() => setItems(list => list.map(x => x.key === it.key ? { ...x, visible: !x.visible } : x))}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setPos(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', padding: '4px 8px' }}>
              Cancel
            </button>
            <button
              onClick={apply} disabled={saving}
              style={{
                border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer', fontSize: 13,
                fontWeight: 500, padding: '4px 14px', borderRadius: 'var(--radius-sm)', opacity: saving ? 0.6 : 1,
              }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
