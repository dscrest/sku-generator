import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// Catalog-wide search: SKU items (server-side LIKE on sku + name) and properties
// (client-side over the org's property list, which is one small request).
// Lives in the SKU tab bar; ⌘K opens it from any SKU page.
const CAP = 6;

const mono = "'JetBrains Mono', ui-monospace, monospace";

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState([]);
  const [properties, setProperties] = useState(null); // null = not fetched yet
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(v => !v); }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Property list is small and rarely changes — pull it once, on first open.
  useEffect(() => {
    if (!open || properties !== null) return;
    axios.get('/api/properties').then(({ data }) => setProperties(data)).catch(() => setProperties([]));
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) { setItems([]); return; }
    let stale = false;
    axios.post('/api/sku-items/search', { q: debounced })
      .then(({ data }) => { if (!stale) setItems(data.slice(0, CAP)); })
      .catch(() => { if (!stale) setItems([]); });
    return () => { stale = true; };
  }, [debounced]);

  const needle = debounced.toLowerCase();
  const propHits = needle
    ? (properties || []).filter(p =>
        [p.name, p.caption, p.industryName].some(v => v && v.toLowerCase().includes(needle))
      ).slice(0, CAP)
    : [];

  function go(path) {
    setOpen(false);
    setQ('');
    navigate(path);
  }

  const rowStyle = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13.5,
  };
  const groupStyle = {
    fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
    letterSpacing: '0.06em', padding: '8px 10px 6px',
  };
  const hover = on => e => { e.currentTarget.style.background = on ? 'var(--bg-secondary)' : 'transparent'; };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, alignSelf: 'center',
          marginLeft: 'auto', padding: '5px 11px', borderRadius: 'var(--radius-md)',
          fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
          background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
          border: '1px solid var(--border)', fontFamily: 'var(--font)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
        </svg>
        Search
        <span style={{ fontFamily: mono, fontSize: 10, opacity: 0.6, padding: '1px 5px', border: '1px solid var(--border)', borderRadius: 3, lineHeight: 1 }}>⌘K</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            zIndex: 200, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: '12vh',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 560, maxWidth: '90vw', background: 'var(--bg-card)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search items, SKU codes, properties…"
                style={{ flex: 1, border: 'none', outline: 'none', fontFamily: 'var(--font)', fontSize: 14.5, color: 'var(--text-primary)', background: 'transparent' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>esc</span>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
              {!debounced && (
                <div style={{ padding: '18px 10px', fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Type to search SKU items and properties across the catalog.
                </div>
              )}

              {debounced && items.length === 0 && propHits.length === 0 && (
                <div style={{ padding: '18px 10px', fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center' }}>
                  No matches for “{debounced}”.
                </div>
              )}

              {items.length > 0 && <div style={groupStyle}>SKU Items</div>}
              {items.map(item => (
                <div key={item.id} style={rowStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                  onClick={() => go(`/sku/items?q=${encodeURIComponent(item.sku)}`)}>
                  <span style={{ fontFamily: mono, fontSize: 11.5, color: 'var(--blue)', minWidth: 90, flexShrink: 0 }}>{item.sku}</span>
                  <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                </div>
              ))}

              {propHits.length > 0 && <div style={{ ...groupStyle, marginTop: items.length ? 4 : 0 }}>Properties</div>}
              {propHits.map(p => (
                <div key={p.id} style={rowStyle} onMouseEnter={hover(true)} onMouseLeave={hover(false)}
                  onClick={() => go(`/sku/industries/${p.industryId}/properties`)}>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.caption}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>{p.industryName || '—'}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-muted)' }}>
              {[['↵', 'open'], ['esc', 'close']].map(([k, l]) => (
                <span key={k}>
                  <kbd style={{ fontFamily: mono, padding: '1px 4px', border: '1px solid var(--border)', borderRadius: 3 }}>{k}</kbd>
                  {' '}{l}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
