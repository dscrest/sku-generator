import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { Empty, TrackingPicker } from '../components/MaterialsGrid.jsx';
import { ItemPicker } from '../components/WoItemsTab.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import { fmtDate } from '../format.js';

/**
 * Store issues (CR-203 / CR-244): every defective-material return, newest
 * first. The Store Issue Manager takes two independent decisions per row:
 *  - Replacement: reserve & issue the same or a different item (what Main has,
 *    the rest becomes a purchase request), or purchase all of it.
 *  - Disposition of the defective units: restock (repaired), trash (Zoho
 *    inventory adjustment) or return to vendor (stays blocked).
 * Every decision needs a reason and lands in the work order's History.
 */

const STATUS = {
  pending: { label: 'Pending', tone: '#b45309' },
  repaired: { label: 'Restocked', tone: '#15803d' },
  adjusted: { label: 'Written off', tone: '#475569' },
  returned_to_vendor: { label: 'Returned to vendor', tone: '#0369a1' },
};
const REPL = {
  '': { label: 'Awaiting decision', tone: '#b45309' },
  issued: { label: 'Reserved & issued', tone: '#15803d' },
  pr_raised: { label: 'Purchase requested', tone: '#0369a1' },
  both: { label: 'Issued + purchase requested', tone: '#0369a1' },
  legacy: { label: '—', tone: '#94a3b8' },
};
const FILTERS = [
  { key: 'open', label: 'Open' }, { key: 'pending', label: 'Pending' }, { key: 'repaired', label: 'Restocked' },
  { key: 'adjusted', label: 'Written off' }, { key: 'returned_to_vendor', label: 'Returned to vendor' }, { key: '', label: 'All' },
];
const REPLACE = [
  { key: 'issue', label: 'Replace — Reserve & Issue', proceed: 'Proceed Reserve & Issue', hint: 'Reserves what Main has (Main → Reserve → Issue, batch numbers picked next) and raises a purchase request for the rest.' },
  { key: 'pr', label: 'Replace — Raise PR', proceed: 'Proceed Raise PR', hint: 'Raises a purchase request for the full quantity; nothing moves now.' },
];
const ACTIONS = [
  { key: 'repaired', label: 'Restock — repaired', proceed: 'Proceed Restock', hint: 'The units are fixed and may be reserved again.' },
  { key: 'adjusted', label: 'Trash — write off', proceed: 'Proceed Write Off', hint: 'Writes the quantity off in Zoho Inventory (negative adjustment at the Main warehouse). The stock is gone.' },
  { key: 'returned_to_vendor', label: 'Return to vendor', proceed: 'Proceed Return to Vendor', hint: 'Marks the units as sent back. They stay blocked; adjust the stock in Books when the vendor credits them.' },
];

