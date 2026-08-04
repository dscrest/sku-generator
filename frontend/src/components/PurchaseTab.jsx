import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Empty, Banner } from './MaterialsGrid.jsx';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';
import { StatusChip, btn, select, thStyle, cell } from './woCommon.jsx';

// The Purchase workflow of one work order: shortfall → purchase request →
// vendor per line → confirm → draft POs in Zoho Books. Moved verbatim from
// WorkOrderPage (CR-018) so the global /wo/purchase page can reuse it.
export default function PurchaseTab({ workOrderId, wo, onChanged }) {
  const [shortfall, setShortfall] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [vendorErr, setVendorErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);

  function loadVendors() {
    setVendorErr(null);
    return axios.get('/api/wo/vendors')
      .then(({ data }) => setVendors(data))
      .catch(err => setVendorErr(err.response?.data?.message || err.response?.data?.error || 'Could not load vendors'));
  }

  useEffect(() => {
    axios.get(`/api/wo/${workOrderId}/shortfall`).then(({ data }) => setShortfall(data)).catch(() => setShortfall([]));
    loadVendors();
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

  // Unique POs of this work order, derived from the PR lines already loaded.
  const pos = [];
  {
    const seen = new Set();
    for (const pr of wo.purchaseRequests || []) for (const l of pr.lines || []) {
      if (l.poId && !seen.has(l.poId)) {
        seen.add(l.poId);
        pos.push({ id: l.poId, number: l.poNumber, status: l.poStatus, vendorName: l.vendorName, prNumber: pr.prNumber });
      }
    }
  }

  if (selectedPo) {
    return (
      <PoSplit
        pos={pos}
        selectedPo={selectedPo}
        onSelect={setSelectedPo}
        onClose={() => setSelectedPo(null)}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      {shortfall === null ? <Empty>Checking for shortfalls…</Empty> : shortfall.length > 0 && (
        <div style={{ marginBottom: 18, border: '1px solid #fecaca', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 12 }}>
            <b style={{ fontSize: 13, color: '#b91c1c' }}>{shortfall.length} item(s) short</b>
            <span style={{ fontSize: 12, color: '#7f1d1d' }}>
              Quantities already on order or on a draft purchase request are excluded, so nothing gets ordered twice.
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
                  <td style={cell}>
                    {l.rmName || l.rmItemId}
                    {l.prHint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.prHint}</div>}
                  </td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.purchaseQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vendorErr && wo.purchaseRequests?.some(pr => pr.status === 'Draft') && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="warn">Vendor list failed to load: {vendorErr}. Press ⟳ next to a vendor field to retry.</Banner>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                        <button onClick={loadVendors} title="Refresh vendors from Zoho Books — use after adding a vendor there" style={btn}>⟳</button>
                      </span>
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
                    {l.poNumber ? (
                      <>
                        <button
                          onClick={() => setSelectedPo(l.poId)}
                          title="Open purchase order"
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--blue)', fontWeight: 700, fontSize: 12 }}
                        >
                          {l.poNumber}
                        </button>
                        <div style={{ color: 'var(--text-muted)' }}>{l.poStatus}</div>
                      </>
                    ) : '—'}
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

// Master–detail split for one PO: narrow list of the WO's POs on the left,
// live Books detail on the right (same pattern as the SKUs page, CR-014).
export function PoSplit({ pos, selectedPo, onSelect, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState({});       // lineItemId -> { quantity, removed }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [poBusy, setPoBusy] = useState(false);

  function load() {
    setDetail(null); setErr(null); setEdit({});
    axios.get(`/api/wo/po/${selectedPo}`)
      .then(({ data }) => setDetail(data))
      .catch(e => setErr(e.response?.data?.message || e.response?.data?.error || 'Could not load the purchase order'));
  }
  useEffect(load, [selectedPo]);

  const editable = detail && !['billed', 'closed', 'cancelled'].includes(detail.status);
  // Books refuses to delete a PO with receives/bills — lock instead of a raw error (CR-020).
  const deleteLocked = detail && (
    (detail.receivedStatus && detail.receivedStatus !== 'pending') ||
    (detail.billedStatus && detail.billedStatus !== 'pending')
  );
  const lines = (detail?.lineItems || []).map(l => ({
    ...l,
    quantity: edit[l.lineItemId]?.quantity ?? l.quantity,
    removed: edit[l.lineItemId]?.removed || false,
  }));
  const keptLines = lines.filter(l => !l.removed);
  const dirty = lines.some(l => l.removed || l.quantity !== (detail?.lineItems || []).find(o => o.lineItemId === l.lineItemId)?.quantity);

  function patchLine(lineItemId, patch) {
    setEdit(e => ({ ...e, [lineItemId]: { ...e[lineItemId], [Object.keys(patch)[0]]: Object.values(patch)[0] } }));
  }

  async function run(fn, doneMsg, { close = false } = {}) {
    setPoBusy(true);
    try {
      await fn();
      if (doneMsg) toast.success(doneMsg);
      onChanged();
      if (close) onClose(); else load();
    } catch (e) {
      toast.error(e.response?.data?.message || e.response?.data?.error || 'The action failed', { duration: 7000 });
    } finally { setPoBusy(false); }
  }

  const save = () => run(
    () => axios.put(`/api/wo/po/${selectedPo}`, { lines: keptLines.map(l => ({ lineItemId: l.lineItemId, quantity: Number(l.quantity) || 0 })) }),
    'Purchase order updated',
  );
  const setStatus = status => run(
    () => axios.post(`/api/wo/po/${selectedPo}/status`, { status }),
    status === 'issued' ? 'Purchase order issued' : 'Purchase order cancelled — items returned to the shortfall',
    { close: status === 'cancelled' },
  );
  const del = () => run(
    () => axios.delete(`/api/wo/po/${selectedPo}`),
    'Purchase order deleted — items returned to the shortfall',
    { close: true },
  );

  const meta = [
    ['Vendor', detail?.vendorName],
    ['Date', detail?.date],
    ['Reference (SO)', detail?.referenceNumber || '—'],
    ['Total', detail ? `₹${detail.total.toLocaleString('en-IN')}` : ''],
    ['Receive status', detail?.receivedStatus || '—'],
    ['Bill status', detail?.billedStatus || '—'],
  ];

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>
        {pos.map(p => (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            style={{
              padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
              background: p.id === selectedPo ? 'var(--blue-light)' : 'transparent',
              borderLeft: p.id === selectedPo ? '3px solid var(--blue)' : '3px solid transparent',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.number}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.vendorName || '—'} · {p.prNumber}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{detail && p.id === selectedPo ? detail.status : p.status}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {err ? <Banner tone="warn">{err}</Banner> : !detail ? <Empty>Loading purchase order…</Empty> : (
          <div style={{ maxWidth: 820, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)' }}>
              <b style={{ fontSize: 15 }}>{detail.number}</b>
              <StatusChip status={detail.status} />
              <div style={{ flex: 1 }} />
              <button onClick={onClose} title="Back to purchase requests" style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: 'middle' }}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 18px', borderBottom: '1px solid var(--border)' }}>
              {meta.map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{v || '—'}</div>
                </div>
              ))}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Item', 'Description', 'Qty', 'Rate', 'Received', 'Billed', ''].map((h, i) => (
                  <th key={h || 'x'} style={{ ...thStyle, textAlign: i >= 2 && i <= 5 ? 'right' : 'left' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.lineItemId} style={{ borderBottom: '1px solid var(--border)', opacity: l.removed ? 0.45 : 1 }}>
                    <td style={cell}>{l.name}{l.removed && <span style={{ fontSize: 11, color: '#b91c1c', marginLeft: 6 }}>removed</span>}</td>
                    <td style={{ ...cell, fontSize: 12, color: 'var(--text-muted)' }}>{l.description || '—'}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {editable && !l.removed ? (
                        <input
                          type="number" min={Math.max(1, l.received)} step="any" value={l.quantity}
                          onChange={e => patchLine(l.lineItemId, { quantity: e.target.value })}
                          style={{ width: 76, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      ) : <span style={{ fontFamily: 'var(--font-mono)' }}>{l.quantity}</span>}
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.rate}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.received}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.billed}</td>
                    <td style={{ ...cell, width: 34 }}>
                      {editable && (l.removed ? (
                        <button onClick={() => patchLine(l.lineItemId, { removed: false })} title="Keep this line" style={{ ...btn, padding: '2px 7px' }}>↺</button>
                      ) : keptLines.length > 1 && (
                        <button
                          onClick={() => patchLine(l.lineItemId, { removed: true })}
                          disabled={l.received > 0 || l.billed > 0}
                          title={l.received > 0 || l.billed > 0 ? 'Received/billed lines cannot be removed' : 'Remove line — the item returns to the shortfall'}
                          style={{ ...btn, padding: '2px 7px', color: '#b91c1c', opacity: l.received > 0 || l.billed > 0 ? 0.4 : 1 }}
                        >
                          ✕
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editable && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={poBusy || deleteLocked}
                  title={deleteLocked ? 'Has receives/bills — cannot be deleted' : undefined}
                  style={{ ...btn, color: '#b91c1c', borderColor: '#fca5a5', opacity: deleteLocked ? 0.4 : 1 }}
                >
                  {deleteLocked ? '🔒 ' : ''}Delete PO
                </button>
              )}
              <div style={{ flex: 1 }} />
              {detail.status === 'draft' && (
                <button onClick={() => setStatus('issued')} disabled={poBusy} style={btn}>Mark Issued</button>
              )}
              {editable && (
                <button onClick={() => setStatus('cancelled')} disabled={poBusy} style={btn}>Mark Cancelled</button>
              )}
              {editable && dirty && (
                <button onClick={save} disabled={poBusy} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                  Save changes
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {confirmDelete && detail && (
        <Modal title={`Delete ${detail.number}?`} onClose={() => setConfirmDelete(false)} width={440}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            The purchase order is deleted in Zoho Books and its items return to this work
            order's shortfall so they can be ordered again. This cannot be undone.
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setConfirmDelete(false)}>Keep it</ModalBtn>
            <ModalBtn variant="primary" disabled={poBusy} onClick={() => { setConfirmDelete(false); del(); }}>Delete PO</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
