import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import MaterialsGrid, { Empty, Banner, ReceiptChip } from '../components/MaterialsGrid.jsx';
import WoItemsTab from '../components/WoItemsTab.jsx';
import PurchaseTab from '../components/PurchaseTab.jsx';
import Modal, { ModalFooter, ModalBtn, CloseX } from '../components/Modal.jsx';
import { FilterSelect, distinct } from '../components/GridFooter.jsx';
import { StatusChip, NextStage, ProcChip, DueDays, AccessNotice, can, spaced, btn, thStyle, cell, WO_PRIORITIES } from '../components/woCommon.jsx';
import { fmtDate, dueDays } from '../format.js';
import DateInput from '../components/DateInput.jsx';
import { combineIssued } from '../components/woIssueCopy.js';

/**
 * One work order, Zoho Books style (CR-018): compact list of work orders on
 * the left, detail on the right with a toolbar (Edit · Approve ▾ · status ·
 * ⋯) and per-order sub-tabs. BOM and Purchase live on their own sidebar
 * pages now — this page is the order itself.
 */
const TABS = ['Details', 'Item List', 'Purchase', 'Approvals', 'History'];

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
  const [printTxn, setPrintTxn] = useState(null); // material txn → issue slip print
  // Company block + warehouse names for printed documents (CR-122).
  const [printCfg, setPrintCfg] = useState(null);
  useEffect(() => {
    axios.get('/api/wo/settings').then(({ data }) => {
      const v = data.values || {};
      setPrintCfg({
        company: { name: v.companyName, address: v.companyAddress, gstin: v.companyGstin, logoUrl: v.companyLogoUrl },
        whNames: Object.fromEntries((data.warehouses || []).map(w => [String(w.id), w.name])),
      });
    }).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [qcPrompt, setQcPrompt] = useState(null); // pending status awaiting QC answer
  const [closeWarn, setCloseWarn] = useState(null); // 409 "unissued" payload from a Close attempt
  const [reopening, setReopening] = useState(false);
  const [holding, setHolding] = useState(false); // Hold reason modal (CR-160)
  const [datePrompt, setDatePrompt] = useState(null); // { status, field } — stage completion date needed
  // Rail filters (CR-112): client-side only, reset on leaving the page.
  const [railQ, setRailQ] = useState('');
  const [railStatus, setRailStatus] = useState('');
  const [railPri, setRailPri] = useState('');

  function load() {
    axios.get(`/api/wo/${id}`)
      .then(({ data }) => {
        setWo(data);
        // Keep the rail's status chip fresh without re-fetching the whole list
        // (which server-side scans the org's purchase history). Opening also
        // clears the unseen-progress dot (server stamps lastViewedAt).
        setList(l => l && l.map(w => (String(w.id) === String(data.id) ? { ...w, status: data.status, attention: false } : w)));
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
  // Forward status moves (Cancel, Hold and the one-step-back move get their own ⋯ entries).
  const back = wo?.prevStatuses || [];
  const forward = (wo?.nextStatuses || []).filter(s => s !== 'Cancelled' && s !== 'Hold' && !back.includes(s));

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

  // `extra` carries a Hold reason or the machining / fitting dates (CR-160, CR-170).
  async function changeStatus(status, qcStatus, force, extra) {
    // The QC gate is the one transition that needs an answer first.
    if (status === 'Completed' && !wo.qcStatus && !qcStatus) {
      setQcPrompt(status);
      return;
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${id}/status`, { status, qcStatus, force, ...extra });
      setHolding(false);
      setDatePrompt(null);
      toast.success(qcStatus === 'Rejected' ? 'Quality check recorded as Rejected' : `Moved to ${spaced(data.status)}`);
      // Completion / cancel sweeps leftover material back to Main (CR-031,
      // CR-160) — surface the Zoho Transfer Orders it created.
      if (data.transferOrders?.length) {
        toast.success(
          `Leftover material returned to Main: ${data.transferOrders.map(t => t.transferOrderNumber || t.txnNumber).join(', ')}`,
          { duration: 8000 },
        );
      }
      load();
    } catch (err) {
      const code = err.response?.data?.code;
      // Not everything issued yet — ask before closing (CR-080).
      if (err.response?.status === 409 && code === 'unissued') setCloseWarn(err.response.data);
      // Entering Ready for Machining / Fitting in Progress asks for dates (CR-170).
      else if (code === 'needDate') setDatePrompt({ status, fields: err.response.data.fields || [] });
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
    setPrintTxn(null); // only one print sheet may be mounted
    axios.get(`/api/wo/${id}/bom`)
      .then(({ data }) => {
        setPrintBom(data.lines);
        setTimeout(() => window.print(), 80);
      })
      .catch(() => toast.error('Could not load the BOM for printing'));
  }

  function printTxnSlip(t) {
    setPrintTxn(t);
    setTimeout(() => window.print(), 80);
  }

  // CR-190 — one combined copy of everything issued on this WO.
  function printIssueCopy() {
    const copy = combineIssued(wo.transactions);
    if (!copy.lines.length) { toast.error('Nothing issued on this work order yet'); return; }
    printTxnSlip(copy);
  }

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* Left rail: all work orders, click to switch */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-card)', padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            value={railQ} onChange={e => setRailQ(e.target.value)} placeholder="Search WO…"
            aria-label="Search work orders"
            style={{ padding: '5px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <FilterSelect label="SO Statuses" value={railStatus} onChange={setRailStatus} options={distinct(list || [], 'status')} style={{ flex: 1, minWidth: 0 }} />
            <FilterSelect label="Priorities" value={railPri} onChange={setRailPri} options={distinct(list || [], 'priority')} style={{ flex: 1, minWidth: 0 }} />
          </div>
        </div>
        {!list ? <Empty>Loading…</Empty> : list.filter(w =>
          (!railStatus || w.status === railStatus) &&
          (!railPri || w.priority === railPri) &&
          (!railQ || String(w.woNumber || '').toLowerCase().includes(railQ.toLowerCase())),
        ).map(w => (
          <div
            key={w.id}
            onClick={() => String(w.id) !== String(id) && navigate(`/wo/${w.id}`)}
            style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: String(w.id) === String(id) ? 'var(--blue-mid)' : 'transparent',
              borderLeft: String(w.id) === String(id) ? '3px solid var(--blue)' : '3px solid transparent',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {w.attention && <span title="New progress — a PO receipt landed since this was last opened" style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{w.woNumber}</span>
              <StatusChip status={w.status} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {/* Due date + days only — no customer (CR-171). */}
              {w.dueDate ? (
                <span style={{ color: dueDays(w.dueDate) !== null && dueDays(w.dueDate) < 4 ? '#dc2626' : undefined }}>
                  Due {fmtDate(w.dueDate)} · <DueDays date={w.dueDate} />
                </span>
              ) : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Right: the order */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!wo || String(wo.id) !== String(id) ? <Empty>Loading work order…</Empty> : (
          <>
            <div style={{ padding: '8px 20px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              {/* One row: title + chips · actions · ⋯ · ✕ (CR-156). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 6 }}>
                  <b style={{ fontSize: 15 }}>{wo.woNumber}</b>
                  {/* Status chips are display-only — status moves live in the ⋯ menu. */}
                  <StatusChip status={wo.status} />
                  {/* Where it goes next (CR-173): first forward move; Hold shows the resume target. */}
                  <NextStage next={forward[0]} />
                  <ProcChip status={wo.procStatus} />
                  {/* WO-level material receipt vs on-order qty (CR-120). */}
                  <ReceiptChip r={(wo.purchaseRequests || []).flatMap(pr => pr.lines || [])
                    .filter(l => l.poNumber)
                    .reduce((a, l) => ({ po: a.po + (Number(l.purchaseQty) || 0), received: a.received + (Number(l.receivedQty) || 0) }), { po: 0, received: 0 })} />
                </div>
                <div style={{ flex: 1 }} />
                {wo.status === 'Dispatched' && can(user, 'wo.action.close') && (
                  <button onClick={() => changeStatus('Closed')} disabled={busy} style={btn}>Close WO</button>
                )}
                {wo.status === 'Closed' && user?.isAdmin && (
                  <button onClick={() => setReopening(true)} disabled={busy} style={btn}>Reopen WO</button>
                )}
                {levels > 0 && can(user, 'wo.action.approve') && (allApproved ? (
                  <button onClick={() => setTab('Approvals')} style={btn}>
                    Approved
                  </button>
                ) : (
                  <button onClick={() => approve('Approved')} disabled={busy}
                    style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                    Approve
                  </button>
                ))}
                <button onClick={load} disabled={busy} title="Refresh — re-pulls SO fields and stock from Zoho Books" style={btn}>⟳</button>
                <button onClick={() => setEditing(true)} disabled={busy} style={btn}>✎ Edit</button>
                <Menu
                  trigger="⋯"
                  triggerStyle={{ ...btn, fontWeight: 700 }}
                  align="right"
                  items={[
                    // CR-178: plain text, no icons — direction is spelled out instead of arrows.
                    ...forward.map(s => ({ label: wo.status === 'Hold' ? `Resume (${spaced(s)})` : `Move to ${spaced(s)}`, onClick: () => changeStatus(s) })),
                    ...back.map(s => ({ label: `Back to ${spaced(s)}`, onClick: () => changeStatus(s) })),
                    ...(wo.nextStatuses?.includes('Hold') ? [{ label: 'Put on Hold', onClick: () => setHolding(true) }] : []),
                    ...(levels > 0 && !allApproved ? [{ label: `Reject — Level ${nextLevel}`, tone: '#b91c1c', onClick: () => approve('Rejected') }] : []),
                    ...(wo.nextStatuses?.includes('Cancelled') ? [{ label: 'Cancel Work Order', tone: '#b91c1c', onClick: () => changeStatus('Cancelled') }] : []),
                    { label: 'Print / PDF', onClick: printPdf },
                    { label: 'Print Material Issue Copy', onClick: printIssueCopy },
                    { label: 'Print Packing List', onClick: () => window.open(`/server/skuapi/packing?woId=${id}`, '_blank') },
                    {
                      label: 'Delete Work Order', tone: '#b91c1c',
                      disabled: !canDelete,
                      title: canDelete ? undefined : 'Only Draft or Cancelled work orders can be deleted',
                      onClick: () => setConfirmDelete(true),
                    },
                  ]}
                />
                <CloseX onClick={() => navigate('/wo')} title="Back to the list" />
              </div>
              {/* SO-derived header fields (CR-110, MSUN): re-synced from Books on every open. */}
              {/* 7 equal columns on a wide screen = 14 fields in two full rows; wraps to more rows below ~1200px. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(max(150px, calc((100% - 6 * 16px) / 7)), 1fr))', gap: '8px 16px', marginTop: 8, padding: '8px 14px', background: 'var(--blue-light)', border: '1px solid var(--blue-border)', borderRadius: 10 }}>
                {[
                  ['WO No', wo.woNumber],
                  ['WO Date', fmtDate(wo.woDate)],
                  ['SO No', wo.salesOrderNumber],
                  ['SO Date', fmtDate(wo.soDate)],
                  ['Customer', wo.customerName],
                  ['Expected Shipment', fmtDate(wo.shipmentDate)],
                  ['Buyer Order No', wo.buyerOrderNo || '—'],
                  ['Buyer Order Date', fmtDate(wo.buyerOrderDate)],
                  ['WO Due Date', <span style={{ color: dueDays(wo.dueDate) !== null && dueDays(wo.dueDate) < 4 ? '#dc2626' : undefined }}>{fmtDate(wo.dueDate)}</span>],
                  ['WO Due Days', <DueDays date={wo.dueDate} />],
                  ['Priority', wo.priority || '—'],
                  // Logistics CFs from the SO, TC flag and QC result (CR-161).
                  ['Freight Charge', wo.freightCharge || '—'],
                  ['Delivery', wo.delivery || '—'],
                  ['Booking', wo.booking || '—'],
                  ['Transporter', wo.transporter || '—'],
                  ['TC Required', wo.tcRequired || '—'],
                  ['QC Status', wo.qcStatus ? spaced(wo.qcStatus) : '—'],
                  // Stage dates, captured on entering Ready for Machining / Fitting in Progress (CR-170).
                  ...(wo.machiningDoneDate ? [['Machining Date', fmtDate(wo.machiningDoneDate)]] : []),
                  ...(wo.fittingDoneDate ? [['Fitting Date', fmtDate(wo.fittingDoneDate)]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue)' }}>{label}</div>
                    <div style={{ fontSize: 12.5, marginTop: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 2, padding: '0 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: '7px 14px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
                  color: tab === t ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent',
                }}>
                  {t}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>
              {tab === 'Details' && <MaterialsGrid workOrderId={id} fgs={wo.fgs} status={wo.status} onChanged={load} user={user} />}
              {tab === 'Item List' && <WoItemsTab workOrderId={id} fgs={wo.fgs} status={wo.status} onChanged={load} user={user} />}
              {tab === 'Purchase' && <PurchaseTab workOrderId={id} wo={wo} onChanged={load} user={user} />}
              {tab === 'Approvals' && <ApprovalsTab workOrderId={id} wo={wo} onChanged={load} />}
              {tab === 'History' && <HistoryTab workOrderId={id} wo={wo} onPrintTxn={printTxnSlip} />}
            </div>

            {editing && <EditModal wo={wo} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}

            {qcPrompt && (
              <Modal title="Quality check" onClose={() => setQcPrompt(null)} width={440}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Did the quality check pass? Rejecting records the result and keeps the work order at Ready For Dispatch. Not Applicable completes without a check.
                </div>
                <ModalFooter>
                  <ModalBtn onClick={() => setQcPrompt(null)}>Cancel</ModalBtn>
                  <ModalBtn disabled={busy} onClick={() => { const s = qcPrompt; setQcPrompt(null); changeStatus(s, 'NotApplicable'); }}>
                    Not Applicable
                  </ModalBtn>
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

            {reopening && (
              <ReasonModal
                title={`Reopen ${wo.woNumber}?`} blurb="The work order goes back to Dispatched. The reason is recorded in the audit trail."
                label="Reason for reopening" cta="Reopen work order" busyCta="Reopening…"
                busy={busy} onClose={() => setReopening(false)} onSubmit={reopen}
              />
            )}
            {holding && (
              <ReasonModal
                title={`Put ${wo.woNumber} on hold?`} blurb="Nothing moves while on hold — material stays in its warehouse. Resume returns the work order to its current status."
                label="Reason for the hold" cta="Put on hold" busyCta="Holding…"
                busy={busy} onClose={() => setHolding(false)} onSubmit={reason => changeStatus('Hold', undefined, false, { reason })}
              />
            )}
            {datePrompt && (
              <DateModal
                fields={datePrompt.fields} busy={busy} onClose={() => setDatePrompt(null)}
                onSubmit={values => changeStatus(datePrompt.status, undefined, false, values)}
              />
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

            {printTxn
              ? <IssueSlip wo={wo} txn={printTxn} company={printCfg?.company} whNames={printCfg?.whNames} />
              : <WoPrintSheet wo={wo} lines={printBom} company={printCfg?.company} />}
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

// ---- reason modal: reopen (admin only, CR-080) + hold (CR-160) ---------------

function ReasonModal({ title, blurb, label, cta, busyCta, busy, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const submit = () => reason.trim() && onSubmit(reason.trim());
  return (
    <Modal title={title} onClose={onClose} onSubmit={submit} width={460}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{blurb}</div>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', margin: '10px 0 4px' }}>{label}</label>
      <textarea
        value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus
        style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={busy || !reason.trim()} onClick={submit}>{busy ? busyCta : cta}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// Machining / Fitting dates asked on entering a stage (CR-170). `fields` comes
// from the server's needDate reply: [{ field, required, value }]. Required
// fields default to today, optional ones stay blank; blanks are not sent.
const DATE_LABEL = { machiningDoneDate: 'Machining Date', fittingDoneDate: 'Fitting Date' };
function DateModal({ fields, busy, onClose, onSubmit }) {
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(f => [f.field, f.value || (f.required ? today : '')])));
  const ok = fields.every(f => !f.required || values[f.field]);
  const submit = () => ok && onSubmit(Object.fromEntries(Object.entries(values).filter(([, v]) => v)));
  const title = fields.length > 1 ? 'Machining & Fitting Dates' : DATE_LABEL[fields[0]?.field] || 'Date';
  return (
    <Modal title={title} onClose={onClose} onSubmit={submit} width={400}>
      {fields.map(f => (
        <div key={f.field} style={{ marginTop: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
            {DATE_LABEL[f.field] || f.field}{f.required ? '' : ' (optional)'}
          </label>
          <DateInput value={values[f.field]} onChange={e => setValues(v => ({ ...v, [f.field]: e.target.value }))} style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }} />
        </div>
      ))}
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={busy || !ok} onClick={submit}>{busy ? 'Saving…' : 'Save and continue'}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// ---- edit ------------------------------------------------------------------

function EditModal({ wo, onClose, onSaved }) {
  // Due date is the SO's Expected Shipment (CR-159) — edit it in Books, not here.
  const [f, setF] = useState({ woDate: wo.woDate || '', notes: wo.notes || '', priority: wo.priority || '', tcRequired: wo.tcRequired || '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  const field = { width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' };
  const label = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', margin: '10px 0 4px' };

  async function save() {
    setBusy(true);
    try {
      await axios.put(`/api/wo/${wo.id}`, f);
      toast.success('Work order updated');
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the changes');
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit ${wo.woNumber}`} onClose={onClose} onSubmit={save} width={460}>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ ...label, marginTop: 0 }}>Date</label>
          <DateInput value={f.woDate} onChange={set('woDate')} style={field} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...label, marginTop: 0 }}>Priority</label>
          <select value={f.priority} onChange={set('priority')} style={field}>
            <option value=""></option>
            {WO_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ ...label, marginTop: 0 }}>TC Required</label>
          <select value={f.tcRequired} onChange={set('tcRequired')} style={field}>
            <option value=""></option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </div>
      </div>
      <label style={label}>Special Instruction</label>
      <textarea value={f.notes} onChange={set('notes')} rows={3} style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }} />
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// ---- print sheet (hidden on screen, the only thing visible in print) -------