function Chip({ s }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, color: s.tone, background: `${s.tone}18`, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

const trackingText = t => {
  if (!t) return '—';
  if (t.serials?.length) return t.serials.join(', ');
  if (t.batches?.length) return t.batches.map(b => `${b.batch_number || b.batch_id} × ${b.qty}`).join(', ');
  return '—';
};
const isOpen = r => r.status === 'pending' || !r.replacementStatus;

const buildColumns = (navigate, setAct, setRepl) => [
  {
    key: 'woNumber', label: 'Work Order', lock: true, render: r => (
      <button onClick={e => { e.stopPropagation(); navigate(`/wo/${r.workOrderId}`); }}
        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontWeight: 600, color: 'var(--blue)', fontFamily: 'inherit', fontSize: 'inherit' }}>
        {r.woNumber}
      </button>
    ),
  },
  { key: 'fgName', label: 'Finished Good', render: r => r.fgName },
  {
    key: 'itemName', label: 'Item', render: r => (
      <>
        {r.itemName}
        {r.itemSku && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.itemSku}</div>}
      </>
    ),
  },
  { key: 'qty', label: 'Qty', align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono)' }}>{r.qty}</span> },
  { key: 'tracking', label: 'Batch / Serial', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{trackingText(r.tracking)}</span> },
  { key: 'reason', label: 'Reason', render: r => <span style={{ whiteSpace: 'normal' }}>{r.reason}</span> },
  {
    key: 'photo', label: 'Photo', render: r => r.hasPhoto ? (
      <a href={`/server/skuapi/api/wo/defects/${r.id}/photo`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Open photo">
        <img src={`/server/skuapi/api/wo/defects/${r.id}/photo`} alt="" style={{ height: 36, width: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
      </a>
    ) : '—',
  },
  { key: 'raised', label: 'Raised', render: r => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.raisedBy || '—'} · {fmtDate(r.raisedAt)}</span> },
  {
    key: 'replacement', label: 'Replacement', render: r => (
      <span style={{ fontSize: 12 }}>
        <Chip s={REPL[r.replacementStatus] || REPL.legacy} />
        {r.replacementName && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>with {r.replacementName}</div>}
        {r.replacementRef && <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{r.replacementRef}</div>}
      </span>
    ),
  },
  { key: 'status', label: 'Defective units', render: r => <Chip s={STATUS[r.status] || { label: r.status, tone: '#64748b' }} /> },
  {
    key: 'actioned', label: 'Decision', render: r => r.actionedAt ? (
      <span style={{ fontSize: 12, whiteSpace: 'normal' }}>
        {r.actionReason}
        <div style={{ color: 'var(--text-muted)' }}>{r.actionedBy || '—'} · {fmtDate(r.actionedAt)}{r.zohoAdjustmentId ? ` · adj ${r.zohoAdjustmentId}` : ''}</div>
      </span>
    ) : '—',
  },
  {
    key: 'actions', label: '', lock: true, align: 'right', width: 48, render: r => (
      <RowMenu items={[
        ...REPLACE.map(a => ({ label: a.label, disabled: Boolean(r.replacementStatus), onClick: () => setRepl({ row: r, mode: a }) })),
        ...ACTIONS.map(a => ({ label: a.label, disabled: r.status !== 'pending', onClick: () => setAct({ row: r, action: a }) })),
      ]} />
    ),
  },
];

export default function WoDefectsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('open');
  const [wo, setWo] = useState('');
  const [q, setQ] = useState('');
  const [act, setAct] = useState(null);   // { row, action } — disposition
  const [repl, setRepl] = useState(null); // { row, mode } — replacement (CR-244)

  function load() {
    axios.get('/api/wo/defects')
      .then(({ data }) => setRows(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load store issues'));
  }
  useEffect(load, []);

  const { cols, chooser } = useGridColumns('wo.defects', buildColumns(navigate, setAct, setRepl));
  const filtered = (rows || []).filter(r =>
    (status === 'open' ? isOpen(r) : !status || r.status === status) &&
    (!wo || r.woNumber === wo) &&
    (!q || [r.itemName, r.itemSku, r.reason, r.fgName, r.replacementName].some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))),
  );
  const { pageRows, pager } = usePager(filtered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search item, reason…" aria-label="Search store issues"
          style={{ padding: '7px 11px', fontSize: 13, minWidth: 240, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
        <select value={status} onChange={e => setStatus(e.target.value)} title="Filter by status"
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', cursor: 'pointer' }}>
          {FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <FilterSelect label="Work Orders" value={wo} onChange={setWo} options={distinct(rows || [], 'woNumber')} />
        {(status !== 'open' || wo || q) && (
          <button onClick={() => { setStatus('open'); setWo(''); setQ(''); }} style={btn}>✕ Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => { setRows(null); load(); }} title="Refresh" style={btn}>⟳</button>
        <ColumnChooser chooser={chooser} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? (
          <Empty>{rows.length ? 'No store issues match these filters.' : 'No defective material has been reported yet — use Replace on a work order’s Details tab.'}</Empty>
        ) : (
          <div style={{ marginTop: 12 }}>
            <DataTable cols={cols} rows={pageRows} />
          </div>
        )}
      </div>
      <GridFooter pager={pager} />

      {act && <ReasonModal act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); load(); }} />}
      {repl && <ReplaceModal repl={repl} onClose={() => setRepl(null)} onDone={() => { setRepl(null); load(); }} />}
    </div>
  );
}

const label = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 };
const textarea = { width: '100%', boxSizing: 'border-box', padding: '6px 10px', fontSize: 13, fontFamily: 'var(--font)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', resize: 'vertical' };

/**
 * Replacement decision (CR-244). Optional different item (Books typeahead),
 * live "N reservable · M to purchase" for it, reason; Proceed opens the
 * batch/serial picker for tracked items, then one POST does the legs.
 */
