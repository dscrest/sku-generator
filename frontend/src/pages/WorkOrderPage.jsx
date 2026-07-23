import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import MaterialsGrid, { Empty, Banner } from '../components/MaterialsGrid.jsx';
import BomTab from '../components/BomTab.jsx';

/**
 * One work order, five tabs. Every tab uses the same Draft → Confirm rhythm, so
 * the module is learned once rather than five times.
 */
const TABS = ['Materials', 'BOM', 'Purchase', 'Approvals', 'History'];

const STATUS_TONE = {
  Draft: '#64748b', Approved: '#0369a1', MaterialAllocationPending: '#b45309',
  ReadyForProduction: '#0d9488', InProgress: '#2563eb', QualityCheck: '#7c3aed',
  Completed: '#15803d', Closed: '#334155', Cancelled: '#b91c1c',
};
const spaced = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2');

export default function WorkOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Materials');
  const [wo, setWo] = useState(null);
  const [blocked, setBlocked] = useState(null);

  function load() {
    axios.get(`/api/wo/${id}`)
      .then(({ data }) => setWo(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load the work order');
      });
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (blocked) return <AccessNotice kind={blocked} />;
  if (!wo) return <Empty>Loading work order…</Empty>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/wo')} style={btn}>‹ Work orders</button>
          <b style={{ fontSize: 15 }}>{wo.woNumber}</b>
          <StatusChip status={wo.status} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            SO {wo.salesOrderNumber} · {wo.customerName}{wo.projectName ? ` · ${wo.projectName}` : ''}
          </span>
          <div style={{ flex: 1 }} />
          <StatusActions wo={wo} onDone={load} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 2, padding: '0 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '9px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: tab === t ? 500 : 400,
            borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
          }}>
            {t}
            {t === 'Purchase' && wo.purchaseRequests?.some(p => p.status === 'Draft') && <Dot />}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'Materials' && <MaterialsGrid workOrderId={id} fgs={wo.fgs} onChanged={load} />}
        {tab === 'BOM' && <BomTab workOrderId={id} fgs={wo.fgs} revision={wo.revision} onChanged={load} />}
        {tab === 'Purchase' && <PurchaseTab workOrderId={id} wo={wo} onChanged={load} />}
        {tab === 'Approvals' && <ApprovalsTab workOrderId={id} wo={wo} onChanged={load} />}
        {tab === 'History' && <HistoryTab workOrderId={id} wo={wo} />}
      </div>
    </div>
  );
}

// ---- Purchase -------------------------------------------------------------

