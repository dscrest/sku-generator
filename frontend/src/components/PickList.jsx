import { useEffect, useRef, useState } from 'react';

// Typeahead pick list for a Books master (Manufacturer, CR-231): an input with
// a filtered option panel capped in height with its own scroll — a native
// <select> clamps its menu at the viewport bottom and a <datalist> popup can't
// be sized. Free text stays allowed (a stored off-master value is kept as is).
// The panel is position:fixed from the input's rect so overflow:hidden cards
// and scrolling drawers never clip it; it flips above when out of room below
// and closes on any scroll/resize (its anchor moved).
const PANEL_MAX = 200;

export default function PickList({ value, onChange, options, style, placeholder, inputProps = {} }) {
  const [rect, setRect] = useState(null); // open ⇔ rect set
  const wrapRef = useRef(null);
  const panelRef = useRef(null);

  const q = (value || '').trim().toLowerCase();
  const shown = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!rect) return;
    const close = () => setRect(null);
    const onDown = e => { if (!wrapRef.current?.contains(e.target)) close(); };
    // Page scroll moves the anchor → close; the panel's own scroll must not.
    const onScroll = e => { if (!panelRef.current?.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [rect]);

  const show = () => setRect(wrapRef.current?.getBoundingClientRect() || null);
  const up = rect && window.innerHeight - rect.bottom < PANEL_MAX + 12 && rect.top > PANEL_MAX + 12;

  return (
    <div ref={wrapRef} style={{ width: '100%' }}>
      <input
        {...inputProps}
        value={value ?? ''}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={show}
        onClick={show}
        onChange={e => { onChange(e.target.value); if (!rect) show(); }}
        onKeyDown={e => {
          if (e.key === 'Escape') setRect(null);
          if (e.key === 'Enter' && rect && shown.length) { e.preventDefault(); onChange(shown[0]); setRect(null); }
        }}
        style={style}
      />
      {rect && shown.length > 0 && (
        <div ref={panelRef} style={{
          position: 'fixed', zIndex: 60, left: rect.left, width: rect.width,
          ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          maxHeight: PANEL_MAX, overflowY: 'auto', padding: 4, boxSizing: 'border-box',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          {shown.map(o => (
            <button
              key={o}
              type="button"
              onMouseDown={e => e.preventDefault()} // keep the input's focus
              onClick={() => { onChange(o); setRect(null); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13,
                background: o === value ? 'var(--bg-secondary)' : 'none', border: 'none',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = o === value ? 'var(--bg-secondary)' : 'none'; }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
