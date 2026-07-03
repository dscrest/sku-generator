// Per-row edit button: pencil, hover-revealed via `.row-actions` (see
// index.css) — the explicit edit affordance on record grids (rows themselves
// are not clickable).
export default function RowEditButton({ onEdit, title = 'Edit' }) {
  return (
    <button
      className="row-actions"
      title={title}
      onClick={e => { e.stopPropagation(); onEdit(); }}
      style={{
        width: 28, height: 28, flexShrink: 0,
        border: '1px solid var(--border)', background: 'var(--bg-card)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-secondary)', transition: 'all 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-light)'; e.currentTarget.style.color = 'var(--blue)'; e.currentTarget.style.borderColor = 'var(--blue)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  );
}