function PurchaseTab({ workOrderId, wo, onChanged }) {
  const [shortfall, setShortfall] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/shortfall`).then(({ data }) => setShortfall(data)).catch(() => setShortfall([]));
    axios.get('/api/wo/vendors').then(({ data }) => setVendors(data)).catch(() => {});
  }, [workOrderId]);

  async function raise() {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/purchase-request`, { lines: shortfall });
      toast.success(`${data.prNumber} created — pick a vendor per line, then confirm`);
      setShortfall([]);
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create the purchase request');
    } finally { setBusy(false); }
  }

  async function setLine(lineId, patch) {
    try {
      await axios.put(`/api/wo/pr-line/${lineId}`, patch);
      onChanged();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not update the line'); }
  }

  async function confirm(prId) {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/pr/${prId}/confirm`);
      data.purchaseOrders.forEach(p => toast.success(`PO ${p.poNumber} created for ${p.vendorName}`));
      (data.failed || []).forEach(f => toast.error(f, { duration: 7000 }));
      onChanged();
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not confirm']).forEach(m => toast.error(m, { duration: 6000 }));
    } finally { setBusy(false); }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      {shortfall === null ? <Empty>Checking for shortfalls…</Empty> : shortfall.length > 0 && (
        <div style={{ marginBottom: 18, border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 12 }}>
            <b style={{ fontSize: 13, color: '#b91c1c' }}>{shortfall.length} item(s) short</b>
            <span style={{ fontSize: 12, color: '#7f1d1d' }}>
              Quantities already on order are excluded, so nothing gets ordered twice.
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={raise} disabled={busy} style={{ ...btn, background: '#dc2626', color: '#fff', borderColor: '#dc2626', fontWeight: 600 }}>
              Raise purchase request
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Item', 'To purchase'].map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
            <tbody>
              {shortfall.map(l => (
                <tr key={l.rmItemId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={cell}>{l.rmName || l.rmItemId}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.purchaseQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!wo.purchaseRequests?.length ? (
        shortfall?.length === 0 && <Empty>Nothing is short on this work order — no purchase needed.</Empty>
      ) : wo.purchaseRequests.map(pr => (
        <div key={pr.id} style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-page)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ fontSize: 13 }}>{pr.prNumber}</b>
            <StatusChip status={pr.status} />
            <div style={{ flex: 1 }} />
            {pr.status === 'Draft' && (
              <button onClick={() => confirm(pr.id)} disabled={busy} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                Confirm → create draft POs
              </button>
            )}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Item', 'Vendor', 'Qty', 'PO', 'Received', 'Billed'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pr.lines.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={cell}>{l.rmName || l.rmItemId}</td>
                  <td style={cell}>
                    {l.poNumber ? (l.vendorName || '—') : (
                      <select
                        value={l.vendorId || ''}
                        onChange={e => {
                          const v = vendors.find(x => x.id === e.target.value);
                          setLine(l.id, { vendorId: v?.id || '', vendorName: v?.name || '' });
                        }}
                        style={{ ...select, maxWidth: 220, borderColor: l.vendorId ? 'var(--border)' : '#fca5a5' }}
                      >
                        <option value="">Pick a vendor…</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {l.poNumber ? <span style={{ fontFamily: 'var(--font-mono)' }}>{l.purchaseQty}</span> : (
                      <input
                        type="number" min="0" step="any" defaultValue={l.purchaseQty}
                        onBlur={e => Number(e.target.value) !== l.purchaseQty && setLine(l.id, { purchaseQty: Number(e.target.value) })}
                        style={{ width: 80, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                      />
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 12 }}>
                    {l.poNumber ? <><b>{l.poNumber}</b><div style={{ color: 'var(--text-muted)' }}>{l.poStatus}</div></> : '—'}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.receivedQty}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.billedQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ---- Approvals ------------------------------------------------------------

function ApprovalsTab({ workOrderId, wo, onChanged }) {
  const [gate, setGate] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/invoice-gate`).then(({ data }) => setGate(data)).catch(() => {});
  }, [workOrderId, wo.approvals]);

  async function act(level, status) {
    setBusy(true);
    try {
      await axios.post(`/api/wo/${workOrderId}/approve`, { level, status });
      toast.success(`Level ${level} ${status.toLowerCase()}`);
      onChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record the approval');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: '16px 20px', maxWidth: 640 }}>
      <Banner tone={gate?.allowed ? 'info' : 'warn'}>
        {gate?.allowed
          ? 'Both approvals are recorded — this work order can be invoiced.'
          : gate?.blockedReason || 'Invoice creation is blocked until both levels approve.'}
      </Banner>
      {[1, 2].map(level => {
        const a = wo.approvals?.find(x => x.level === level);
        return (
          <div key={level} style={{ marginTop: 12, padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontSize: 13 }}>Level {level} approval</b>
              {a && <StatusChip status={a.status} />}
              <div style={{ flex: 1 }} />
              <button onClick={() => act(level, 'Approved')} disabled={busy} style={{ ...btn, color: '#15803d' }}>Approve</button>
              <button onClick={() => act(level, 'Rejected')} disabled={busy} style={{ ...btn, color: '#b91c1c' }}>Reject</button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {a ? `${a.approverEmail || 'unknown'} · ${a.actedAt}` : level === 2 ? 'Level 1 must approve first.' : 'Not yet reviewed.'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- History --------------------------------------------------------------

function HistoryTab({ workOrderId, wo }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/history`).then(({ data }) => setLog(data)).catch(() => setLog([]));
  }, [workOrderId]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Material movements</h3>
      {!wo.transactions?.length ? <Empty>Nothing has moved yet.</Empty> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <thead>
            <tr>{['Document', 'Action', 'Status', 'Zoho Transfer Order', 'Lines', 'When'].map((h, i) => (
              <th key={h} style={{ ...thStyle, textAlign: i > 3 ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {wo.transactions.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.txnNumber}</td>
                <td style={{ ...cell, textTransform: 'capitalize' }}>{t.type}</td>
                <td style={cell}><StatusChip status={t.status} /></td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.transferOrderNumber || '—'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{t.lines.length}</td>
                <td style={{ ...cell, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{t.confirmedAt || t.createdAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Audit trail</h3>
      {!log ? <Empty>Loading…</Empty> : !log.length ? <Empty>Nothing recorded yet.</Empty> : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          {log.map((e, i) => (
            <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>{e.at}</span>
              <b style={{ minWidth: 170 }}>{e.action}</b>
              <span style={{ color: 'var(--text-muted)' }}>{e.entityType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- shared bits ----------------------------------------------------------

function StatusActions({ wo, onDone }) {
  const [busy, setBusy] = useState(false);
  if (!wo.nextStatuses?.length) return null;

  async function move(status) {
    // The QC gate is the one transition that needs an answer first.
    let qcStatus;
    if (status === 'Completed' && !wo.qcStatus) {
      qcStatus = window.confirm('Did the quality check pass?\n\nOK = Passed · Cancel = Rejected (sends the job back to production)')
        ? 'Passed' : 'Rejected';
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${wo.id}/status`, { status, qcStatus });
      toast.success(`Moved to ${spaced(data.status)}`);
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the status', { duration: 6000 });
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {wo.nextStatuses.map(s => (
        <button key={s} onClick={() => move(s)} disabled={busy} style={{
          ...btn, ...(s === 'Cancelled' ? { color: '#b91c1c' } : { background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' }),
        }}>
          {s === 'Cancelled' ? 'Cancel' : `→ ${spaced(s)}`}
        </button>
      ))}
    </div>
  );
}

export function StatusChip({ status }) {
  const tone = STATUS_TONE[status] || '#64748b';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
      color: tone, background: `${tone}18`, whiteSpace: 'nowrap',
    }}>
      {spaced(status)}
    </span>
  );
}

function Dot() {
  return <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 99, background: '#dc2626', marginLeft: 6, verticalAlign: 'middle' }} />;
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

const btn = {
  padding: '6px 11px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
const select = {
  padding: '5px 8px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
};
const thStyle = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const cell = { padding: '7px 12px', fontSize: 13 };
