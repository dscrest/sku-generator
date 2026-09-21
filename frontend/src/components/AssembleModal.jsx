import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';
import { TrackingPicker } from './MaterialsGrid.jsx';

// ---- assembly (CR-126, CR-150, CR-172, CR-176) ------------------------------
// One Zoho bundle per confirm, from the Details → Assembly tab once every BOM
// line is issued: raw materials leave the Issue warehouse, the finished good's
// stock lands in Main with one serial per unit (KGV2026001…). Batch/serial-
// tracked raw materials get the CR-123 picker on Proceed (FIFO prefilled).
// Fully assembled FG → Closed; Close stays manual.
export default function AssembleModal({ workOrderId, fg, whNames = {}, onClose, onDone }) {
  const remaining = (fg.qty || 0) - (fg.assembledQty || 0);
  // CR-174: the Assembly tab row's typed quantity (partial run) seeds the field.
  const [qty, setQty] = useState(String(fg.initialQty > 0 ? Math.min(fg.initialQty, remaining) : remaining));
  const [prefix, setPrefix] = useState(null); // null until the prefill arrives (CR-155)
  const [preview, setPreview] = useState(null); // { serialRange, components, fromWarehouseId } | { error }
  const [picker, setPicker] = useState(null); // [{ entry, pool }] while the batch picker is open (CR-176)
  const [busy, setBusy] = useState(false);
  const ok = Number(qty) > 0 && Number(qty) <= remaining && Boolean(prefix) && preview && !preview.error;

  // Preview on open and on every qty/prefix edit — a user action, never a timer.
  useEffect(() => {
    if (!(Number(qty) > 0)) { setPreview(null); return; }
    let live = true;
    axios.get(`/api/wo/${workOrderId}/fg/${fg.id}/assemble/preview`, { params: { qty: Number(qty), prefix: prefix || '' } })
      .then(({ data }) => {
        if (!live) return;
        if (prefix === null) setPrefix(data.prefix || '');
        setPreview(data.serialRange
          ? { serialRange: data.serialRange, components: data.components || [], fromWarehouseId: data.fromWarehouseId }
          : { error: 'Enter a serial prefix (e.g. KGV)' });
      })
      .catch(err => live && setPreview({ error: err.response?.data?.error || 'Could not preview the serials' }));
    return () => { live = false; };
  }, [workOrderId, fg.id, qty, prefix]);

  // Proceed: tracked raw materials open the picker first (same flow as the
  // Materials tab). Sequential lookups — the Catalyst dev tier throttles.
  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const tracked = [];
      for (const c of preview.components) {
        try {
          const { data } = await axios.get('/api/wo/tracking-options', {
            params: { itemId: c.itemId, qty: c.qty, fromWarehouseId: preview.fromWarehouseId },
          });
          if (data.tracking) tracked.push({ entry: { key: c.itemId, qty: c.qty, row: { itemId: c.itemId, name: c.name } }, pool: data });
        } catch { /* pool lookup failed — the server auto-picks FIFO */ }
      }
      if (tracked.length) { setPicker(tracked); return; }
      await post(null);
    } finally { setBusy(false); }
  }

  async function post(trackingByKey) {
    setBusy(true);
    try {
      const components = Object.entries(trackingByKey || {}).map(([itemId, tracking]) => ({ itemId, tracking }));
      const { data } = await axios.post(`/api/wo/${workOrderId}/fg/${fg.id}/assemble`, { qty: Number(qty), prefix, components });
      // CR-175: the bundle lands at Issue, a Transfer Order moves the FG to Main.
      if (data.transferWarning) toast.error(data.transferWarning, { duration: 12000 });
      onDone(
        `Assembly ${data.bundleNumber} created — ${data.assembledQty}/${fg.qty} assembled`
        + (data.serialRange ? ` · serials ${data.serialRange}` : '')
        + (data.transferOrderNumber ? ` · moved to Main by ${data.transferOrderNumber}` : ''),
      );
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not create the assembly']).forEach(m => toast.error(m, { duration: 8000 }));
    } finally { setBusy(false); }
  }

  // The picker replaces the modal (no nesting); Cancel returns here with qty/prefix intact.
  if (picker) {
    return (
      <TrackingPicker
        items={picker}
        verb="Assembly"
        whNames={whNames}
        onCancel={() => setPicker(null)}
        onConfirm={picks => { setPicker(null); post(picks); }}
      />
    );
  }

  return (
    <Modal title={`Assemble ${fg.name}`} onClose={onClose} onSubmit={submit} width={460}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Raw materials are consumed from the <b>Issue warehouse</b> and {fg.name} stock is created in the
        <b> Main warehouse</b> via a Zoho Inventory assembly. {fg.assembledQty || 0} of {fg.qty} already assembled.
        {preview?.components?.length > 0 && (
          <> <b>Select batch</b> lists the batch / serial numbers of each tracked raw material
          ({preview.components.length} line{preview.components.length === 1 ? '' : 's'}) — the assembly is created after you confirm them.</>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Quantity to assemble (up to {remaining})
          </label>
          <input
            type="number" min="1" max={remaining} step="1" autoFocus
            value={qty} onChange={e => setQty(e.target.value)}
            style={{
              width: 120, padding: '7px 10px', fontSize: 14, textAlign: 'right', fontFamily: 'var(--font-mono)',
              border: `1px solid ${(Number(qty) > 0 && Number(qty) <= remaining) || qty === '' ? 'var(--border)' : '#dc2626'}`,
              borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
            Serial prefix
          </label>
          <input
            type="text" maxLength={10} placeholder="KGV"
            value={prefix ?? ''} onChange={e => setPrefix(e.target.value.toUpperCase())}
            style={{
              width: 120, padding: '7px 10px', fontSize: 14, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              border: `1px solid ${preview?.error && prefix !== null ? '#dc2626' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: preview?.error ? '#dc2626' : 'var(--text-secondary)' }}>
        {preview?.error ? preview.error : preview?.serialRange ? `Will assign ${preview.serialRange}` : prefix === null ? 'Loading…' : ''}
      </div>
      {(fg.assemblies || []).length > 0 && (
        <div style={{ fontSize: 12 }}>
          <b style={{ color: 'var(--text-secondary)' }}>Previous assemblies</b>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fg.assemblies.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, color: 'var(--text-muted)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{a.bundleNumber || '—'}</span>
                <span>× {a.qty}</span>
                {a.serialRange && <span style={{ fontFamily: 'var(--font-mono)' }}>{a.serialRange}</span>}
                <span>{a.createdAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={!ok || busy} onClick={submit}>
          {/* The picker's own confirm is the real "Proceed Assembly"; an FG with no tracked RM skips it. */}
          {busy ? 'Working…' : preview?.components?.length ? 'Select batch' : 'Proceed Assembly'}
        </ModalBtn>
      </ModalFooter>
    </Modal>
  );
}
