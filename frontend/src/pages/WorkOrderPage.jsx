import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import MaterialsGrid, { Empty, Banner } from '../components/MaterialsGrid.jsx';
import WoItemsTab from '../components/WoItemsTab.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import { StatusChip, ProcChip, AccessNotice, spaced, btn } from '../components/woCommon.jsx';
import { fmtMoney, fmtDate } from '../format.js';

/**
 * One work order (CR-049, Claude Design mockup): compact list of work orders
 * on the left, detail on the right — a bold header with every action beside
 * the title, then Materials (KPI band + instant per-line actions), Items and
 * a single Activity timeline. Approval actions live in the header; the
 * invoice gate surfaces as a banner instead of its own tab.
 */
const TABS = ['Materials', 'Items', 'Activity'];

export default function WorkOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Materials');
  const [wo, setWo] = useState(null);
  const [gate, setGate] = useState(null);
  const [list, setList] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [printBom, setPrintBom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qcPrompt, setQcPrompt] = useState(null); // pending status awaiting QC answer

  function load() {
    axios.get(`/api/wo/${id}`)
      .then(({ data }) => {
        setWo(data);
        // Keep the rail's status chip fresh without re-fetching the whole list
        // (which server-side scans the org's purchase history).
        setList(l => l && l.map(w => (String(w.id) === String(data.id) ? { ...w, status: data.status } : w)));
      })
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load the work order');
      });
  }
  useEffect(() => { setWo(null); load(); /* eslint-disable-next-line */ }, [id]);
  useEffect(() => { axios.get('/api/wo').then(({ data }) => setList(data)).catch(() => {}); }, []);
  // Invoice gate (was the Approvals tab) — now a header banner. Re-check when
  // the status moves, since approving is what unblocks it.
  useEffect(() => {
    setGate(null);
    axios.get(`/api/wo/${id}/invoice-gate`).then(({ data }) => setGate(data)).catch(() => {});
  }, [id, wo?.status]);

  if (blocked) return <AccessNotice kind={blocked} />;

  const approvalOf = lv => wo?.approvals?.find(a => a.level === lv)?.status;
  // Fully approved = the WO has advanced past the approval gate. Levels required
  // are settings-driven (2nd only when an L2 approver is set), so trust status.
  const fullyApproved = wo && !['Draft', 'PendingApproval', 'Cancelled'].includes(wo.status);
  const nextLevel = approvalOf(1) !== 'Approved' ? 1 : 2;
  const canDelete = wo && ['Draft', 'Cancelled'].includes(wo.status);
  // Forward status moves (Cancel lives in the ⋯ menu, not the status dropdown).
  const forward = (wo?.nextStatuses || []).filter(s => s !== 'Cancelled');

  async function approve(status) {
    setBusy(true);
    try {
      await axios.post(`/api/wo/${id}/approve`, { level: nextLevel, status });
      toast.success(`Level ${nextLevel} ${status.toLowerCase()}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record the approval');
    } finally { setBusy(false); }
  }

  async function changeStatus(status, qcStatus) {
    // The QC gate is the one transition that needs an answer first.
    if (status === 'Completed' && !wo.qcStatus && !qcStatus) {
      setQcPrompt(status);
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${id}/status`, { status, qcStatus });
      toast.success(`Moved to ${spaced(data.status)}`);
      // Completion sweeps leftover material back to Main (CR-031) — surface
      // the Zoho Transfer Orders it created.
      if (data.transferOrders?.length) {
        toast.success(
          `Leftover material returned to Main: ${data.transferOrders.map(t => t.transferOrderNumber || t.txnNumber).join(', ')}`,
          { duration: 8000 },
        );
      }
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the status', { duration: 6000 });
    } finally { setBusy(false); }
  }

  async function del() {
    setBusy(true);
    try {
      await axios.delete(`/api/wo/${id}`);
      toast.success(`${wo.woNumber} deleted`);
      navigate('/wo');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete the work order', { duration: 7000 });
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  function printPdf() {
    axios.get(`/api/wo/${id}/bom`)
      .then(({ data }) => {
        setPrintBom(data.lines);
        setTimeout(() => window.print(), 80);
      })
      .catch(() => toast.error('Could not load the BOM for printing'));
  }

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* Left rail: all work orders, click to switch */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)' }}>
        {!list ? <Empty>Loading…</Empty> : list.map(w => (
          <div
            key={w.id}
            onClick={() => String(w.id) !== String(id) && navigate(`/wo/${w.id}`)}
            style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: String(w.id) === String(id) ? 'var(--blue-light)' : 'transparent',
              borderLeft: String(w.id) === String(id) ? '3px solid var(--blue)' : '3px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{w.woNumber}</span>
              <StatusChip status={w.status} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {w.customerName} · {w.woDate}
            </div>
          </div>
        ))}
      </div>

      {/* Right: the order */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!wo || String(wo.id) !== String(id) ? <Empty>Loading work order…</Empty> : (
          <>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 20, fontWeight: 700 }}>{wo.woNumber}</b>
                    {forward.length ? (
                      <Menu
                        trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><StatusChip status={wo.status} /> ▾</span>}
                        triggerStyle={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        items={forward.map(s => ({ label: `→ ${spaced(s)}`, onClick: () => changeStatus(s) }))}
                      />
                    ) : <StatusChip status={wo.status} />}
                    <ProcChip status={wo.procStatus} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                    SO {wo.salesOrderNumber} · {wo.customerName}{wo.projectName ? ` · ${wo.projectName}` : ''} · {wo.woDate} · Rev {wo.revision}
                  </div>
                  {wo.fgs?.length > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {wo.fgs.map(f => `${f.name} × ${f.qty}`).join(' · ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => setEditing(true)} style={btn}>✎ Edit</button>
                  {fullyApproved ? (
                    <button style={{ ...btn, color: '#15803d', cursor: 'default' }} disabled>✓ Approved</button>
                  ) : (
                    <button onClick={() => approve('Approved')} disabled={busy}
                      style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                      {wo.status === 'PendingApproval' ? `Approve — Level ${nextLevel}` : 'Approve'}
                    </button>
                  )}
                  <Menu
                    trigger="⋯"
                    triggerStyle={{ ...btn, fontWeight: 700 }}
                    align="right"
                    items={[
                      ...(!fullyApproved ? [{ label: `✕ Reject — Level ${nextLevel}`, tone: '#b91c1c', onClick: () => approve('Rejected') }] : []),
                      ...(wo.nextStatuses?.includes('Cancelled') ? [{ label: 'Cancel work order', tone: '#b91c1c', onClick: () => changeStatus('Cancelled') }] : []),
                      { label: '🖨 Print / PDF', onClick: printPdf },
                      {
                        label: 'Delete work order', tone: '#b91c1c',
                        disabled: !canDelete,
                        title: canDelete ? undefined : 'Only Draft or Cancelled work orders can be deleted',
                        onClick: () => setConfirmDelete(true),
                      },
                    ]}
                  />
                  <button onClick={() => navigate('/wo')} title="Back to the list" style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {gate && !gate.allowed && (
              <Banner tone="warn">
                {gate.blockedReason || 'Invoice creation is blocked until this work order is approved.'}
              </Banner>
            )}

            <div style={{ display: 'flex', gap: 2, padding: '0 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '9px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === t ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
                }}>
                  {t}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {tab === 'Materials' && <MaterialsGrid workOrderId={id} fgs={wo.fgs} procStatus={wo.procStatus} onChanged={load} />}
              {tab === 'Items' && <WoItemsTab workOrderId={id} fgs={wo.fgs} status={wo.status} onChanged={load} />}
              {tab === 'Activity' && <ActivityTab workOrderId={id} wo={wo} />}
            </div>

            {editing && <EditModal wo={wo} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}

            {qcPrompt && (
              <Modal title="Quality check" onClose={() => setQcPrompt(null)} width={440}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Did the quality check pass? Rejecting sends the job back to production.
                </div>
                <ModalFooter>
                  <ModalBtn onClick={() => setQcPrompt(null)}>Cancel</ModalBtn>
                  <ModalBtn disabled={busy} onClick={() => { const s = qcPrompt; setQcPrompt(null); changeStatus(s, 'Rejected'); }}>
                    Rejected
                  </ModalBtn>
                  <ModalBtn variant="primary" disabled={busy} onClick={() => { const s = qcPrompt; setQcPrompt(null); changeStatus(s, 'Passed'); }}>
                    Passed
                  </ModalBtn>
                </ModalFooter>
              </Modal>
            )}

            {confirmDelete && (
              <Modal title={`Delete ${wo.woNumber}?`} onClose={() => setConfirmDelete(false)} width={440}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  The work order and its BOM, purchase requests and approvals are removed.
                  The audit trail is kept. This cannot be undone.
                </div>
                <ModalFooter>
                  <ModalBtn onClick={() => setConfirmDelete(false)}>Keep it</ModalBtn>
                  <ModalBtn variant="primary" disabled={busy} onClick={del}>Delete work order</ModalBtn>
                </ModalFooter>
              </Modal>
            )}

            <WoPrintSheet wo={wo} lines={printBom} />
          </>
        )}
      </div>
    </div>
  );
}

