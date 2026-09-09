import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import PurchaseTab, { PoSplit } from '../components/PurchaseTab.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, ProcChip, AccessNotice, Table, btn, select } from '../components/woCommon.jsx';
import { fmtMoney, fmtDate } from '../format.js';

/**
 * Purchase Request page. Primary view is **By item** (CR-023): the shortfall of
 * every open work order aggregated per raw material, so the buyer ticks items,
 * picks one vendor, and raises a grouped PO in a single step — no drilling into
 * each work order. Requests/Orders keep the per-WO PurchaseTab and per-PO
 * PoSplit reachable.
 */
const VIEWS = ['By Item', 'Requests', 'Orders'];
const nice = s => String(s || '—').replace(/_/g, ' ');

export default function WorkOrderPurchasePage() {
  const navigate = useNavigate();
  const [wos, setWos] = useState(null);
  const [prs, setPrs] = useState(null);
  const [pos, setPos] = useState(null);
  const [view, setView] = useState(VIEWS[0]);
  const [statusFilter, setStatusFilter] = useState('');
  const [woFilter, setWoFilter] = useState('');
  const [selected, setSelected] = useState(null);   // wo id → PurchaseTab
  const [selectedPo, setSelectedPo] = useState(null); // po id → PoSplit
  const [wo, setWo] = useState(null);
  const [blocked, setBlocked] = useState(null);

  // Each list loads when a view first needs it — the Orders list in particular
  // crawls every PO in the Books org, so it must not load (or reload) for free.
  function loadWos() {
    axios.get('/api/wo')
      .then(({ data }) => setWos(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load work orders');
      });
  }
  // A swallowed failure here shows "No purchase requests yet." over real data
  // (a silent 500 hid every request for two weeks, CR-047) — surface the error.
  const loadPrs = () => axios.get('/api/wo/purchase-requests').then(({ data }) => setPrs(data))
    .catch(err => { setPrs([]); toast.error(err.response?.data?.error || 'Could not load purchase requests'); });
  // Every PO in the Books org (CR-020), not just the ones raised from here.
  const loadPos = () => axios.get('/api/wo/purchase-orders').then(({ data }) => setPos(data))
    .catch(err => { setPos([]); toast.error(err.response?.data?.error || 'Could not load purchase orders'); });

  useEffect(loadWos, []);
  useEffect(() => {
    if (view === 'Requests' && prs === null) loadPrs();
    if (view === 'Orders' && pos === null) loadPos();
    // eslint-disable-next-line
  }, [view]);
  useEffect(() => { if (selectedPo && pos === null) loadPos(); /* eslint-disable-next-line */ }, [selectedPo]);

  // After a purchase action, refresh only the lists already on screen.
  function loadLists() {
    if (prs !== null) loadPrs();
    if (pos !== null) loadPos();
  }

  function loadDetail() {
    if (!selected) return;
    axios.get(`/api/wo/${selected}`)
      .then(({ data }) => setWo(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the work order'));
  }
  useEffect(() => { setWo(null); loadDetail(); /* eslint-disable-next-line */ }, [selected]);

  const gridRows = view === 'Requests' ? (prs || []) : view === 'Orders' ? (pos || []) : [];
  const statuses = [...new Set(gridRows.map(r => r.status).filter(Boolean))];
  const woNumbers = [...new Set(gridRows.map(r => r.woNumber).filter(Boolean))];
  const filtered = gridRows.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!woFilter || r.woNumber === woFilter));
  const { pageRows, pager } = usePager(filtered);

  if (blocked) return <AccessNotice kind={blocked} />;

  if (selectedPo) {
    return (
      <PoSplit
        pos={pos || []}
        selectedPo={selectedPo}
        onSelect={setSelectedPo}
        onClose={() => setSelectedPo(null)}
        onChanged={loadLists}
      />
    );
  }

  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <button onClick={() => setSelected(null)} style={btn}>← All purchases</button>
          <b style={{ fontSize: 14 }}>{wo?.woNumber || ''}</b>
          {wo && <StatusChip status={wo.status} />}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{wo ? `${wo.customerName} · SO ${wo.salesOrderNumber}` : ''}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => navigate(`/wo/${selected}`)} style={btn}>Open work order →</button>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {!wo ? <Empty>Loading work order…</Empty>
            : <PurchaseTab workOrderId={selected} wo={wo} onChanged={() => { loadDetail(); loadLists(); }} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => { setView(v); setStatusFilter(''); setWoFilter(''); }} style={{
              padding: '7px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: v === view ? 'var(--blue)' : 'var(--bg-card)',
              color: v === view ? '#fff' : 'var(--text-secondary)', fontWeight: v === view ? 600 : 400,
            }}>{v}</button>
          ))}
        </div>
        {view !== 'By Item' && (
          <>
            <select style={select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={select} value={woFilter} onChange={e => setWoFilter(e.target.value)}>
              <option value="">All Work Orders</option>
              {woNumbers.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </>
        )}
      </div>

      {view === 'By Item' ? (
        <ByItemView onRaised={loadLists} />
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
            {(!prs || !wos || (view === 'Orders' && !pos)) ? <Empty>Loading…</Empty> : !filtered.length ? (
              <Empty>{view === 'Requests' ? 'No purchase requests yet.' : 'No purchase orders in Zoho Books yet.'}</Empty>
            ) : view === 'Requests' ? (
              <Table
                head={['PR #', 'Work Order', 'Customer', 'Status', 'Lines', 'PO #s', 'Created']}
                rightFrom={4}
                rows={pageRows.map(pr => ({
                  key: pr.id, onClick: pr.woId ? () => setSelected(pr.woId) : undefined,
                  cells: [
                    <b style={{ color: 'var(--blue)' }}>{pr.prNumber}</b>, pr.woNumber || '— consolidated', pr.customerName || '—',
                    <StatusChip status={pr.status} />, pr.lines.length,
                    [...new Set(pr.lines.map(l => l.poNumber).filter(Boolean))].join(', ') || '—',
                    fmtDate(pr.createdAt),
                  ],
                }))}
              />
            ) : (
              <Table
                head={['PO #', 'Date', 'Vendor', 'Status', 'PR #', 'Work Order', 'Received', 'Billed', 'Total']}
                rightFrom={8}
                rows={pageRows.map(p => ({
                  key: p.id, onClick: () => setSelectedPo(p.id),
                  cells: [
                    <b style={{ color: 'var(--blue)' }}>
                      {p.number}
                      {p.locked && <span title="Has receives/bills — cannot be deleted" style={{ marginLeft: 6 }}>🔒</span>}
                    </b>,
                    p.date, p.vendorName || '—',
                    <StatusChip status={p.status} />,
                    p.prNumber || <span style={{ color: 'var(--text-muted)' }}>Books</span>, p.woNumber || '—',
                    nice(p.receivedStatus), nice(p.billedStatus),
                    fmtMoney(p.total),
                  ],
                }))}
              />
            )}
          </div>
          <GridFooter pager={pager} />
        </>
      )}
    </div>
  );
}