function ReplaceModal({ repl, onClose, onDone }) {
  const { row, mode } = repl;
  const [item, setItem] = useState(null);      // Books item | null = same item
  const [reason, setReason] = useState('');
  const [opts, setOpts] = useState(null);      // { qty, reservable, short, stock, tracking, prefill… }
  const [picker, setPicker] = useState(null);  // TrackingPicker items
  const [busy, setBusy] = useState(false);
  const itemId = item?.id || row.itemId;
  const itemName = item?.name || row.itemName;

  useEffect(() => {
    if (mode.key === 'pr') { setOpts({ qty: row.qty, reservable: 0, short: row.qty, tracking: null }); return; }
    setOpts(null);
    let live = true;
    axios.get(`/api/wo/defects/${row.id}/replacement-options`, { params: { itemId } })
      .then(({ data }) => { if (live) setOpts(data); })
      .catch(err => { if (live) { toast.error(err.response?.data?.error || 'Could not read stock'); setOpts({ qty: row.qty, reservable: 0, short: row.qty, tracking: null, failed: true }); } });
    return () => { live = false; };
  }, [row.id, itemId, mode.key]);

  async function submit(tracking) {
    setPicker(null);
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/defects/${row.id}/replace`, {
        mode: mode.key, reason: reason.trim(), ...(item ? { replacement: item } : {}), ...(tracking ? { tracking } : {}),
      });
      const parts = [];
      if (data.reservedIssued > 0) parts.push(`reserved & issued ${data.reservedIssued}`);
      if (data.purchased > 0) parts.push(`${data.prNumber || 'PR'} raised for ${data.purchased}`);
      toast.success(`${itemName}: ${parts.join(' · ')}${data.replacementRef ? ` (${data.replacementRef})` : ''}`, { duration: 8000 });
      onDone();
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not record the replacement']).forEach(m => toast.error(m, { duration: 8000 }));
      setBusy(false);
    }
  }
  function proceed() {
    if (!reason.trim()) return toast.error('Give a reason');
    if (opts?.tracking && opts.reservable > 0) {
      setPicker([{ entry: { key: row.id, row: { itemId, name: itemName }, qty: opts.reservable }, pool: opts }]);
      return;
    }
    submit(null);
  }

  return (
    <>
      <Modal title={mode.label} onClose={onClose} onSubmit={proceed} width={560}>
        <div style={{ fontSize: 13 }}>
          <b>{row.itemName}</b> × {row.qty} · {row.woNumber} · {row.fgName}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{mode.hint}</div>
        </div>
        <div>
          <span style={label}>Replace with (optional — leave empty to reissue the same item)</span>
          <ItemPicker value={item} onPick={setItem} field={{ ...textarea, resize: 'none' }} />
        </div>
        <div style={{ fontSize: 12, padding: '8px 10px', borderRadius: 'var(--radius-md)', background: 'var(--bg)', border: '1px solid var(--border)' }}>
          {!opts ? 'Checking stock at Main…' : mode.key === 'pr' ? (
            <>A purchase request for <b>{row.qty}</b> × {itemName} will be raised.</>
          ) : (
            <>
              <b style={{ color: opts.reservable > 0 ? '#15803d' : undefined }}>{opts.reservable}</b> reservable at Main
              {opts.stock !== undefined && ` (${opts.stock} on hand, blocked units excluded)`}
              {opts.short > 0 && <> · <b style={{ color: '#b45309' }}>{opts.short}</b> will be purchase-requested</>}
              {opts.tracking && ' · batch/serial numbers picked next'}
            </>
          )}
        </div>
        <div>
          <span style={label}>Reason</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus style={textarea} />
        </div>
        <ModalFooter>
          <ModalBtn onClick={onClose}>Cancel</ModalBtn>
          <ModalBtn variant="primary" onClick={proceed} disabled={busy || !opts || !reason.trim()}>{busy ? 'Working…' : mode.proceed}</ModalBtn>
        </ModalFooter>
      </Modal>
      {picker && (
        <TrackingPicker items={picker} verb="Reserve" onCancel={() => setPicker(null)} onConfirm={picks => submit(picks[row.id] || null)} />
      )}
    </>
  );
}

function ReasonModal({ act, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { row, action } = act;
  async function proceed() {
    if (!reason.trim()) return toast.error('Give a reason');
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/defects/${row.id}/action`, { action: action.key, reason: reason.trim() });
      toast.success(`${row.itemName} × ${row.qty} — ${STATUS[data.status]?.label || data.status}${data.zohoAdjustmentId ? ` (Zoho adjustment ${data.zohoAdjustmentId})` : ''}`, { duration: 6000 });
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not record the decision', { duration: 7000 });
      setBusy(false);
    }
  }
  return (
    <Modal title={action.label} onClose={onClose} onSubmit={proceed} width={460}>
      <div style={{ fontSize: 13 }}>
        <b>{row.itemName}</b> × {row.qty} · {row.woNumber}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{action.hint}</div>
      </div>
      <div>
        <span style={label}>Reason</span>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} autoFocus style={textarea} />
      </div>
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" onClick={proceed} disabled={busy || !reason.trim()}>{busy ? 'Working…' : action.proceed}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

const btn = {
  padding: '6px 11px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
