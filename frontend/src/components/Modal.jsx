import { useEffect } from 'react';

// Pass `onSubmit` to make Enter in any field trigger the primary action —
// the children render inside a <form> with a hidden submit button.
export default function Modal({ title, onClose, onSubmit, children, width = 480 }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 500,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-xl)',
          width, maxWidth: '95vw',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
          animation: 'modalIn 0.2s ease forwards',
        }}
      >
        <style>{`@keyframes modalIn { from { opacity:0; transform:translateY(20px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
        <div style={{
          padding: '20px 22px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28,
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        {onSubmit ? (
          <form
            onSubmit={e => { e.preventDefault(); onSubmit(); }}
            style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {children}
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
          </form>
        ) : (
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModalFooter({ children }) {
  return (
    <div style={{
      padding: '14px 22px',
      borderTop: '1px solid var(--border)',
      display: 'flex', gap: 8, justifyContent: 'flex-end',
      margin: '6px -22px -20px',
    }}>
      {children}
    </div>
  );
}

// One-question destructive confirm — replaces window.confirm so Esc/close
// always means "keep it", never a hidden second meaning.
export function ConfirmModal({ title, children, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} width={420}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{children}</div>
      <ModalFooter>
        <ModalBtn onClick={onClose}>Keep it</ModalBtn>
        <ModalBtn variant="primary" onClick={onConfirm}>{confirmLabel}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

export function ModalBtn({ onClick, variant = 'ghost', children, disabled }) {
  const base = {
    padding: '8px 16px', borderRadius: 'var(--radius-md)',
    fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font)', border: 'none',
    opacity: disabled ? 0.5 : 1, transition: 'all 0.12s',
  };
  const styles = {
    primary: { ...base, background: 'var(--blue)', color: '#fff' },
    ghost: { ...base, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-mid)' },
  };
  return <button type="button" onClick={onClick} disabled={disabled} style={styles[variant]}>{children}</button>;
}
