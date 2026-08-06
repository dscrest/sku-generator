// Shared Work Order bits: status chip, access notice and the small style
// constants every /wo page uses. Extracted from WorkOrderPage (CR-018).

export const STATUS_TONE = {
  Draft: '#64748b', Approved: '#0369a1', MaterialAllocationPending: '#b45309',
  ReadyForProduction: '#0d9488', InProgress: '#2563eb', QualityCheck: '#7c3aed',
  Completed: '#15803d', Closed: '#334155', Cancelled: '#b91c1c',
};
export const spaced = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2');

// Procurement status (CR-023) — a dimension separate from the manufacturing
// status above, derived from a work order's purchase-request lines. Friendly
// labels since these show next to the manufacturing chip.
export const PROC_TONE = {
  Requested: '#64748b', PORaised: '#2563eb', PartiallyReceived: '#b45309', Fulfilled: '#15803d',
};
const PROC_LABEL = {
  Requested: 'Requested', PORaised: 'PO Raised',
  PartiallyReceived: 'Partially received', Fulfilled: 'Received',
};

function Chip({ tone, label }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color: tone, background: `${tone}18`, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export function StatusChip({ status }) {
  return <Chip tone={STATUS_TONE[status] || '#64748b'} label={spaced(status)} />;
}

// Nothing requested yet → no chip (keeps the WO list quiet until a PR exists).
export function ProcChip({ status }) {
  if (!status) return null;
  return <Chip tone={PROC_TONE[status] || '#64748b'} label={PROC_LABEL[status] || spaced(status)} />;
}

export function AccessNotice({ kind }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px' }}>
        {kind === 'reauth' ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Reconnect Zoho to enable Inventory access</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              The Work Order module reads warehouses, composite items and stock from Zoho Inventory. Your
              connection was authorized before that permission was added — reconnect once to grant it.
            </div>
            <a href="/server/skuapi/auth/zoho" style={{ display: 'inline-block', padding: '8px 16px', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 13, textDecoration: 'none' }}>
              Reconnect Zoho
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Work Order is not enabled</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              This add-on is not enabled for your organization. Contact OCTFIS to enable it.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// House report/list grid: header row + clickable body rows, numeric columns
// right-aligned and mono from index `rightFrom`. Shared by the Reports,
// Purchase and BOM pages (CR-019, moved from WorkOrderReportsPage).
export function Table({ head, rows, rightFrom }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <thead>
        <tr>{head.map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i >= rightFrom ? 'right' : 'left' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} onClick={r.onClick} className="list-row" style={{ borderBottom: '1px solid var(--border)', cursor: r.onClick ? 'pointer' : 'default' }}>
            {r.cells.map((c, i) => (
              <td key={i} style={{ padding: '8px 12px', fontSize: 13, textAlign: i >= rightFrom ? 'right' : 'left', fontFamily: i >= rightFrom ? 'var(--font-mono)' : 'inherit' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const btn = {
  padding: '6px 11px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
export const select = {
  padding: '5px 8px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
};
export const thStyle = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
export const cell = { padding: '7px 12px', fontSize: 13 };
