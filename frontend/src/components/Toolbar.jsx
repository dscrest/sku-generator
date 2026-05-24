const tbtn = {
  width: 30, height: 30,
  border: '1px solid var(--border)',
  background: 'var(--bg-card)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)',
  transition: 'all 0.1s',
  flexShrink: 0,
};

function Btn({ onClick, disabled, title, danger, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...tbtn,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={e => {
        if (disabled) return;
        e.currentTarget.style.background = danger ? '#fee2e2' : 'var(--border)';
        e.currentTarget.style.color = danger ? '#dc2626' : 'var(--text-primary)';
        if (danger) e.currentTarget.style.borderColor = '#fca5a5';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--bg-card)';
        e.currentTarget.style.color = 'var(--text-secondary)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      {children}
    </button>
  );
}

export default function Toolbar({ onAdd, onEdit, onClone, onDelete, onRefresh, selectedCount = 0, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '10px 18px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)',
    }}>
      {onAdd && (
        <Btn onClick={onAdd} title="Add">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </Btn>
      )}
      {onEdit && (
        <Btn onClick={onEdit} disabled={selectedCount !== 1} title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
          </svg>
        </Btn>
      )}
      {onClone && (
        <Btn onClick={onClone} disabled={selectedCount !== 1} title="Clone">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
        </Btn>
      )}
      {onDelete && (
        <Btn onClick={onDelete} disabled={selectedCount === 0} title="Delete" danger>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
          </svg>
        </Btn>
      )}
      {(onAdd || onEdit || onDelete || onClone) && onRefresh && (
        <div style={{ width: 1, height: 18, background: 'var(--border-mid)', margin: '0 2px' }} />
      )}
      {onRefresh && (
        <Btn onClick={onRefresh} title="Refresh">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23,4 23,10 17,10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
        </Btn>
      )}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