const th = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', textAlign: 'left',
};
const td = { padding: '8px 12px', fontSize: 13 };

/**
 * By-item view (CR-023, extended for Haresh items 9 + 12): one row per short raw
 * material across every open work order, or — grouped by work order — one row
 * per (item, WO) so the buyer can pick specific items from specific WOs.
 * Vendor is chosen per row, and a row can be split into extra (qty, vendor)
 * lines to order the same item from two vendors. Raise groups the lines by
 * vendor and creates one consolidated PR + draft PO per vendor.
 */
function ByItemView({ onRaised }) {
  const [items, setItems] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [grouping, setGrouping] = useState('item'); // 'item' | 'wo'
  const [checked, setChecked] = useState({});   // rowKey -> true
  const [qty, setQty] = useState({});           // rowKey -> edited qty
  const [vendor, setVendor] = useState({});     // rowKey -> vendorId
  const [splits, setSplits] = useState({});     // rowKey -> [{qty, vendorId}]
  const [open, setOpen] = useState({});         // item mode: breakdown expanded
  const [raising, setRaising] = useState(false);

  function load() {
    setItems(null);
    axios.get('/api/wo/purchase/shortfall-by-item')
      .then(({ data }) => setItems(data))
      .catch(err => { toast.error(err.response?.data?.error || 'Could not load the shortfall'); setItems([]); });
  }
  useEffect(() => {
    load();
    axios.get('/api/wo/vendors').then(({ data }) => setVendors(data)).catch(() => setVendors([]));
  }, []);

  function clearSelection() { setChecked({}); setQty({}); setVendor({}); setSplits({}); }

  // Row model shared by both groupings: key, item identity, default qty and the
  // breakdown entries the ordered qty is attributed to.
  const itemRows = useMemo(() => (items || []).map(i => ({
    key: i.rmItemId, rmItemId: i.rmItemId, rmName: i.rmName, item: i,
    defaultQty: i.totalQty,
    breakdown: (i.breakdown || []).filter(b => b.status === 'Pending'),
  })), [items]);
  const woGroups = useMemo(() => {
    const map = new Map();
    for (const i of (items || [])) for (const b of (i.breakdown || [])) {
      if (b.status !== 'Pending') continue;
      const woId = b.workOrderId || '';
      if (!map.has(woId)) map.set(woId, { woId, woNumber: b.woNumber, salesOrderNumber: b.salesOrderNumber, rows: [] });
      map.get(woId).rows.push({
        key: `${woId}|${i.rmItemId}`, rmItemId: i.rmItemId, rmName: i.rmName,
        defaultQty: b.qty, breakdown: [b],
      });
    }
    return [...map.values()];
  }, [items]);

  const { pageRows, pager } = usePager(grouping === 'item' ? itemRows : woGroups);
  const allRows = grouping === 'item' ? itemRows : woGroups.flatMap(g => g.rows);
  const rowQty = r => { const v = qty[r.key]; return v === undefined || v === '' ? r.defaultQty : Number(v) || 0; };

  // Every order line the buyer has built up: checked main rows + their splits.
  const lines = [];
  for (const r of allRows) {
    if (!checked[r.key]) continue;
    if (rowQty(r) > 0) lines.push({ row: r, qty: rowQty(r), vendorId: vendor[r.key] || '' });
    for (const sp of splits[r.key] || []) {
      if (Number(sp.qty) > 0) lines.push({ row: r, qty: Number(sp.qty), vendorId: sp.vendorId || '' });
    }
  }
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(lines.map(l => l.vendorId).filter(Boolean)).size;

  async function raise() {
    if (!lines.length) return toast.error('Select at least one line with a quantity above zero');
    if (lines.some(l => !l.vendorId)) return toast.error('Pick a vendor on every line');
    const byVendor = new Map();
    for (const l of lines) {
      if (!byVendor.has(l.vendorId)) byVendor.set(l.vendorId, []);
      byVendor.get(l.vendorId).push(l);
    }
    setRaising(true);
    try {
      // Sequential on purpose: the Catalyst dev tier throttles concurrent calls.
      for (const [vid, vLines] of byVendor) {
        const vName = vendors.find(v => String(v.id) === String(vid))?.name || '';
        const { data } = await axios.post('/api/wo/purchase/raise', {
          vendorId: vid, vendorName: vName,
          items: vLines.map(l => ({
            rmItemId: l.row.rmItemId, rmName: l.row.rmName, qty: l.qty, breakdown: l.row.breakdown,
          })),
        });
        toast.success(`${data.prNumber} raised · PO ${data.poNumber} for ${vName}`);
      }
      clearSelection();
      load();
      onRaised?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not raise the purchase order');
      load();
    } finally { setRaising(false); }
  }

  const vendorSelect = (value, onChange, enabled) => (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={!enabled}
      style={{ ...select, maxWidth: 180, borderColor: enabled && !value ? '#fca5a5' : 'var(--border)', opacity: enabled ? 1 : 0.5 }}>
      <option value="">Vendor…</option>
      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );

  const splitRows = r => (splits[r.key] || []).map((sp, idx) => (
    <tr key={`${r.key}-split-${idx}`} style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)' }}>
      <td style={td} />
      <td style={{ ...td, fontSize: 12, color: 'var(--text-muted)' }}>↳ split of {r.rmName || r.rmItemId}</td>
      <td style={td} />
      <td style={{ ...td, textAlign: 'right' }}>
        <input type="number" min="0" step="any" value={sp.qty} placeholder="0"
          onChange={e => setSplits(s => ({ ...s, [r.key]: s[r.key].map((x, j) => j === idx ? { ...x, qty: e.target.value } : x) }))}
          style={{ width: 80, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }} />
      </td>
      <td style={td}>
        {vendorSelect(sp.vendorId, v => setSplits(s => ({ ...s, [r.key]: s[r.key].map((x, j) => j === idx ? { ...x, vendorId: v } : x) })), true)}
      </td>
      <td style={{ ...td, textAlign: 'right' }}>
        <button onClick={() => setSplits(s => ({ ...s, [r.key]: s[r.key].filter((_, j) => j !== idx) }))}
          title="Remove this split" style={{ ...btn, padding: '2px 7px', color: '#b91c1c' }}>✕</button>
      </td>
    </tr>
  ));

  const mainRowCells = r => (
    <>
      <td style={td}>
        <input type="checkbox" checked={!!checked[r.key]} onChange={e => setChecked(c => ({ ...c, [r.key]: e.target.checked }))} />
      </td>
      <td style={{ ...td, fontWeight: 600 }}>{r.rmName || r.rmItemId}</td>
    </>
  );
  const qtyVendorCells = r => (
    <>
      <td style={{ ...td, textAlign: 'right' }}>
        {/* Always editable (CR): a draft-covered row defaults to 0 so the buyer
            can still order extra instead of hitting a locked '—'. */}
        <input type="number" min="0" step="any" value={qty[r.key] ?? r.defaultQty}
          onChange={e => setQty(q => ({ ...q, [r.key]: e.target.value }))}
          style={{ width: 80, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }} />
      </td>
      <td style={td}>{vendorSelect(vendor[r.key] || '', v => setVendor(m => ({ ...m, [r.key]: v })), !!checked[r.key])}</td>
    </>
  );
  const splitBtn = r => (
    <button
      onClick={() => setSplits(s => ({ ...s, [r.key]: [...(s[r.key] || []), { qty: '', vendorId: '' }] }))}
      disabled={!checked[r.key]}
      title="Order part of this quantity from another vendor"
      style={{ ...btn, padding: '3px 8px', fontSize: 12, opacity: checked[r.key] ? 1 : 0.4 }}>
      ⑂ Split
    </button>
  );

  if (!items) return <div style={{ flex: 1 }}><Empty>Loading shortfall…</Empty></div>;
  if (!items.length) return <div style={{ flex: 1 }}><Empty>No shortfall across open work orders — nothing to purchase.</Empty></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 20px 0' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Group by</span>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {[['item', 'Item'], ['wo', 'Work Order']].map(([k, label]) => (
            <button key={k} onClick={() => { if (grouping !== k) { setGrouping(k); clearSelection(); setOpen({}); } }} style={{
              padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: grouping === k ? 'var(--blue)' : 'var(--bg-card)',
              color: grouping === k ? '#fff' : 'var(--text-secondary)', fontWeight: grouping === k ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        <table className="grid-table" style={{ width: '100%', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 34 }} />
              <th style={th}>Item</th>
              {grouping === 'item' ? <th style={th}>Work order</th> : <th style={{ ...th, textAlign: 'right' }}>Needed</th>}
              <th style={{ ...th, textAlign: 'right' }}>Order qty</th>
              <th style={th}>Vendor</th>
              <th style={{ ...th, textAlign: 'right' }} />
            </tr>
          </thead>
          <tbody>
            {grouping === 'item' ? pageRows.map(r => (
              <RowGroup key={r.key}
                row={r} open={!!open[r.key]}
                onToggle={() => setOpen(o => ({ ...o, [r.key]: !o[r.key] }))}
                mainRowCells={mainRowCells} qtyVendorCells={qtyVendorCells} splitBtn={splitBtn} splitRows={splitRows}
              />
            )) : pageRows.map(g => (
              <WoGroup key={g.woId || 'none'}
                group={g}
                mainRowCells={mainRowCells} qtyVendorCells={qtyVendorCells} splitBtn={splitBtn} splitRows={splitRows}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* pinned raise bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {lines.length
            ? <><b>{lines.length}</b> line{lines.length > 1 ? 's' : ''} · <b>{totalUnits.toLocaleString('en-IN')}</b> units{vendorCount > 0 && <> · <b>{vendorCount}</b> vendor{vendorCount > 1 ? 's' : ''}</>}</>
            : 'Tick lines, set quantities and a vendor per line'}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={raise} disabled={raising || !lines.length}
          style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600, opacity: (raising || !lines.length) ? 0.5 : 1 }}>
          {raising ? 'Raising…' : vendorCount > 1 ? `Raise ${vendorCount} POs` : 'Raise PO'}
        </button>
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}

// Item-grouped row: the aggregate line plus an expandable per-WO breakdown.
function RowGroup({ row, open, onToggle, mainRowCells, qtyVendorCells, splitBtn, splitRows }) {
  const bd = row.item.breakdown || [];
  // Expansion lists only pending lines — the on-PO ones are already ordered
  // and just clutter the raise flow; the summary still counts them.
  const pending = bd.filter(b => b.status === 'Pending');
  const onPoCount = bd.length - pending.length;
  const poNumbers = [...new Set(bd.map(b => b.poNumber).filter(Boolean))].join(', ');
  return (
    <>
      <tr className="list-row" style={{ borderBottom: '1px solid var(--border)' }}>
        {mainRowCells(row)}
        <td style={td}>
          {pending.length > 0 && (
            <button onClick={onToggle} style={{ ...btn, padding: '3px 8px', fontSize: 12 }}>
              {pending.length} work order{pending.length > 1 ? 's' : ''} {open ? '▴' : '▾'}
            </button>
          )}
          <span style={{ marginLeft: pending.length ? 8 : 0, fontSize: 11, color: 'var(--text-muted)' }}>
            {[pending.length && `${pending.length} pending`, onPoCount && `${onPoCount} on PO`].filter(Boolean).join(' · ')}
            {poNumbers && ` · ${poNumbers}`}
          </span>
        </td>
        {qtyVendorCells(row)}
        <td style={{ ...td, textAlign: 'right' }}>{splitBtn(row)}</td>
      </tr>
      {splitRows(row)}
      {open && pending.map((b, idx) => (
        <tr key={idx} style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)' }}>
          <td style={td} />
          <td style={td} />
          <td style={{ ...td, fontSize: 12 }}>
            <b style={{ color: 'var(--blue)' }}>{b.woNumber || '—'}</b>
            {b.salesOrderNumber ? <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>SO {b.salesOrderNumber}</span> : null}
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{b.qty}</span>
          </td>
          <td style={td} />
          <td style={td}><ProcChip status={b.status} /></td>
          <td style={{ ...td, fontSize: 12, textAlign: 'right' }}>—</td>
        </tr>
      ))}
    </>
  );
}

// WO-grouped section: a header row for the work order, then one selectable row
// per pending item under it (Haresh item 9).
function WoGroup({ group, mainRowCells, qtyVendorCells, splitBtn, splitRows }) {
  return (
    <>
      <tr style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)' }}>
        <td colSpan={6} style={{ ...td, fontWeight: 700 }}>
          <span style={{ color: 'var(--blue)' }}>{group.woNumber || 'No work order'}</span>
          {group.salesOrderNumber && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>SO {group.salesOrderNumber}</span>}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>{group.rows.length} item{group.rows.length > 1 ? 's' : ''} pending</span>
        </td>
      </tr>
      {group.rows.map(r => (
        <FragmentRow key={r.key} row={r} mainRowCells={mainRowCells} qtyVendorCells={qtyVendorCells} splitBtn={splitBtn} splitRows={splitRows} />
      ))}
    </>
  );
}

function FragmentRow({ row, mainRowCells, qtyVendorCells, splitBtn, splitRows }) {
  return (
    <>
      <tr className="list-row" style={{ borderBottom: '1px solid var(--border)' }}>
        {mainRowCells(row)}
        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{row.defaultQty}</td>
        {qtyVendorCells(row)}
        <td style={{ ...td, textAlign: 'right' }}>{splitBtn(row)}</td>
      </tr>
      {splitRows(row)}
    </>
  );
}
