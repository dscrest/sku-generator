import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';
import RowMenu from './RowMenu.jsx';
import GridFooter, { usePager } from './GridFooter.jsx';
import { Empty, Banner } from './MaterialsGrid.jsx';
import { select, btn, can, StatusChip } from './woCommon.jsx';
import DataTable, { useGridColumns, ColumnChooser } from './DataTable.jsx';

/**
 * Items tab (CR-031): edit the work order's frozen item lines while production
 * is running — replace a missing/misfit item, change a quantity, add or remove
 * a line. Everything is internal to the work order: the Zoho composite item
 * and the Sales Order are never touched. The picker only offers items that
 * already exist in Zoho Books. Once the order is Completed the tab goes
 * read-only and leftover stock is returned automatically.
 */

const LOCKED = ['Completed', 'Closed', 'Cancelled'];

// Columns need the locked flag and the modal opener, so a builder, not a const.
const buildColumns = (locked, setModal) => [
  {
    key: 'rmName', label: 'Raw Material', lock: true, render: l => (
      <>
        {l.rmName}
        {l.requiredQty === 0 && (
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#b91c1c18', padding: '1px 7px', borderRadius: 99 }}>
            removed — stock returns on completion
          </span>
        )}
      </>
    ),
  },
  { key: 'rmSku', label: 'SKU', render: l => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.rmSku || '—'}</span> },
  { key: 'uom', label: 'UoM', render: l => l.uom || '—' },
  { key: 'source', label: 'Source', render: l => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.source}</span> },
  { key: 'requiredQty', label: 'Required', align: 'right', render: l => <span style={{ fontFamily: 'var(--font-mono)' }}>{l.requiredQty}</span> },
  {
    key: 'actions', label: '', lock: true, align: 'right', width: 110, render: l => (
      !locked && l.requiredQty > 0 && (
        <RowMenu editLabel="Edit / replace" onEdit={() => setModal({ mode: 'replace', line: l })} deleteLabel="Remove" onDelete={() => setModal({ mode: 'remove', line: l })} />
      )
    ),
  },
];