// Company block from org settings (CR-122) — shared by every printed document.
function PrintHeader({ company }) {
  if (!company || (!company.name && !company.logoUrl)) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2px solid #000', paddingBottom: 8, marginBottom: 14 }}>
      {company.logoUrl && <img src={company.logoUrl} alt="" style={{ height: 44 }} />}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{company.name}</div>
        {company.address && <div style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{company.address}</div>}
        {company.gstin && <div style={{ fontSize: 11 }}>GSTIN: {company.gstin}</div>}
      </div>
    </div>
  );
}

function WoPrintSheet({ wo, lines, company }) {
  const th = { textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 8px', fontSize: 11 };
  const td = { borderBottom: '1px solid #ccc', padding: '4px 8px', fontSize: 12 };
  return (
    <div className="wo-print-sheet">
      <PrintHeader company={company} />
      <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>Work Order {wo.woNumber}</h1>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        {wo.woDate} · Status: {spaced(wo.status)} · SO {wo.salesOrderNumber} · {wo.customerName}
      </div>

      <h2 style={{ fontSize: 14, margin: '14px 0 6px' }}>Finished Goods</h2>
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

      {wo.notes && <div style={{ marginTop: 14, fontSize: 12 }}><b>Special Instruction:</b> {wo.notes}</div>}
    </div>
  );
}

// Printable slip for one material movement (Haresh item 18) — same hidden
// wo-print-sheet mechanics as WoPrintSheet, plain black-on-white like the
// estimate prints. Batch numbers ride in txn.notes.
function IssueSlip({ wo, txn, company, whNames }) {
  const th = { textAlign: 'left', borderBottom: '1px solid #000', padding: '4px 8px', fontSize: 11 };
  const td = { borderBottom: '1px solid #ccc', padding: '4px 8px', fontSize: 12 };
  const title = { issue: 'Material Issue Slip', return: 'Material Return Slip', reserve: 'Material Reservation Slip', issueCopy: 'Material Issue Copy', dereserve: 'Material De-reservation Slip' }[txn.type] || 'Material Movement Slip';
  const whName = id => (id && (whNames?.[String(id)] || id)) || null;
  // Per-line explicit picks (CR-121); old txns fall back to the notes blob below.
  const trackingText = t => (t
    ? (t.serials?.length ? t.serials.join(', ')
      : (t.batches || []).map(b => `${b.batch_number} × ${b.qty}`).join(', '))
    : '');
  const hasTracking = (txn.lines || []).some(l => trackingText(l.tracking));
  const hasReturned = (txn.lines || []).some(l => l.returned > 0); // issue copy only
  return (
    <div className="wo-print-sheet">
      <PrintHeader company={company} />
      <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{title}</h1>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        {txn.txnNumber} · {fmtDate(txn.confirmedAt || txn.createdAt)}
        {txn.transferOrderNumber ? ` · Transfer Order ${txn.transferOrderNumber}` : ''}
        {whName(txn.fromWarehouseId) && whName(txn.toWarehouseId)
          ? ` · ${whName(txn.fromWarehouseId)} → ${whName(txn.toWarehouseId)}` : ''}
      </div>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        Work Order {wo.woNumber} · SO {wo.salesOrderNumber} · {wo.customerName}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Material</th><th style={th}>SKU</th><th style={th}>UoM</th>
            {hasTracking && <th style={th}>Batch / Serial</th>}
            <th style={{ ...th, textAlign: 'right' }}>{hasReturned ? 'Issued' : 'Qty'}</th>
            {hasReturned && <th style={{ ...th, textAlign: 'right' }}>Returned</th>}
            {hasReturned && <th style={{ ...th, textAlign: 'right' }}>Net</th>}
          </tr>
        </thead>
        <tbody>
          {(txn.lines || []).map((l, i) => (
            <tr key={i}>
              <td style={td}>{l.name || l.rmItemId}</td>
              <td style={td}>{l.sku || '—'}</td>
              <td style={td}>{l.uom || '—'}</td>
              {hasTracking && <td style={{ ...td, fontSize: 11 }}>{trackingText(l.tracking) || '—'}</td>}
              <td style={{ ...td, textAlign: 'right' }}>{l.qty}</td>
              {hasReturned && <td style={{ ...td, textAlign: 'right' }}>{l.returned || '—'}</td>}
              {hasReturned && <td style={{ ...td, textAlign: 'right' }}>{+(l.qty - l.returned).toFixed(4)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {txn.notes && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <b>Batches / notes</b>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{txn.notes}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 40, marginTop: 48, fontSize: 12 }}>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 4 }}>Issued by (name, signature, date)</div>
        <div style={{ flex: 1, borderTop: '1px solid #000', paddingTop: 4 }}>Received by (name, signature, date)</div>
      </div>
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

// Raw ActivityLog codes → plain-language labels for the audit trail.
const ACTION_LABELS = {
  'txn.confirm.reserve': 'Material reserved',
  'txn.confirm.dereserve': 'Reservation released',
  'txn.confirm.issue': 'Material issued',
  'txn.confirm.return': 'Material returned',
  'txn.draft.reserve': 'Reserve draft created',
  'txn.draft.dereserve': 'Dereserve draft created',
  'txn.draft.issue': 'Issue draft created',
  'txn.draft.return': 'Return draft created',
  'txn.cancel': 'Movement cancelled',
  'wo.create': 'Work order created',
  'wo.update': 'Work order updated',
  'wo.delete': 'Work order deleted',
  'wo.status': 'Status changed',
  'wo.hold': 'Put on hold',
  'wo.resume': 'Resumed from hold',
  'wo.qc': 'Quality check recorded',
  'wo.reopen': 'Work order reopened',
  'bom.revise': 'BOM revised',
  'pr.create': 'Purchase request raised',
  'pr.line.add': 'Purchase request line added',
  'pr.delete': 'Purchase request deleted',
  'pr.line.delete': 'Purchase request line removed',
  'pr.confirm': 'Purchase request confirmed',
  'pr.raise': 'Purchase order raised',
  'pr.raise.fail': 'Purchase order raise failed',
  'po.delete': 'Purchase order deleted',
  'po.edit': 'Purchase order edited',
  'po.sync.deleted': 'Purchase order deleted in Books',
  'po.sync.cancelled': 'Purchase order voided in Books',
  'po.sync.lineRemoved': 'Purchase order line removed in Books',
  'po.sync.qtyChanged': 'Purchase order quantity changed in Books',
  'fg.assemble': 'Assembly created',
};
function friendlyAction(action = '') {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const m = action.match(/^approval\.l(\d+)\.(\w+)$/);
  if (m) return `Level ${m[1]} ${m[2].toLowerCase()}`;
  if (action.startsWith('po.')) return `Purchase order ${spaced(action.slice(3)).toLowerCase()}`;
  if (action.startsWith('webhook.')) return 'Zoho sync';
  return spaced(action.replace(/\./g, ' '));
}

function HistoryTab({ workOrderId, wo, onPrintTxn }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/history`).then(({ data }) => setLog(data)).catch(() => setLog([]));
  }, [workOrderId]);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Material movements</h3>
      {!wo.transactions?.length ? <Empty>Nothing has moved yet.</Empty> : (
        <table className="grid-table" style={{ width: '100%' }}>
          <thead>
            <tr>{['Document', 'Action', 'Status', 'Zoho Transfer Order', 'Lines', 'When', ''].map((h, i) => (
              <th key={h || 'x'} style={{ ...thStyle, textAlign: i > 3 ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {wo.transactions.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.txnNumber}</td>
                <td style={{ ...cell, textTransform: 'capitalize' }}>
                  {t.type}
                  {t.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'none', whiteSpace: 'pre-wrap' }}>{t.notes}</div>}
                </td>
                <td style={cell}><StatusChip status={t.status} /></td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.transferOrderNumber || '—'}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{t.lines.length}</td>
                <td style={{ ...cell, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(t.confirmedAt || t.createdAt)}</td>
                <td style={{ ...cell, textAlign: 'right', width: 40 }}>
                  {t.status === 'Confirmed' && (
                    <button onClick={() => onPrintTxn(t)} title="Print slip" style={{ ...btn, padding: '3px 8px' }}>🖨</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Purchase documents</h3>
      {!wo.purchaseRequests?.length ? <Empty>No purchase requests yet.</Empty> : (
        <table className="grid-table" style={{ width: '100%' }}>
          <thead>
            <tr>{['PR #', 'Status', 'Item', 'Vendor', 'PO #', 'Ordered', 'Received', 'Billed'].map((h, i) => (
              <th key={h} style={{ ...thStyle, textAlign: i > 4 ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {wo.purchaseRequests.flatMap(pr => (pr.lines || []).map((l, i) => (
              <tr key={`${pr.id}-${l.id || i}`} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{i === 0 ? pr.prNumber : ''}</td>
                <td style={cell}>{i === 0 ? <StatusChip status={pr.status} /> : ''}</td>
                <td style={cell}>{l.rmName || l.rmItemId}</td>
                <td style={cell}>{l.vendorName || '—'}</td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.poNumber || '—'}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.purchaseQty}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.receivedQty}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.billedQty}</td>
              </tr>
            )))}
          </tbody>
        </table>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Audit trail</h3>
      {!log ? <Empty>Loading…</Empty> : !log.length ? <Empty>Nothing recorded yet.</Empty> : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          {log.map((e, i) => (
            <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>{e.at}</span>
              <b style={{ minWidth: 200 }}>{friendlyAction(e.action)}</b>
              <span style={{ minWidth: 140 }}>{e.userName || 'System'}</span>
              <span style={{ color: 'var(--text-muted)' }}>{e.entityType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