// ---- tiny dropdown (HeaderBar pattern: open state + click-away overlay) ----

function Menu({ trigger, triggerStyle, items, align = 'left' }) {
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
            boxShadow: '0 8px 24px rgba(0,0,0,.14)', minWidth: 200, padding: 4,
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

// ---- edit ------------------------------------------------------------------

function EditModal({ wo, onClose, onSaved }) {
  const [f, setF] = useState({
    projectName: wo.projectName || '', woDate: wo.woDate || '', notes: wo.notes || '',
    estimatedCost: wo.estimatedCost, actualCost: wo.actualCost,
  });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const field = { width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' };
  const label = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', margin: '10px 0 4px' };

  async function save() {
    setBusy(true);
    try {
      await axios.put(`/api/wo/${wo.id}`, { ...f, estimatedCost: Number(f.estimatedCost) || 0, actualCost: Number(f.actualCost) || 0 });
      toast.success('Work order updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the changes');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${wo.woNumber}`} onClose={onClose} onSubmit={save} width={460}>
      <label style={{ ...label, marginTop: 0 }}>Project name</label>
      <input value={f.projectName} onChange={set('projectName')} style={field} />
      <label style={label}>Date</label>
      <input type="date" value={f.woDate} onChange={set('woDate')} style={field} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Estimated cost</label>
          <input type="number" min="0" step="any" value={f.estimatedCost} onChange={set('estimatedCost')} style={field} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label}>Actual cost</label>
          <input type="number" min="0" step="any" value={f.actualCost} onChange={set('actualCost')} style={field} />
        </div>
      </div>
      <label style={label}>Notes</label>
      <textarea value={f.notes} onChange={set('notes')} rows={3} style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }} />
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// ---- print sheet (hidden on screen, the only thing visible in print) -------

function WoPrintSheet({ wo, lines }) {
  const th = { textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 8px', fontSize: 11 };
  const td = { borderBottom: '1px solid #ccc', padding: '4px 8px', fontSize: 12 };
  return (
    <div className="wo-print-sheet">
      <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>Work Order {wo.woNumber}</h1>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        {wo.woDate} · Status: {spaced(wo.status)} · SO {wo.salesOrderNumber} · {wo.customerName}
        {wo.projectName ? ` · ${wo.projectName}` : ''}
      </div>

      <h2 style={{ fontSize: 14, margin: '14px 0 6px' }}>Finished goods</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Item</th><th style={th}>SKU</th><th style={{ ...th, textAlign: 'right' }}>Qty</th></tr></thead>
        <tbody>
          {(wo.fgs || []).map(f => (
            <tr key={f.id}><td style={td}>{f.name}</td><td style={td}>{f.sku || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{f.qty}</td></tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, margin: '14px 0 6px' }}>Materials (BOM rev {wo.revision})</h2>
      {!lines ? <div style={{ fontSize: 12 }}>—</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>Material</th><th style={th}>SKU</th><th style={th}>UoM</th><th style={{ ...th, textAlign: 'right' }}>Required</th></tr></thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}><td style={td}>{l.rmName}</td><td style={td}>{l.rmSku || '—'}</td><td style={td}>{l.uom || '—'}</td><td style={{ ...td, textAlign: 'right' }}>{l.requiredQty}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 14, fontSize: 12 }}>
        <b>Estimated cost:</b> {fmtMoney(wo.estimatedCost)} &nbsp;·&nbsp; <b>Actual cost:</b> {fmtMoney(wo.actualCost)}
      </div>
      {wo.notes && <div style={{ marginTop: 8, fontSize: 12 }}><b>Notes:</b> {wo.notes}</div>}
    </div>
  );
}

// ---- Activity (CR-050) -----------------------------------------------------
// In/out movement ledger: every material transaction is a card — direction
// icon (↗ out of stock, ↙ back in), colored edge, txn number, warehouse route,
// item lines with quantities. Audit-trail events stay in the same newest-first
// stream as slim dot rows between the cards.
// ponytail: no "by user" line — MaterialTxn.confirmedBy is a raw Catalyst
// userId; add it when a userId → email map exists. No filter tabs — the list
// is short; add when WOs accumulate hundreds of txns.

const TXN_CARD = {
  reserve: { verb: 'Reserved', dir: 'out', route: 'Main → Reserve' },
  issue: { verb: 'Issued', dir: 'out', route: 'Reserve → Issue' },
  dereserve: { verb: 'Released', dir: 'in', route: 'Reserve → Main' },
  return: { verb: 'Returned', dir: 'in', route: 'Issue → Main' },
};
const DIR = {
  out: { arrow: '↗', tone: '#2563eb' },
  in: { arrow: '↙', tone: '#15803d' },
};

function ActivityTab({ workOrderId, wo }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/history`).then(({ data }) => setLog(data)).catch(() => setLog([]));
  }, [workOrderId]);

  const events = useMemo(() => {
    const ts = v => { const t = Date.parse(v); return Number.isNaN(t) ? 0 : t; };
    const txns = (wo.transactions || []).map(t => ({
      key: `txn-${t.id}`, kind: 'txn', sort: ts(t.confirmedAt || t.createdAt), txn: t,
    }));
    const audit = (log || []).map((e, i) => ({
      key: `log-${i}`, kind: 'audit', sort: ts(e.at), when: e.at, text: e.action, sub: e.entityType,
    }));
    return [...txns, ...audit].sort((a, b) => b.sort - a.sort);
  }, [wo.transactions, log]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      {!log ? <Empty>Loading…</Empty> : !events.length ? <Empty>No activity yet.</Empty> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map(e => e.kind === 'txn' ? <TxnCard key={e.key} t={e.txn} /> : (
            <div key={e.key} style={{ display: 'flex', gap: 12, padding: '2px 6px 2px 44px', fontSize: 12, alignItems: 'flex-start', color: 'var(--text-secondary)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-mid)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                {e.text}
                {e.sub && <span style={{ color: 'var(--text-muted)' }}> · {e.sub}</span>}
              </div>
              <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{e.when}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TxnCard({ t }) {
  const meta = TXN_CARD[t.type] || { verb: t.type, dir: 'out', route: '' };
  const { arrow, tone } = DIR[meta.dir];
  const dead = t.status === 'Cancelled';
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', opacity: dead ? 0.55 : 1 }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, marginTop: 4,
        background: `${tone}18`, color: tone, border: `1px solid ${tone}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
      }}>
        {arrow}
      </div>
      <div style={{
        flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderLeft: `3px solid ${tone}`, borderRadius: 'var(--radius-md)', padding: '10px 14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: tone }}>{meta.verb}</span>
          <b style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{t.txnNumber}</b>
          {meta.route && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {meta.route}
            </span>
          )}
          {t.status !== 'Confirmed' && <StatusChip status={t.status} />}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(t.confirmedAt || t.createdAt)}</span>
        </div>
        {t.transferOrderNumber && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            Transfer Order <span style={{ fontFamily: 'var(--font-mono)' }}>{t.transferOrderNumber}</span>
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          {t.lines.map(l => (
            <div key={l.rmItemId} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '3px 0', fontSize: 13 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.name || l.rmItemId}
                {l.sku && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}> · {l.sku}</span>}
              </span>
              <span style={{ flex: 1, borderBottom: '1px dotted var(--border)' }} />
              <b style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{Number(l.qty).toLocaleString()}{l.uom ? ` ${l.uom}` : ''}</b>
            </div>
          ))}
        </div>
        {t.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.notes}</div>}
      </div>
    </div>
  );
}