export default function WoItemsTab({ workOrderId, fgs, status, onChanged, user }) {
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'add' | 'replace' | 'remove', line? }
  const [assembling, setAssembling] = useState(null); // fg awaiting a quantity (CR-126)
  const locked = LOCKED.includes(status);
  const fg = fgs.find(f => String(f.id) === String(fgId)) || fgs[0];

  function load(id = fgId) {
    if (!id) return;
    axios.get(`/api/wo/${workOrderId}/bom`, { params: { fgId: id } })
      .then(({ data }) => setData(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the items'));
  }
  useEffect(() => { setData(null); load(fgId); /* eslint-disable-next-line */ }, [fgId, workOrderId]);

  const lines = data?.lines || [];
  const { pageRows, pager } = usePager(lines);
  const { cols, chooser } = useGridColumns('wo.items', buildColumns(locked, setModal));
  // Substitution notes: every revision that changed something, newest first.
  const changes = (data?.revisions || []).filter(r =>
    r.summary?.note || r.summary?.added?.length || r.summary?.removed?.length || r.summary?.changed?.length);

  function done(note) {
    setModal(null);
    if (note) toast.success(note, { duration: 5000 });
    load();
    onChanged?.();
  }

  if (!fgs.length) return <Empty>This work order has no finished goods.</Empty>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {locked && (
        <Banner tone="info">Items are locked once the work order is completed — leftover material was returned to the Main warehouse.</Banner>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap' }}>
        <select value={fgId || ''} onChange={e => setFgId(e.target.value)} style={select}>
          {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>BOM revision {data?.revision ?? '…'}</span>
        {/* Assembly progress (CR-126) */}
        {fg && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            · Assembled {fg.assembledQty || 0}/{fg.qty}
            {fg.status === 'Closed' && <StatusChip status="Closed" />}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {fg && fg.status !== 'Closed' && status !== 'Cancelled' && can(user, 'wo.action.assemble') && (
          <button onClick={() => setAssembling(fg)} style={btn}>⚙ Assemble</button>
        )}
        <ColumnChooser chooser={chooser} />
        {!locked && <button onClick={() => setModal({ mode: 'add' })} style={btn}>＋ Add item</button>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {!data ? <Empty>Loading…</Empty> : !lines.length ? <Empty>No items on this finished good yet.</Empty> : (
          <DataTable cols={cols} rows={pageRows} rowStyle={l => ({ opacity: l.requiredQty === 0 ? 0.55 : 1 })} />
        )}

        {changes.length > 0 && (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Changes</h3>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {changes.map(r => (
                <div key={r.revision} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
                  <b style={{ minWidth: 32 }}>r{r.revision}</b>
                  <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>{r.changedAt}</span>
                  <span>{r.summary.note || summaryText(r.summary)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <GridFooter pager={pager} />

      {modal && (
        <OpModal
          workOrderId={workOrderId}
          fgId={fgId}
          mode={modal.mode}
          line={modal.line}
          onClose={() => setModal(null)}
          onDone={done}
        />
      )}
      {assembling && (
        <AssembleModal
          workOrderId={workOrderId}
          fg={assembling}
          onClose={() => setAssembling(null)}
          onDone={msg => { setAssembling(null); toast.success(msg, { duration: 7000 }); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ---- assembly (CR-126) ------------------------------------------------------
// One Zoho bundle per confirm: raw materials leave the Issue warehouse, the
// finished good's stock lands in Main. Fully assembled FG → Closed; all FGs
// assembled → the WO moves to QualityCheck for the manual QC + Close.
function AssembleModal({ workOrderId, fg, onClose, onDone }) {
  const remaining = (fg.qty || 0) - (fg.assembledQty || 0);
  const [qty, setQty] = useState(String(remaining));
  const [busy, setBusy] = useState(false);
  const ok = Number(qty) > 0 && Number(qty) <= remaining;

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/fg/${fg.id}/assemble`, { qty: Number(qty) });
      onDone(
        `Assembly ${data.bundleNumber} created — ${data.assembledQty}/${fg.qty} assembled`
        + (data.woStatus === 'QualityCheck' ? ' · work order moved to Quality Check' : ''),
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create the assembly', { duration: 8000 });
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Assemble ${fg.name}`} onClose={onClose} onSubmit={submit} width={460}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Raw materials are consumed from the <b>Issue warehouse</b> and {fg.name} stock is created in the
        <b> Main warehouse</b> via a Zoho Inventory assembly. {fg.assembledQty || 0} of {fg.qty} already assembled.
      </div>
      <div>
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
          Quantity to assemble (up to {remaining})
        </label>
        <input
          type="number" min="1" max={remaining} step="1" autoFocus
          value={qty} onChange={e => setQty(e.target.value)}
          style={{
            width: 120, padding: '7px 10px', fontSize: 14, textAlign: 'right', fontFamily: 'var(--font-mono)',
            border: `1px solid ${ok || qty === '' ? 'var(--border)' : '#dc2626'}`, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-card)',
          }}
        />
      </div>
      {(fg.assemblies || []).length > 0 && (
        <div style={{ fontSize: 12 }}>
          <b style={{ color: 'var(--text-secondary)' }}>Previous assemblies</b>
          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {fg.assemblies.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 10, color: 'var(--text-muted)' }}>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{a.bundleNumber || '—'}</span>
                <span>× {a.qty}</span>
                <span>{a.createdAt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={!ok || busy} onClick={submit}>
          {busy ? 'Assembling…' : 'Create assembly'}
        </ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// Fallback for revisions recorded before notes existed (imports, seeding).
function summaryText(s) {
  const bits = [];
  if (s.added?.length) bits.push(`${s.added.length} added`);
  if (s.removed?.length) bits.push(`${s.removed.length} removed`);
  if (s.changed?.length) bits.push(`${s.changed.length} changed`);
  return bits.join(', ') || '—';
}

// ---- one modal for the three edits -----------------------------------------

const TITLES = {
  add: 'Add an item',
  replace: 'Edit / replace item',
  remove: 'Remove item',
};

function OpModal({ workOrderId, fgId, mode, line, onClose, onDone }) {
  const [item, setItem] = useState(null);            // picked Books item (add / replace)
  const [qty, setQty] = useState(line ? String(line.requiredQty) : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const field = { width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', boxSizing: 'border-box' };
  const label = { fontSize: 12, color: 'var(--text-secondary)', display: 'block', margin: '0 0 4px' };

  // Replace with no item picked = just a quantity change.
  const action = mode === 'replace' ? (item ? 'replace' : 'setQty') : mode;

  async function save() {
    const op = { action, reason: reason.trim() || undefined };
    if (mode === 'add') { op.item = item; op.qty = Number(qty); }
    if (mode === 'remove') op.rmItemId = line.rmItemId;
    if (mode === 'replace') {
      op.rmItemId = line.rmItemId;
      if (item) op.item = item;
      op.qty = Number(qty);
    }
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/lines`, { fgId, op });
      onDone(data.note);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save the change', { duration: 6000 });
      setBusy(false);
    }
  }

  const needsItem = mode === 'add';
  const canSave = !busy
    && (!needsItem || item)
    && (mode === 'remove' || Number(qty) > 0 || (action === 'setQty' && Number(qty) >= 0));

  return (
    <Modal title={TITLES[mode]} onClose={onClose} width={480}>
      {line && (
        <div style={{ fontSize: 13 }}>
          <b>{line.rmName}</b>{line.rmSku ? ` (${line.rmSku})` : ''} — required {line.requiredQty}
        </div>
      )}
      {mode === 'remove' ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          The item is taken off this work order. Any stock already reserved or issued for it
          goes back to the Main warehouse when the order completes.
        </div>
      ) : (
        <>
          <div>
            <label style={label}>{mode === 'replace' ? 'Replace with (leave empty to only change the quantity)' : <>Item from Zoho Books <span style={{ color: '#e11d48' }}>*</span></>}</label>
            <ItemPicker value={item} onPick={setItem} field={field} />
          </div>
          <div>
            <label style={label}>Quantity <span style={{ color: '#e11d48' }}>*</span></label>
            <input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} style={field} />
          </div>
        </>
      )}
      <div>
        <label style={label}>Reason (kept on the work order&apos;s change note)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder="e.g. size misfit — brand substituted" style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }} />
      </div>
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={!canSave} onClick={save}>
          {busy ? 'Saving…' : mode === 'remove' ? 'Remove item' : 'Save'}
        </ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// ---- Books item typeahead ---------------------------------------------------

export function ItemPicker({ value, onPick, field }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  function search(text) {
    setQ(text);
    onPick(null);
    clearTimeout(timer.current);
    if (text.trim().length < 2) { setHits(null); setOpen(false); return; }
    timer.current = setTimeout(() => {
      axios.get('/api/wo/items', { params: { q: text.trim() } })
        .then(({ data }) => { setHits(data); setOpen(true); })
        .catch(() => setHits([]));
    }, 300);
  }

  if (value) {
    return (
      <div style={{ ...field, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>{value.name}{value.sku ? ` — ${value.sku}` : ''}</span>
        <button onClick={() => { onPick(null); setQ(''); }} title="Pick a different item"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>✕</button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={q}
        onChange={e => search(e.target.value)}
        onFocus={() => hits && setOpen(true)}
        placeholder="Type at least 2 characters to search Zoho Books…"
        style={field}
      />
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 41, maxHeight: 220, overflowY: 'auto',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,.14)',
          }}>
            {!hits?.length ? (
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No matching Books items.</div>
            ) : hits.map(i => (
              <button key={i.id} onClick={() => { onPick(i); setOpen(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--blue-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                {i.name}{i.sku ? <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}> — {i.sku}</span> : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
