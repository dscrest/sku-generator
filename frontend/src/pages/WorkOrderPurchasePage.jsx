import { Fragment, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import PurchaseTab, { PoSplit, PrCard } from '../components/PurchaseTab.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, ProcChip, ZStatusChip, AccessNotice, btn, select } from '../components/woCommon.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import { fmtMoney, fmtDate } from '../format.js';

/**
 * Purchase Request page. Primary view is **By item** (CR-023): the shortfall of
 * every open work order aggregated per raw material, so the buyer ticks items,
 * picks one vendor, and raises a grouped PO in a single step — no drilling into
 * each work order. Requests/Orders keep the per-WO PurchaseTab and per-PO
 * PoSplit reachable. Layout per the CR-118 reference design (header + segmented
 * controls + search + floating selection bar), on the app's existing tokens.
 */
const VIEWS = ['By Item', 'Requests', 'Orders'];
const nice = s => String(s || '—').replace(/_/g, ' ');
const mono = v => <span style={{ fontFamily: 'var(--font-mono)' }}>{v}</span>;

const PRS_COLUMNS = [
  { key: 'prNumber', label: 'PR #', lock: true, render: pr => <b style={{ color: 'var(--blue)' }}>{pr.prNumber}</b> },
  { key: 'woNumber', label: 'Work Order', render: pr => pr.woNumber || '— consolidated' },
  { key: 'customerName', label: 'Customer', render: pr => pr.customerName || '—' },
  { key: 'status', label: 'Status', render: pr => <StatusChip status={pr.status} /> },
  { key: 'lines', label: 'Lines', align: 'right', render: pr => mono(pr.lines.length) },
  { key: 'poNumbers', label: 'PO #s', align: 'right', render: pr => mono([...new Set(pr.lines.map(l => l.poNumber).filter(Boolean))].join(', ') || '—') },
  { key: 'createdAt', label: 'Created', align: 'right', render: pr => mono(fmtDate(pr.createdAt)) },
];

const POS_COLUMNS = [
  { key: 'woNumber', label: 'Work Order', render: p => <b style={{ color: 'var(--blue)' }}>{p.woNumber || '—'}</b> },
  { key: 'date', label: 'Date', render: p => p.date },
  { key: 'vendorName', label: 'Vendor', render: p => p.vendorName || '—' },
  { key: 'status', label: 'Status', render: p => <StatusChip status={p.status} /> },
  { key: 'prNumber', label: 'PR #', render: p => p.prNumber || <span style={{ color: 'var(--text-muted)' }}>Books</span> },
  {
    key: 'number', label: 'PO #', lock: true, render: p => (
      <b style={{ color: 'var(--blue)' }}>
        {p.number}
        {p.locked && <span title="Has receives/bills — cannot be deleted" style={{ marginLeft: 6 }}>🔒</span>}
      </b>
    ),
  },
  { key: 'receivedStatus', label: 'Received', render: p => <ZStatusChip status={p.receivedStatus} /> },
  { key: 'billedStatus', label: 'Billed', render: p => <ZStatusChip status={p.billedStatus} /> },
  { key: 'total', label: 'Total', align: 'right', render: p => mono(fmtMoney(p.total)) },
];

// By Item is a hand-rolled grid (group bands, expandable breakdown, split
// sub-rows — beyond DataTable), but its header/cell order and show/hide still
// come from the shared chooser via these column defs. The middle column swaps
// with the grouping.
const SHORTFALL_ITEM_COLS = [
  { key: 'sel', label: 'Select', lock: true, width: 34 },
  { key: 'item', label: 'Item', lock: true },
  { key: 'workOrders', label: 'Purchase Requests' },
  { key: 'orderQty', label: 'Order Qty', align: 'right' },
  { key: 'extra', label: 'Extra', align: 'right' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'actions', label: 'Split', lock: true, align: 'right' },
];
const SHORTFALL_WO_COLS = SHORTFALL_ITEM_COLS.map(c => c.key === 'workOrders' ? { key: 'needed', label: 'Needed', align: 'right' } : c);

// Shared checkbox style for the By Item grid.
const ck = { width: 15, height: 15, accentColor: 'var(--blue)', cursor: 'pointer', verticalAlign: 'middle' };

// Reference-design controls (segmented pill, search, borderless vendor select),
// recolored to the app tokens. Page-local on purpose — woCommon stays shared.
const segTrack = {
  display: 'flex', gap: 2, background: 'var(--bg-page)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: 3,
};
const segBtn = on => ({
  border: 0, cursor: 'pointer', padding: '5px 12px', borderRadius: 6, fontSize: 13,
  fontWeight: on ? 600 : 500,
  background: on ? 'var(--blue)' : 'transparent',
  color: on ? '#fff' : 'var(--text-secondary)',
});
const PAGE_CSS = `
.prq-search{margin-left:auto;width:260px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:var(--bg-page);font-family:inherit}
.prq-search:focus{border-color:var(--blue);background:var(--bg-card)}
.prq-vendor{width:100%;max-width:180px;padding:6px 8px;border:1px solid transparent;border-radius:6px;font-size:13px;background:transparent;cursor:pointer;outline:none;color:var(--text-primary);font-family:inherit}
.prq-vendor:hover:not(:disabled){border-color:var(--border-mid);background:var(--bg-card)}
.prq-vendor:focus{border-color:var(--blue);background:var(--bg-card)}
`;

export default function WorkOrderPurchasePage() {
  const navigate = useNavigate();
  const [wos, setWos] = useState(null);
  const [prs, setPrs] = useState(null);
  const [pos, setPos] = useState(null);
  const [view, setView] = useState(VIEWS[0]);
  const [statusFilter, setStatusFilter] = useState('');
  const [woFilter, setWoFilter] = useState('');
  const [query, setQuery] = useState('');
  const [grouping, setGrouping] = useState('item'); // By Item: 'item' | 'wo'
  const [selected, setSelected] = useState(null);   // wo id → PurchaseTab
  const [selectedPo, setSelectedPo] = useState(null); // po id → PoSplit
  const [selectedPr, setSelectedPr] = useState(null); // pr id → PrCard editor (works for consolidated PRs too)
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
  useEffect(() => { if (selectedPr && prs === null) loadPrs(); /* eslint-disable-next-line */ }, [selectedPr]);

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

  const q = query.trim().toLowerCase();
  const gridRows = view === 'Requests' ? (prs || []) : view === 'Orders' ? (pos || []) : [];
  const statuses = [...new Set(gridRows.map(r => r.status).filter(Boolean))];
  const woNumbers = [...new Set(gridRows.map(r => r.woNumber).filter(Boolean))];
  const filtered = gridRows.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!woFilter || r.woNumber === woFilter) &&
    (!q || (view === 'Requests'
      ? [r.prNumber, r.woNumber, r.customerName]
      : [r.number, r.vendorName, r.woNumber, r.prNumber])
      .filter(Boolean).join(' ').toLowerCase().includes(q)));
  const { pageRows, pager } = usePager(filtered);

  // One chooser-backed grid per view; the key follows the active view so prefs
  // load lazily (one GET per grid per session).
  const [gridKey, gridColumns] = view === 'By Item'
    ? ['wo.purchase.shortfall', grouping === 'item' ? SHORTFALL_ITEM_COLS : SHORTFALL_WO_COLS]
    : view === 'Requests' ? ['wo.purchase.prs', PRS_COLUMNS] : ['wo.purchase.pos', POS_COLUMNS];
  const { cols, chooser } = useGridColumns(gridKey, gridColumns);

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

  // PR editor — after the PoSplit block on purpose: a PO opened from inside the
  // editor wins, and closing it falls back here.
  if (selectedPr) {
    const pr = (prs || []).find(p => String(p.id) === String(selectedPr));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <button onClick={() => setSelectedPr(null)} style={btn}>← All purchases</button>
          <b style={{ fontSize: 14 }}>{pr?.prNumber || ''}</b>
          {pr && <StatusChip status={pr.status} />}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {pr ? (pr.woNumber ? `${pr.customerName || ''}${pr.customerName ? ' · ' : ''}${pr.woNumber}` : 'Consolidated — multiple work orders') : ''}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {prs === null ? <Empty>Loading…</Empty>
            : !pr ? <Empty>Purchase request not found.</Empty>
              : <PrEdit pr={pr} onChanged={loadLists} onOpenPo={setSelectedPo} />}
        </div>
      </div>
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
      <style>{PAGE_CSS}</style>

      {/* toolbar: view switcher + view controls + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={segTrack}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => { setView(v); setStatusFilter(''); setWoFilter(''); setQuery(''); }} style={segBtn(v === view)}>{v}</button>
          ))}
        </div>
        {view === 'By Item' ? (
          <>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 6 }}>Group by</span>
            <div style={segTrack}>
              {[['item', 'Item'], ['wo', 'Work Order']].map(([k, label]) => (
                <button key={k} onClick={() => setGrouping(k)} style={segBtn(grouping === k)}>{label}</button>
              ))}
            </div>
          </>
        ) : (
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
        <input
          className="prq-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={view === 'By Item' ? 'Search item, WO, vendor…' : view === 'Requests' ? 'Search PR, WO, customer…' : 'Search PO, vendor, WO…'}
        />
        <ColumnChooser chooser={chooser} />
      </div>

      {view === 'By Item' ? (
        <ByItemView onRaised={loadLists} onOpenPr={setSelectedPr} query={q} grouping={grouping} cols={cols} />
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
            {(!prs || !wos || (view === 'Orders' && !pos)) ? <Empty>Loading…</Empty> : !filtered.length ? (
              <Empty>{q || statusFilter || woFilter ? 'No matches.' : view === 'Requests' ? 'No purchase requests yet.' : 'No purchase orders in Zoho Books yet.'}</Empty>
            ) : view === 'Requests' ? (
              <div style={{ marginTop: 12 }}>
                <DataTable cols={cols} rows={pageRows} onRowClick={pr => pr.woId ? setSelected(pr.woId) : setSelectedPr(pr.id)} />
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <DataTable cols={cols} rows={pageRows} onRowClick={p => setSelectedPo(p.id)} />
              </div>
            )}
          </div>
          <GridFooter pager={pager} />
        </>
      )}
    </div>
  );
}

// Uppercase reference-style grid header.
const th = {
  padding: '10px 12px', fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', whiteSpace: 'nowrap', textAlign: 'left',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const td = { padding: '8px 12px', fontSize: 13, height: 30 };

/**
 * By-item view (CR-023, extended for Haresh items 9 + 12): one row per short raw
 * material across every open work order, or — grouped by work order — one row
 * per (item, WO) so the buyer can pick specific items from specific WOs.
 * Vendor is chosen per row, and a row can be split into extra (qty, vendor)
 * lines to order the same item from two vendors. Raise groups the lines by
 * vendor and creates one consolidated PR + draft PO per vendor.
 */
// Vendor list + PrCard for one PR outside any work order (a consolidated PR
// has none) — the same card the per-WO PurchaseTab renders.
function PrEdit({ pr, onChanged, onOpenPo }) {
  const [vendors, setVendors] = useState([]);
  const loadVendors = () => axios.get('/api/wo/vendors').then(({ data }) => setVendors(data)).catch(() => setVendors([]));
  useEffect(() => { loadVendors(); }, []);
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      <PrCard pr={pr} vendors={vendors} onLoadVendors={loadVendors} onChanged={onChanged} onOpenPo={onOpenPo} />
    </div>
  );
}

function ByItemView({ onRaised, onOpenPr, query, grouping, cols }) {
  const [items, setItems] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [checked, setChecked] = useState({});   // rowKey -> true
  const [qty, setQty] = useState({});           // rowKey -> edited qty
  const [extra, setExtra] = useState({});       // rowKey -> extra qty (plain, no SO)
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

  function clearSelection() { setChecked({}); setQty({}); setExtra({}); setVendor({}); setSplits({}); }

  // Sheet-style editing (CR): every cell is always editable; touching a row's
  // qty/extra/vendor/split ticks it, so the buyer fills the grid in one pass
  // and raises once. Untick still works to drop a row from the raise.
  const check = key => setChecked(c => c[key] ? c : { ...c, [key]: true });

  // Excel-style column walk: Enter moves to the next cell in the same column,
  // ArrowUp/Down too — but only on inputs, arrows keep their native meaning in
  // selects. Delegated from the <table>; cells opt in via data-nav.
  function navKeyDown(e) {
    const col = e.target.dataset?.nav;
    if (!col) return;
    const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    if (e.key !== 'Enter' && !arrow) return;
    if (arrow && e.target.tagName !== 'INPUT') return;
    if (arrow) e.preventDefault(); // never spin the number, even at the edges
    const cells = [...e.currentTarget.querySelectorAll(`[data-nav="${col}"]`)];
    const next = cells[cells.indexOf(e.target) + (e.key === 'ArrowUp' ? -1 : 1)];
    if (next) { next.focus(); if (next.select) next.select(); }
  }

  // Row keys differ per grouping — a grouping switch invalidates the selection.
  useEffect(() => { clearSelection(); setOpen({}); }, [grouping]);

  const vendorName = id => vendors.find(v => String(v.id) === String(id))?.name || '';

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
        key: `${woId}|${i.rmItemId}`, rmItemId: i.rmItemId, rmName: i.rmName, item: i,
        defaultQty: b.qty, breakdown: [b],
      });
    }
    return [...map.values()];
  }, [items]);

  // Search narrows what is shown, never what is selected — a checked row that
  // no longer matches still raises.
  const matches = r => !query ||
    [r.rmName, r.rmItemId, ...(r.breakdown || []).map(b => b.woNumber), vendorName(vendor[r.key])]
      .filter(Boolean).join(' ').toLowerCase().includes(query);
  const visibleItemRows = itemRows.filter(matches);
  const visibleWoGroups = woGroups
    .map(g => (query ? { ...g, rows: g.rows.filter(matches) } : g))
    .filter(g => g.rows.length);

  const { pageRows, pager } = usePager(grouping === 'item' ? visibleItemRows : visibleWoGroups);
  const allRows = grouping === 'item' ? itemRows : woGroups.flatMap(g => g.rows);
  const visibleRows = grouping === 'item' ? visibleItemRows : visibleWoGroups.flatMap(g => g.rows);
  const rowQty = r => { const v = qty[r.key]; return v === undefined || v === '' ? r.defaultQty : Number(v) || 0; };
  const rowExtra = r => Number(extra[r.key]) || 0;

  const allChecked = visibleRows.length > 0 && visibleRows.every(r => checked[r.key]);
  const toggleAll = () => setChecked(c => {
    const next = { ...c };
    visibleRows.forEach(r => { next[r.key] = !allChecked; });
    return next;
  });
  const toggleGroup = g => {
    const all = g.rows.every(r => checked[r.key]);
    setChecked(c => {
      const next = { ...c };
      g.rows.forEach(r => { next[r.key] = !all; });
      return next;
    });
  };

  // Every order line the buyer has built up: checked main rows + their extras
  // + their splits. Extra raises as its own unattributed entry (empty
  // breakdown) so its PO line carries no SO reference in Books, while the
  // Order-qty lines keep their per-SO cf_so_no (CR-078/119).
  const lines = [];
  for (const r of allRows) {
    if (!checked[r.key]) continue;
    if (rowQty(r) > 0) lines.push({ row: r, qty: rowQty(r), vendorId: vendor[r.key] || '' });
    if (rowExtra(r) > 0) lines.push({ row: r, qty: rowExtra(r), vendorId: vendor[r.key] || '', extra: true });
    for (const sp of splits[r.key] || []) {
      if (Number(sp.qty) > 0) lines.push({ row: r, qty: Number(sp.qty), vendorId: sp.vendorId || '' });
    }
  }
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(lines.map(l => l.vendorId).filter(Boolean)).size;
  // 'Requested' breakdown entries carry the PR number in poNumber (workorder.js).
  const selPrNumbers = [...new Set(lines.flatMap(l => l.row.item?.breakdown || [])
    .filter(b => b.status === 'Requested').map(b => b.poNumber).filter(Boolean))];

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
            rmItemId: l.row.rmItemId, rmName: l.row.rmName, qty: l.qty,
            breakdown: l.extra ? [] : l.row.breakdown,
            isExtra: !!l.extra,
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

  // hint: red border once the row is in the raise but has no vendor yet.
  const vendorSelect = (value, onChange, hint) => (
    <select value={value} onChange={e => onChange(e.target.value)} data-nav="vendor"
      className="prq-vendor"
      style={hint && !value ? { borderColor: '#fca5a5', background: 'var(--bg-card)' } : undefined}>
      <option value="">Vendor…</option>
      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );

  const qtyStyle = on => ({
    width: 72, padding: '6px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)',
    borderRadius: 6, outline: 'none', fontVariantNumeric: 'tabular-nums',
    border: `1px solid ${on ? 'var(--blue-border)' : 'var(--border)'}`,
    background: on ? 'var(--blue-light)' : 'var(--bg-page)',
    color: on ? 'var(--blue)' : 'inherit', fontWeight: on ? 500 : 400,
  });

  const splitBtn = r => (
    <button
      onClick={() => { check(r.key); setSplits(s => ({ ...s, [r.key]: [...(s[r.key] || []), { qty: '', vendorId: '' }] })); }}
      title="Order part of this quantity from another vendor"
      style={{ ...btn, padding: '3px 8px', fontSize: 12 }}>
      ⑂ Split
    </button>
  );

  // Item grouping: PR-number links (draft PRs the item is on — breakdown
  // 'Requested' entries carry prId + the PR number in poNumber) and an
  // "Associated WO" toggle that expands the pending per-WO breakdown.
  const woSummary = r => {
    const bd = r.item?.breakdown || [];
    const prLinks = [...new Map(bd.filter(b => b.status === 'Requested' && b.prId)
      .map(b => [b.prId, b.poNumber])).entries()];
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {prLinks.length ? prLinks.map(([id, num]) => (
          <button key={id} onClick={() => onOpenPr(id)} title="Open purchase request"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, fontSize: 12 }}>
            {num}
          </button>
        )) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
        {r.breakdown.length > 0 && (
          <button onClick={() => setOpen(o => ({ ...o, [r.key]: !o[r.key] }))} style={{ ...btn, padding: '3px 8px', fontSize: 12 }}>
            Associated WO {open[r.key] ? '▴' : '▾'}
          </button>
        )}
      </span>
    );
  };

  // Every row type renders per column key, so the chooser's hide/reorder holds
  // across main rows, split rows, breakdown rows and WO bands alike.
  const rowCells = r => cols.map(c => {
    switch (c.key) {
      case 'sel': return (
        <td key="sel" style={{ ...td, textAlign: 'center' }}>
          <input type="checkbox" checked={!!checked[r.key]} onChange={e => setChecked(m => ({ ...m, [r.key]: e.target.checked }))} style={ck} />
        </td>
      );
      case 'item': return <td key="item" style={{ ...td, fontWeight: 500 }}>{r.rmName || r.rmItemId}</td>;
      case 'workOrders': return <td key="workOrders" style={td}>{woSummary(r)}</td>;
      case 'needed': return <td key="needed" style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.defaultQty}</td>;
      case 'orderQty': return (
        <td key="orderQty" style={{ ...td, textAlign: 'right' }}>
          {/* Always editable (CR): a draft-covered row defaults to 0 so the buyer
              can still order extra instead of hitting a locked '—'. */}
          <input type="number" min="0" step="any" value={qty[r.key] ?? r.defaultQty} data-nav="qty"
            onChange={e => { check(r.key); setQty(q => ({ ...q, [r.key]: e.target.value })); }}
            style={qtyStyle(!!checked[r.key])} />
        </td>
      );
      case 'extra': return (
        <td key="extra" style={{ ...td, textAlign: 'right' }}>
          {/* Plain top-up: raised as its own PO line without an SO reference. */}
          <input type="number" min="0" step="any" value={extra[r.key] ?? ''} placeholder="0" data-nav="extra"
            title="Extra quantity — ordered without an SO reference"
            onChange={e => { check(r.key); setExtra(x => ({ ...x, [r.key]: e.target.value })); }}
            style={qtyStyle(rowExtra(r) > 0)} />
        </td>
      );
      case 'vendor': return <td key="vendor" style={td}>{vendorSelect(vendor[r.key] || '', v => { check(r.key); setVendor(m => ({ ...m, [r.key]: v })); }, !!checked[r.key])}</td>;
      case 'actions': return <td key="actions" style={{ ...td, textAlign: 'right' }}>{splitBtn(r)}</td>;
      default: return <td key={c.key} style={td} />;
    }
  });

  const splitRows = r => (splits[r.key] || []).map((sp, idx) => (
    <tr key={`${r.key}-split-${idx}`} style={{ background: 'var(--bg-page)' }}>
      {cols.map(c => {
        switch (c.key) {
          case 'item': return <td key="item" style={{ ...td, fontSize: 12, color: 'var(--text-muted)' }}>↳ split of {r.rmName || r.rmItemId}</td>;
          case 'orderQty': return (
            <td key="orderQty" style={{ ...td, textAlign: 'right' }}>
              <input type="number" min="0" step="any" value={sp.qty} placeholder="0" data-nav="qty"
                onChange={e => setSplits(s => ({ ...s, [r.key]: s[r.key].map((x, j) => j === idx ? { ...x, qty: e.target.value } : x) }))}
                style={qtyStyle(true)} />
            </td>
          );
          case 'vendor': return (
            <td key="vendor" style={td}>
              {vendorSelect(sp.vendorId, v => setSplits(s => ({ ...s, [r.key]: s[r.key].map((x, j) => j === idx ? { ...x, vendorId: v } : x) })), true)}
            </td>
          );
          case 'actions': return (
            <td key="actions" style={{ ...td, textAlign: 'right' }}>
              <button onClick={() => setSplits(s => ({ ...s, [r.key]: s[r.key].filter((_, j) => j !== idx) }))}
                title="Remove this split" style={{ ...btn, padding: '2px 7px', color: '#b91c1c' }}>✕</button>
            </td>
          );
          default: return <td key={c.key} style={td} />;
        }
      })}
    </tr>
  ));

  // Item grouping: expanded per-WO breakdown rows (pending lines only).
  const breakdownRows = r => (r.breakdown || []).map((b, idx) => (
    <tr key={idx} style={{ background: 'var(--bg-page)' }}>
      {cols.map(c => {
        switch (c.key) {
          case 'workOrders': return (
            <td key="workOrders" style={{ ...td, fontSize: 12 }}>
              <b style={{ color: 'var(--blue)' }}>{b.woNumber || '—'}</b>
              {b.salesOrderNumber ? <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>SO {b.salesOrderNumber}</span> : null}
              <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{b.qty}</span>
            </td>
          );
          case 'vendor': return <td key="vendor" style={td}><ProcChip status={b.status} /></td>;
          case 'actions': return <td key="actions" style={{ ...td, fontSize: 12, textAlign: 'right' }}>—</td>;
          default: return <td key={c.key} style={td} />;
        }
      })}
    </tr>
  ));

  // WO-grouped section band (Haresh item 9): group checkbox, label, muted sub,
  // right-aligned units total under the last column.
  const bandRow = g => (
    <tr style={{ background: 'var(--bg-page)' }}>
      {cols.map(c => {
        switch (c.key) {
          case 'sel': return (
            <td key="sel" style={{ ...td, textAlign: 'center' }}>
              <input type="checkbox" checked={g.rows.every(r => checked[r.key])} onChange={() => toggleGroup(g)}
                title="Select every item in this work order" style={ck} />
            </td>
          );
          case 'item': return (
            <td key="item" style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--blue)' }}>{g.woNumber || 'No work order'}</span>
              {g.salesOrderNumber && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>SO {g.salesOrderNumber}</span>}
              <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>{g.rows.length} item{g.rows.length > 1 ? 's' : ''} pending</span>
            </td>
          );
          case 'actions': return (
            <td key="actions" style={{ ...td, textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {g.rows.reduce((s, r) => s + rowQty(r) + rowExtra(r), 0).toLocaleString('en-IN')}
            </td>
          );
          default: return <td key={c.key} style={td} />;
        }
      })}
    </tr>
  );

  if (!items) return <div style={{ flex: 1 }}><Empty>Loading shortfall…</Empty></div>;
  if (!items.length) return <div style={{ flex: 1 }}><Empty>No shortfall across open work orders — nothing to purchase.</Empty></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!visibleRows.length ? (
          <Empty>No items match your search.</Empty>
        ) : (
          <table className="grid-table" style={{ width: '100%', marginTop: 12 }} onKeyDown={navKeyDown}>
            <thead>
              <tr>
                {cols.map(c => c.key === 'sel' ? (
                  <th key="sel" style={{ ...th, width: 34, textAlign: 'center' }}>
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      title="Select all visible rows" style={ck} />
                  </th>
                ) : (
                  <th key={c.key} style={{ ...th, textAlign: c.align === 'right' ? 'right' : 'left', ...(c.key === 'extra' ? { color: 'var(--blue)' } : null) }}>
                    {c.key === 'actions' ? null : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouping === 'item' ? pageRows.map(r => (
                <Fragment key={r.key}>
                  <tr className="list-row" style={{ background: checked[r.key] ? 'var(--blue-light)' : undefined }}>{rowCells(r)}</tr>
                  {splitRows(r)}
                  {open[r.key] && breakdownRows(r)}
                </Fragment>
              )) : pageRows.map(g => (
                <Fragment key={g.woId || 'none'}>
                  {bandRow(g)}
                  {g.rows.map(r => (
                    <Fragment key={r.key}>
                      <tr className="list-row" style={{ background: checked[r.key] ? 'var(--blue-light)' : undefined }}>{rowCells(r)}</tr>
                      {splitRows(r)}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* floating selection bar (reference design) — shows once lines exist */}
      {lines.length > 0 && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 68, transform: 'translateX(-50%)', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 18, padding: '12px 12px 12px 20px',
          background: 'var(--text-primary)', color: '#fff', borderRadius: 14,
          boxShadow: '0 12px 32px rgba(0,0,0,0.25)', fontSize: 13.5, whiteSpace: 'nowrap',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>
              {lines.length} line{lines.length > 1 ? 's' : ''} selected · {totalUnits.toLocaleString('en-IN')} units
            </span>
            <span style={{ fontSize: 12, color: 'var(--border-mid)' }}>
              {vendorCount > 0
                ? `Creates ${vendorCount} purchase order${vendorCount > 1 ? 's' : ''}`
                : 'Pick a vendor on every line'}
              {selPrNumbers.length > 0 && ` · On request: ${selPrNumbers.join(', ')}`}
            </span>
          </div>
          <button onClick={clearSelection}
            style={{ border: 0, background: 'transparent', color: 'var(--border-mid)', cursor: 'pointer', fontSize: 13, padding: 8 }}>
            Clear
          </button>
          <button onClick={raise} disabled={raising}
            style={{
              border: 0, cursor: 'pointer', padding: '10px 18px', borderRadius: 9,
              background: 'var(--blue)', color: '#fff', fontSize: 13.5, fontWeight: 600,
              opacity: raising ? 0.6 : 1,
            }}>
            {raising ? 'Raising…' : vendorCount > 1 ? `Raise ${vendorCount} POs` : 'Raise PO'}
          </button>
        </div>
      )}

      <GridFooter pager={pager} />
    </div>
  );
}

