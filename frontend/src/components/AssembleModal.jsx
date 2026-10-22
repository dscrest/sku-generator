import { useState, useEffect } from 'react';
import axios from 'axios';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';
import { TrackingPicker } from './MaterialsGrid.jsx';

// ---- assembly (CR-126, CR-150, CR-172, CR-176, CR-243) ----------------------
// Collects the count, serial prefix and (for tracked raw materials) the CR-123
// batch/serial picks, then hands the POST body to the parent via onProceed —
// the parent closes this modal and shows "Assembling…" on the Ready row while
// the Zoho bundle is created (CR-243). Never posts itself.
export default function AssembleModal({ workOrderId, fg, whNames = {}, onClose, onProceed }) {
  // CR-277: capped at what the issued material covers (the Assembly tab's Ready), else at the order.
  const remaining = fg.maxQty ?? ((fg.qty || 0) - (fg.assembledQty || 0));
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
      onProceed(body(null));
    } finally { setBusy(false); }
  }

  // POST body for /assemble; the parent sends it (CR-243).
  const body = trackingByKey => ({
    qty: Number(qty), prefix,
    components: Object.entries(trackingByKey || {}).map(([itemId, tracking]) => ({ itemId, tracking })),
  });

  // The picker replaces the modal (no nesting); Cancel returns here with qty/prefix intact.
  // Its Proceed hands the picks up — the parent unmounts us, so the count form never reappears.
  if (picker) {
    return (
      <TrackingPicker
        items={picker}
        verb="Assembly"
        whNames={whNames}
        onCancel={() => setPicker(null)}
        onConfirm={picks => onProceed(body(picks))}
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
              border: `1px solid ${(Number(qty) > 0 && Number(qty) <= remaining) || qty === '' ? 'var(--border)' : 'var(--danger)'}`,
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
              border: `1px solid ${preview?.error && prefix !== null ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
            }}
          />
        </div>
      </div>
      <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: preview?.error ? 'var(--danger)' : 'var(--text-secondary)' }}>
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
