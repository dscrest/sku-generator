import { useState } from 'react';
import { FilterSelect } from './GridFooter.jsx';
import { Empty } from './MaterialsGrid.jsx';

/**
 * Record details layout (CR-233, the Work Order page made reusable): a left
 * items panel (search + filters + cards) beside a header row (title · chips ·
 * actions), a tab strip and the tab body. Every record type in the app uses
 * this shape — see memory/record-page-pattern.
 */

// items: null = loading. filters: [{ label, value: (item) => string }].
export function RecordRail({ items, selectedId, onSelect, search, filters = [], card, width = 260, empty = 'Nothing here yet' }) {
  const [q, setQ] = useState('');
  const [fv, setFv] = useState([]); // one value per filter, '' = all
  const opts = (f) => [...new Set((items || []).map(f.value).filter(Boolean))].sort();
  const shown = (items || []).filter(it =>
    filters.every((f, i) => !fv[i] || f.value(it) === fv[i]) &&
    (!q || search(it).toLowerCase().includes(q.toLowerCase())));
  return (
    <div style={{ width, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)', padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" aria-label="Search records"
          style={{ padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
        {filters.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {filters.map((f, i) => (
              <FilterSelect key={f.label} label={f.label} value={fv[i] || ''} onChange={v => setFv(a => { const n = [...a]; n[i] = v; return n; })}
                options={opts(f)} style={{ flex: 1, minWidth: 0 }} />
            ))}
          </div>
        )}
      </div>
      {!items ? <Empty>Loading…</Empty> : shown.length === 0 ? <Empty>{empty}</Empty> : shown.map(it => {
        const active = String(it.id) === String(selectedId);
        return (
          <div
            key={it.id}
            onClick={() => !active && onSelect(it)}
            style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: active ? 'var(--blue-mid)' : 'transparent',
              borderLeft: active ? '3px solid var(--blue)' : '3px solid transparent',
            }}
          >
            {card(it)}
          </div>
        );
      })}
    </div>
  );
}

// Card helpers so every rail reads the same: bold first line + chip, muted second line.
export function RailCard({ title, chip, sub }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {chip}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub || '—'}</div>
    </>
  );
}

// tabs: [[key, label]]. `actions` = the page's buttons + <Menu trigger="More ▾"> + <CloseX>.
export default function RecordPage({ rail, title, chips, actions, tabs, tab, onTab, children }) {
  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {rail}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '40%' }}>{title}</b>
            {chips}
            <div style={{ flex: 1 }} />
            {actions}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, padding: '0 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => onTab(k)} style={{
              padding: '7px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
              color: tab === k ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: tab === k ? 500 : 400,
              borderBottom: tab === k ? '2px solid var(--blue)' : '2px solid transparent',
            }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
