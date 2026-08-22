import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';
import RowEditButton from './RowEditButton.jsx';
import RowDeleteButton from './RowDeleteButton.jsx';
import GridFooter, { usePager } from './GridFooter.jsx';
import { Empty, Banner } from './MaterialsGrid.jsx';
import { select, thStyle, cell, btn } from './woCommon.jsx';

/**
 * Items tab (CR-031): edit the work order's frozen item lines while production
 * is running — replace a missing/misfit item, change a quantity, add or remove
 * a line. Everything is internal to the work order: the Zoho composite item
 * and the Sales Order are never touched. The picker only offers items that
 * already exist in Zoho Books. Once the order is Completed the tab goes
 * read-only and leftover stock is returned automatically.
 */

const LOCKED = ['Completed', 'Closed', 'Cancelled'];

export default function WoItemsTab({ workOrderId, fgs, status, onChanged }) {
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null); // { mode: 'add' | 'replace' | 'remove', line? }
  const locked = LOCKED.includes(status);

  function load(id = fgId) {
    if (!id) return;
    axios.get(`/api/wo/${workOrderId}/bom`, { params: { fgId: id } })
      .then(({ data }) => setData(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the items'));
  }
  useEffect(() => { setData(null); load(fgId); /* eslint-disable-next-line */ }, [fgId, workOrderId]);

  const lines = data?.lines || [];
  const { pageRows, pager } = usePager(lines);
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
        {fgs.length > 1 && (
          <select value={fgId || ''} onChange={e => setFgId(e.target.value)} style={select}>
            {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
          </select>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>BOM revision {data?.revision ?? '…'}</span>
        <div style={{ flex: 1 }} />
        {!locked && <button onClick={() => setModal({ mode: 'add' })} style={btn}>＋ Add item</button>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 16px' }}>
        {!data ? <Empty>Loading…</Empty> : !lines.length ? <Empty>No items on this finished good yet.</Empty> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>
                {['Raw material', 'SKU', 'UoM', 'Source'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                <th style={{ ...thStyle, textAlign: 'right' }}>Required</th>
                <th style={{ ...thStyle, width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {pageRows.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', opacity: l.requiredQty === 0 ? 0.55 : 1 }}>
                  <td style={cell}>
                    {l.rmName}
                    {l.requiredQty === 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#b91c1c', background: '#b91c1c18', padding: '1px 7px', borderRadius: 99 }}>
                        removed — stock returns on completion
                      </span>
                    )}
                  </td>
                  <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.rmSku || '—'}</td>
                  <td style={cell}>{l.uom || '—'}</td>
                  <td style={{ ...cell, fontSize: 12, color: 'var(--text-muted)' }}>{l.source}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.requiredQty}</td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    {!locked && l.requiredQty > 0 && (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <RowEditButton title="Edit quantity / replace" onEdit={() => setModal({ mode: 'replace', line: l })} />
                        <RowDeleteButton title="Remove item" onDelete={() => setModal({ mode: 'remove', line: l })} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
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

function ItemPicker({ value, onPick, field }) {
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
