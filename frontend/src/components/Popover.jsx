import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Anchored glass panel (CR-294): portalled + position:fixed so it escapes the
// sidebar's overflow (same reason as RowMenu, CR-277). Opens above the anchor,
// left edges aligned; flips below when there is no room. Closes on outside
// mousedown, any scroll, or Escape.
export default function Popover({ anchorRef, open, onClose, width, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    const r = anchorRef.current.getBoundingClientRect();
    const H = 320; // ponytail: approx panel height; flip-down only matters on very short windows
    const up = r.top > H || r.bottom + H > window.innerHeight;
    setPos({ left: r.left, width: width ?? r.width, ...(up ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) });
    const close = e => { if (!anchorRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) onClose(); };
    const key = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('scroll', close, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!open || !pos) return null;
  return createPortal(
    <div ref={panelRef} role="menu" className="glass-panel" style={{ position: 'fixed', zIndex: 1000, padding: 6, minWidth: 220, ...pos }}>
      {children}
    </div>,
    document.body,
  );
}
