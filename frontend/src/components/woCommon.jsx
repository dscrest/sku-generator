// Shared Work Order bits: status chip, access notice and the small style
// constants every /wo page uses. Extracted from WorkOrderPage (CR-018).
import { dueDays } from '../format.js';

// Lifecycle (CR-160): Draft → [PendingApproval →] Approved → ReadyForMachining →
// MachiningInProgress → ReadyForFitting → FittingInProgress → ReadyForDispatch →
// Completed → Dispatched → Closed; Hold / Cancelled on the side.
export const STATUS_TONE = {
  Draft: '#64748b', PendingApproval: '#b45309', Approved: '#0369a1', Hold: '#b45309',
  ReadyForMachining: '#0369a1', MachiningInProgress: '#2563eb', ReadyForFitting: '#0d9488',
  FittingInProgress: '#2563eb', ReadyForDispatch: '#7c3aed',
  Completed: '#15803d', Dispatched: '#0f766e', Closed: '#334155', Cancelled: '#b91c1c',
};
export const spaced = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2');

// Procurement status (CR-023) — a dimension separate from the manufacturing
// status above, derived from a work order's purchase-request lines. Friendly
// labels since these show next to the manufacturing chip.
export const PROC_TONE = {
  Requested: '#64748b', PORaised: '#2563eb', PartiallyReceived: '#b45309', Fulfilled: '#15803d',
};
export const PROC_LABEL = {
  Requested: 'Requested', PORaised: 'PO Raised',
  PartiallyReceived: 'Partially received', Fulfilled: 'Received',
};

// Chips render a short code to keep grid columns narrow; full label on hover.
const STATUS_ABBREV = {
  Draft: 'DRF', PendingApproval: 'PAP', Approved: 'APR', Hold: 'HLD',
  ReadyForMachining: 'RFM', MachiningInProgress: 'MIP', ReadyForFitting: 'RFF',
  FittingInProgress: 'FIP', ReadyForDispatch: 'RFD',
  Completed: 'CMP', Dispatched: 'DSP', Closed: 'CLS', Cancelled: 'CXL',
};
const PROC_ABBREV = { Requested: 'REQ', PORaised: 'PO', PartiallyReceived: 'PRC', Fulfilled: 'RCV' };
// Fallback for statuses not in a map: initials of words, or first 3 letters.
export const abbr = (label) => {
  const words = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return (words.length > 1 ? words.map(w => w[0]).join('') : words[0].slice(0, 3)).toUpperCase();
};

// `ghost` (CR-173): dashed outline, no fill — a stage that is not yet reached.
function Chip({ tone, label, full, ghost }) {
  return (
    <span title={full} style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color: tone, whiteSpace: 'nowrap',
      ...(ghost ? { border: `1px dashed ${tone}`, opacity: 0.8, padding: '1px 8px' } : { background: `${tone}18` }),
    }}>
      {label}
    </span>
  );
}

export function StatusChip({ status, ghost }) {
  const full = spaced(status);
  return <Chip tone={STATUS_TONE[status] || '#64748b'} label={ghost ? full : STATUS_ABBREV[status] || abbr(full)} full={full} ghost={ghost} />;
}

// Current → next stage hint, arrow-connected to the status chip (CR-173).
// `next` = the first forward move from the API's nextStatuses; nothing on finals.
export function NextStage({ next }) {
  if (!next) return null;
  return (
    <span title="Next stage" style={{ display: 'inline-flex', alignItems: 'center', marginLeft: -4 }}>
      <span style={{ width: 14, height: 1, background: 'var(--text-muted)' }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: -3, marginRight: 4 }}>▶</span>
      <StatusChip status={next} ghost />
    </span>
  );
}

// Nothing requested yet → no chip (keeps the WO list quiet until a PR exists).
export function ProcChip({ status }) {
  if (!status) return null;
  const full = PROC_LABEL[status] || spaced(status);
  return <Chip tone={PROC_TONE[status] || '#64748b'} label={PROC_ABBREV[status] || abbr(full)} full={full} />;
}

// Zoho lowercase/underscore statuses (PO received/billed etc.).
const Z_TONE = {
  pending: '#b45309', partially_received: '#b45309', received: '#15803d',
  billed: '#15803d', partially_billed: '#b45309', closed: '#334155',
  cancelled: '#b91c1c', draft: '#64748b',
};
const Z_ABBREV = {
  pending: 'PND', partially_received: 'PRC', received: 'RCV', billed: 'BLD',
  partially_billed: 'PBL', closed: 'CLS', cancelled: 'CXL', draft: 'DRF',
};
export function ZStatusChip({ status }) {
  if (!status) return '—';
  const full = String(status).replace(/_/g, ' ');
  return <Chip tone={Z_TONE[status] || '#64748b'} label={Z_ABBREV[status] || abbr(full)} full={full} />;
}

// Action-level permission check (CR-125): user.perms comes from /auth/me —
// ['*'] = super-admin or an org with no roles configured (full access).
export const can = (user, key) => {
  const p = user?.perms ?? ['*'];
  return p.includes('*') || p.includes(key);
};

// WO priority options (CR-113) — shared by the Create and Edit modals.
export const WO_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// FG option label everywhere: "Name · Size × Qty" (Size from the Books item, CR-159).
export const fgLabel = f => `${f.name}${f.size ? ` · ${f.size}` : ''} × ${f.qty}`;

// Days until the WO due date (CR-110): red once overdue, — when no due date.
export function DueDays({ date }) {
  const d = dueDays(date);
  if (d === null) return '—';
  return (
    <span style={{ fontFamily: 'var(--font-mono)', color: d < 0 ? '#dc2626' : undefined, fontWeight: d < 0 ? 600 : 400 }}>
      {d < 0 ? `${-d} overdue` : d}
    </span>
  );
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
