import { useState } from 'react';

// Header dropdown (⋯ / "More ▾"): plain-text entries [{ label, onClick, tone?, disabled?, title? }].
// Lifted from WorkOrderPage (CR-230) so the Product Design details page can share it.
export default function Menu({ trigger, triggerStyle, items, align = 'left' }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={triggerStyle}>{trigger}</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: '100%', [align === 'right' ? 'right' : 'left']: 0, marginTop: 4, zIndex: 41,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)', minWidth: 200, padding: 4,
          }}>
            {items.map(it => (
              <button
                key={it.label}
                disabled={it.disabled}
                title={it.title}
                onClick={() => { setOpen(false); it.onClick(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13,
                  background: 'none', border: 'none', borderRadius: 'var(--radius-sm)',
                  cursor: it.disabled ? 'default' : 'pointer',
                  color: it.tone || 'inherit', opacity: it.disabled ? 0.45 : 1, whiteSpace: 'nowrap',
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
