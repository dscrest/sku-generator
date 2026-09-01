import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import MaterialsGrid, { Empty, Banner } from '../components/MaterialsGrid.jsx';
import WoItemsTab from '../components/WoItemsTab.jsx';
import PurchaseTab from '../components/PurchaseTab.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import { StatusChip, ProcChip, AccessNotice, spaced, btn, thStyle, cell } from '../components/woCommon.jsx';
import { fmtMoney, fmtDate } from '../format.js';

/**
 * One work order, Zoho Books style (CR-018): compact list of work orders on
 * the left, detail on the right with a toolbar (Edit · Approve ▾ · status ·
 * ⋯) and per-order sub-tabs. BOM and Purchase live on their own sidebar
 * pages now — this page is the order itself.
 */
const TABS = ['Details', 'Items', 'Purchase', 'Approvals', 'History'];

export default function WorkOrderPage({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Details');
  const [wo, setWo] = useState(null);
  const [list, setList] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [printBom, setPrintBom] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qcPrompt, setQcPrompt] = useState(null); // pending status awaiting QC answer
  const [closeWarn, setCloseWarn] = useState(null); // 409 "unissued" payload from a Close attempt
  const [reopening, setReopening] = useState(false);

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

  if (blocked) return <AccessNotice kind={blocked} />;

  const approvalOf = lv => wo?.approvals?.find(a => a.level === lv)?.status;
  const levels = wo?.requiredApprovalLevels ?? 0; // 0 = approvals disabled in settings
  const allApproved = levels > 0 && [1, 2].slice(0, levels).every(lv => approvalOf(lv) === 'Approved');
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

  async function changeStatus(status, qcStatus, force) {
    // The QC gate is the one transition that needs an answer first.
    if (status === 'Completed' && !wo.qcStatus && !qcStatus) {
      setQcPrompt(status);
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${id}/status`, { status, qcStatus, force });
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
      // Not everything issued yet — ask before closing (CR-080).
      if (err.response?.status === 409 && err.response.data?.code === 'unissued') setCloseWarn(err.response.data);
      else toast.error(err.response?.data?.error || 'Could not change the status', { duration: 6000 });
    } finally { setBusy(false); }
  }

  async function reopen(reason) {
    setBusy(true);
    try {
      await axios.post(`/api/wo/${id}/reopen`, { reason });
      toast.success(`${wo.woNumber} reopened`);
      setReopening(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not reopen the work order', { duration: 6000 });
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
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: 15 }}>{wo.woNumber}</b>
                    {forward.length ? (
                      <Menu
                        trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><StatusChip status={wo.status} /> ▾</span>}
                        triggerStyle={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                        items={forward.map(s => ({ label: `→ ${spaced(s)}`, onClick: () => changeStatus(s) }))}
                      />
                    ) : <StatusChip status={wo.status} />}
                    <ProcChip status={wo.procStatus} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                    SO {wo.salesOrderNumber} · {wo.customerName}{wo.projectName ? ` · ${wo.projectName}` : ''}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => navigate('/wo')} title="Back to the list" style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }} />
                <button onClick={() => setEditing(true)} style={btn}>✎ Edit</button>
                {wo.status === 'Completed' && (
                  <button onClick={() => changeStatus('Closed')} disabled={busy} style={btn}>Close WO</button>
                )}
                {wo.status === 'Closed' && user?.isAdmin && (
                  <button onClick={() => setReopening(true)} disabled={busy} style={btn}>Reopen WO</button>
                )}
                {levels > 0 && (allApproved ? (
                  <button onClick={() => setTab('Approvals')} style={btn}>
                    Approved
                  </button>
                ) : (
                  <button onClick={() => approve('Approved')} disabled={busy}
                    style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                    Approve
                  </button>
                ))}
                <Menu
                  trigger="⋯"
                  triggerStyle={{ ...btn, fontWeight: 700 }}
                  align="right"
                  items={[
                    ...(levels > 0 && !allApproved ? [{ label: `✕ Reject — Level ${nextLevel}`, tone: '#b91c1c', onClick: () => approve('Rejected') }] : []),
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
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {tab === 'Details' && <MaterialsGrid workOrderId={id} fgs={wo.fgs} onChanged={load} />}
              {tab === 'Items' && <WoItemsTab workOrderId={id} fgs={wo.fgs} status={wo.status} onChanged={load} />}
              {tab === 'Purchase' && <PurchaseTab workOrderId={id} wo={wo} onChanged={load} />}
              {tab === 'Approvals' && <ApprovalsTab workOrderId={id} wo={wo} onChanged={load} />}
              {tab === 'History' && <HistoryTab workOrderId={id} wo={wo} />}
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

            {closeWarn && (
              <Modal title={`Close ${wo.woNumber}?`} onClose={() => setCloseWarn(null)} width={460}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {closeWarn.items.length} item{closeWarn.items.length === 1 ? ' is' : 's are'} not fully issued.
                  Closing assumes manufacturing is finished.
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                  <thead>
                    <tr>{['Item', 'Required', 'Issued'].map((h, i) => (
                      <th key={h} style={{ ...thStyle, textAlign: i ? 'right' : 'left' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {closeWarn.items.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={cell}>{r.name || r.sku}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{r.required}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{r.issued}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ModalFooter>
                  <ModalBtn onClick={() => setCloseWarn(null)}>Keep it open</ModalBtn>
                  <ModalBtn variant="primary" disabled={busy} onClick={() => { setCloseWarn(null); changeStatus('Closed', undefined, true); }}>
                    Close anyway
                  </ModalBtn>
                </ModalFooter>
              </Modal>
            )}

            {reopening && <ReopenModal wo={wo} busy={busy} onClose={() => setReopening(false)} onReopen={reopen} />}

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

// ---- reopen (admin only, CR-080) ------------------------------------------

function ReopenModal({ wo, busy, onClose, onReopen }) {
  const [reason, setReason] = useState('');
  const submit = () => reason.trim() && onReopen(reason.trim());
  return (
    <Modal title={`Reopen ${wo.woNumber}?`} onClose={onClose} onSubmit={submit} width={460}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        The work order goes back to Completed. The reason is recorded in the audit trail.
      </div>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', margin: '10px 0 4px' }}>
        Reason for reopening
      </label>
      <textarea
        value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
        style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={busy || !reason.trim()} onClick={submit}>
          {busy ? 'Reopening…' : 'Reopen work order'}
        </ModalBtn>
      </ModalFooter>
    </Modal>
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

  const levels = wo.requiredApprovalLevels ?? 0;
  if (levels === 0) {
    return (
      <div style={{ padding: '16px 20px', maxWidth: 640 }}>
        <Banner tone="info">Approvals are disabled in settings — this work order needs no approval.</Banner>
      </div>
    );
  }
  return (
    <div style={{ padding: '16px 20px', maxWidth: 640 }}>
      <Banner tone={gate?.allowed ? 'info' : 'warn'}>
        {gate?.allowed
          ? 'All required approvals are recorded — this work order can be invoiced.'
          : gate?.blockedReason || 'Invoice creation is blocked until every configured level approves.'}
      </Banner>
      {[1, 2].slice(0, levels).map(level => {
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
                <td style={{ ...cell, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(t.confirmedAt || t.createdAt)}</td>
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

