// Per-row delete button: red trash, hover-revealed via the parent row's
// `.row-actions` wrapper (see index.css). Same danger style + confirm flow as
// the toolbar delete it replaces. Stops propagation so it never triggers the
// row's click-to-edit.
export default function RowDeleteButton({ onDelete, title = 'Delete' }) {
  return (
    <button
      className="row-actions"
      title={title}
      onClick={e => { e.stopPropagation(); onDelete(); }}
      style={{
        width: 28, height: 28, flexShrink: 0,
        border: '1px solid var(--border)', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', transition: 'all 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fca5a5'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
      </svg>
    </button>
  );
}
