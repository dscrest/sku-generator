import { useState, useEffect, useRef } from 'react';

// Per-row ⋮ menu (CR-101): always visible (the old hover-revealed pencil/trash
// was easy to miss on tall rows), opens a small Edit / Delete dropdown. Either
// action is optional. Replaces RowEditButton + RowDeleteButton on record grids.
// Menu is position:fixed so it never clips inside the grid's scroll container;
// it closes on any outside mousedown or scroll.
export default function RowMenu({ onEdit, onDuplicate, onDelete, editLabel = 'Edit', deleteLabel = 'Delete' }) {
  const [pos, setPos] = useState(null); // null = closed
  const ref = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const close = e => { if (!ref.current?.contains(e.target)) setPos(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true); };
  }, [pos]);

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '7px 12px', fontSize: 13, textAlign: 'left',
    border: 'none', background: 'none', cursor: 'pointer',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
  };

  return (
    <div ref={ref} style={{ display: 'inline-flex' }}>
      <button
        title="Actions"
        onClick={e => {
          e.stopPropagation();
          if (pos) return setPos(null);
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
        }}
        style={{
          width: 28, height: 28, flexShrink: 0,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', transition: 'all 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>
        </svg>
      </button>
      {pos && (
        <div style={{
          position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000,
          minWidth: 130, padding: 4, background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        }}>
          {onEdit && (
            <button style={itemStyle}
              onClick={e => { e.stopPropagation(); setPos(null); onEdit(); }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              {editLabel}
            </button>
          )}
          {onDuplicate && (
            <button style={itemStyle}
              onClick={e => { e.stopPropagation(); setPos(null); onDuplicate(); }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              Duplicate
            </button>
          )}
          {onDelete && (
            <button style={{ ...itemStyle, color: '#dc2626' }}
              onClick={e => { e.stopPropagation(); setPos(null); onDelete(); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              {deleteLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
