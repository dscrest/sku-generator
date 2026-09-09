// Small shared bits for the Recipe Engine pages (CR-104).

const STATUS_COLORS = {
  Published: ['#dcfce7', '#15803d'],
  Draft: ['#fef3c7', '#92400e'],
  Superseded: ['var(--bg-secondary)', 'var(--text-muted)'],
  Archived: ['var(--bg-secondary)', 'var(--text-muted)'],
  Quotation: ['#dbeafe', '#1d4ed8'],
  Order: ['#dcfce7', '#15803d'],
};

export function StatusPill({ status }) {
  const [bg, fg] = STATUS_COLORS[status] || ['var(--bg-secondary)', 'var(--text-muted)'];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 10, background: bg, color: fg, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
}

export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export function MetaCard({ k, v }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4, fontFamily: 'var(--font-mono)' }}>{v}</div>
    </div>
  );
}
