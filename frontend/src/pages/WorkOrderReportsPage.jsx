import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice, Table, select, thStyle, cell } from '../components/woCommon.jsx';

/**
 * SO-BOM, shortfall and item-pipeline reports (FR-ADO-009). All read only our
 * own tables, so they cost nothing in Zoho API calls however many projects
 * they span.
 */
const VIEWS = ['SO–BOM status', 'Shortfall / pending', 'Item pipeline', 'Reconciliation', 'Warehouse stock'];

export default function WorkOrderReportsPage() {
  // ?view= keeps the active report across refreshes (CR-038).
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState(VIEWS[Number(searchParams.get('view'))] || VIEWS[0]);
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      const i = VIEWS.indexOf(view);
      i > 0 ? p.set('view', String(i)) : p.delete('view');
      return p;
    }, { replace: true });
  }, [view, setSearchParams]);
  const [rows, setRows] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const [woFilter, setWoFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [filterOpts, setFilterOpts] = useState(null); // { wos, vendors }
  // Warehouse-stock view filters — all client-side over the full row set.
  const [whFilter, setWhFilter] = useState(''); // warehouseName, '' = all
  const [stockFilter, setStockFilter] = useState('all'); // all | in | low | zero
  const [hideZero, setHideZero] = useState(false); // "Ignore items with 0 stock"
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(''); // "N/total" while a chunked sync runs
  const [refreshTick, setRefreshTick] = useState(0); // bump to re-pull after a sync
  const [busyItem, setBusyItem] = useState(null); // itemId being live-refreshed
  const [groupSync, setGroupSync] = useState(null); // { key, done, total } while a multi-item sync walks
  const navigate = useNavigate();

  useEffect(() => {
    setRows(null);
    const url = view === VIEWS[0] ? '/api/wo/reports/so-bom'
      : view === VIEWS[1] ? '/api/wo/reports/shortfall'
      : view === VIEWS[3] ? `/api/wo/reports/reconciliation?workOrderId=${woFilter}`
      : view === VIEWS[4] ? '/api/wo/reports/warehouse-stock'
      : `/api/wo/reports/item-pipeline?workOrderId=${woFilter}&vendorId=${vendorFilter}`;
    axios.get(url)
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load the report');
      });
  }, [view, woFilter, vendorFilter, refreshTick]);

  // Stock sync, then re-pull the report (Warehouse stock view). Default is
  // incremental — only items changed since the last sync (one quick call).
  // force=true re-pulls the whole catalog, paged: each call clears the 30s
  // ceiling, so loop chunks until done.
  async function syncAll(force = false) {
    setSyncing(true);
    try {
      let offset = 0, done = false;
      while (!done) {
        const url = `/api/wo/refresh?full=1${force ? '&force=1' : ''}&offset=${offset}`;
        const { data } = await axios.post(url);
        offset = data.nextOffset;
        done = data.done;
        setSyncProgress(data.total ? `${Math.min(offset, data.total)}/${data.total}` : '');
      }
      setRefreshTick(t => t + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Stock sync failed');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  }

  // Refresh one item's stock straight from Zoho (one call) and patch its grid
  // entry in place — no report re-pull. Available recomputes per the WO logic:
  // Main (Head Office) stock − Issue-warehouse stock, org total when no breakdown.
  async function refreshOne(itemId) {
    setBusyItem(itemId);
    try {
      const { data } = await axios.post(`/api/wo/items/${itemId}/sync-stock`);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      setRows(prev => {
        if (!prev?.items) return prev;
        const stocks = Object.fromEntries((data.warehouses || []).map(w => [String(w.warehouseId), w.stockOnHand]));
        const available = Object.keys(stocks).length
          ? (stocks[prev.mainWarehouseId] || 0) - (stocks[prev.issueWarehouseId] || 0)
          : data.stockOnHand;
        return { ...prev, items: prev.items.map(it => String(it.itemId) !== String(itemId) ? it
          : { ...it, stocks, total: data.stockOnHand, available, syncedAt: now }) };
      });
    } finally {
      setBusyItem(null);
    }
  }
  const refreshItem = (itemId) =>
    refreshOne(itemId).then(() => toast.success('Stock refreshed'))
      .catch(err => toast.error(err.response?.data?.error || 'Could not refresh this item'));

  // Walk a set of items through refreshOne sequentially — the per-group "Sync"
  // and the toolbar "Sync visible". One Zoho call per item, only on click.
  async function syncItems(itemIds, key) {
    if (!itemIds.length || groupSync) return;
    setGroupSync({ key, done: 0, total: itemIds.length });
    let failed = 0;
    for (let i = 0; i < itemIds.length; i++) {
      try { await refreshOne(itemIds[i]); } catch { failed++; }
      setGroupSync({ key, done: i + 1, total: itemIds.length });
    }
    setGroupSync(null);
    failed ? toast.error(`${failed} of ${itemIds.length} items failed to sync`)
      : toast.success(`${itemIds.length} item${itemIds.length === 1 ? '' : 's'} synced`);
  }

  // WO / vendor filter options, fetched once when a filterable view first opens.
  useEffect(() => {
    if ((view !== VIEWS[2] && view !== VIEWS[3]) || filterOpts) return;
    Promise.all([axios.get('/api/wo'), axios.get('/api/wo/vendors')])
      .then(([wos, vendors]) => setFilterOpts({ wos: wos.data, vendors: vendors.data }))
      .catch(() => setFilterOpts({ wos: [], vendors: [] }));
  }, [view, filterOpts]);

  // Warehouse-stock filters are client-side; other views filter server-side.
  // VIEWS[4] payload is { warehouses, mainWarehouseId, issueWarehouseId, items }
  // — one flat entry per item with a per-warehouse stocks map. The qty filter
  // evaluates the selected warehouse's column, or the org total when "All".
  const whMeta = view === VIEWS[4] && rows && !Array.isArray(rows) ? rows : null;
  const displayed = view !== VIEWS[4] ? (rows || []) : (whMeta?.items || []).filter(it => {
    const basis = whFilter ? (it.stocks[whFilter] || 0) : it.total;
    return (!q || `${it.itemName} ${it.sku || ''}`.toLowerCase().includes(q.toLowerCase()))
      && (stockFilter === 'all' ? true
        : stockFilter === 'in' ? basis > 0
        : stockFilter === 'low' ? basis > 0 && basis < 10
        : basis === 0)
      && (!hideZero || it.total > 0);
  });
  const { pageRows, pager } = usePager(displayed);
  // CSV wants flat cells, so the pivot's stocks map spreads into per-warehouse columns.
  const csvRows = view !== VIEWS[4] ? displayed : displayed.map(it => ({
    itemName: it.itemName, sku: it.sku || '',
    ...Object.fromEntries((whMeta?.warehouses || []).map(w => [w.name, it.stocks[w.id] ?? 0])),
    available: it.available, total: it.total, syncedAt: it.syncedAt || '',
  }));
  if (blocked) return <AccessNotice kind={blocked} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => { if (v !== view) { setRows(null); setView(v); } }} style={{
              padding: '7px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: v === view ? 'var(--blue)' : 'var(--bg-card)',
              color: v === view ? '#fff' : 'var(--text-secondary)', fontWeight: v === view ? 600 : 400,
            }}>{v}</button>
          ))}
        </div>
        {(view === VIEWS[2] || view === VIEWS[3]) && (
          <>
            <select style={select} value={woFilter} onChange={e => setWoFilter(e.target.value)}>
              <option value="">All work orders</option>
              {(filterOpts?.wos || []).map(w => <option key={w.id} value={w.id}>{w.woNumber}</option>)}
            </select>
            {view === VIEWS[2] && (
              <select style={select} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
                <option value="">All vendors</option>
                {(filterOpts?.vendors || []).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
          </>
        )}
        {view === VIEWS[4] && (
          <input style={{ ...select, minWidth: 220 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Search item name or SKU…" />
        )}
        <div style={{ flex: 1 }} />
        {view === VIEWS[4] && (
          <>
            <button onClick={() => syncItems([...new Set(displayed.map(r => r.itemId))], '__visible__')}
              disabled={syncing || !!groupSync || !displayed.length} style={btn}
              title="Live-refresh every item currently shown (one Zoho call each)">
              {groupSync?.key === '__visible__' ? `Syncing… ${groupSync.done}/${groupSync.total}` : '⟳ Sync visible'}
            </button>
            <button onClick={() => syncAll(true)} disabled={syncing || !!groupSync}
              style={{ ...btn, color: ACCENT, borderColor: ACCENT }} title="Re-pull every item from Zoho (slower)">
              {syncing ? `Syncing… ${syncProgress}` : '↻ Full resync'}
            </button>
          </>
        )}
        <button onClick={() => download(view, csvRows)} disabled={!csvRows.length} style={btn}>⬇ Export CSV</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !(view === VIEWS[4] ? (whMeta?.items || []) : rows).length ? (
          <Empty>{view === VIEWS[0] ? 'No work orders yet.'
            : view === VIEWS[1] ? 'Nothing is short — every open work order is covered.'
            : view === VIEWS[3] ? 'No work order lines to reconcile yet.'
            : view === VIEWS[4] ? 'No stock synced yet — run “Sync all stock”.'
            : 'No purchase request lines match.'}</Empty>
        ) : view === VIEWS[0] ? (
          <Table
            head={['Work order', 'Sales order', 'Customer', 'Status', 'Items', 'Required', 'Reserved', 'Issued', 'On order', 'Short']}
            rightFrom={4}
            rows={pageRows.map(r => ({
              key: r.id, onClick: () => navigate(`/wo/${r.id}`),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{r.woNumber}</b>, r.salesOrderNumber, r.customerName,
                <StatusChip status={r.status} />, r.items, r.required, r.reserved, r.issued, r.ordered,
                r.shortItems ? <span style={{ color: '#dc2626', fontWeight: 700 }}>{r.shortItems}</span> : '—',
              ],
            }))}
          />
        ) : view === VIEWS[2] ? (
          <Table
            head={['Item', 'Vendors', 'Requested', 'On draft PR', 'On draft PO', 'On open PO', 'Received', 'Billed']}
            rightFrom={2}
            rows={pageRows.map(r => ({
              key: r.rmItemId,
              cells: [
                <b>{r.rmName || r.rmItemId}</b>, r.vendors || '—',
                r.requested, r.noPo || '—', r.onPoDraft || '—', r.onPoOpen || '—', r.received, r.billed,
              ],
            }))}
          />
        ) : view === VIEWS[3] ? (
          <Table
            head={['Work order', 'Status', 'Finished good', 'Item', 'SKU', 'Required', 'Reserved', 'Issued', 'Returned', 'Leftover']}
            rightFrom={5}
            rows={pageRows.map((r, i) => ({
              key: `${r.workOrderId}-${r.itemId}-${i}`, onClick: () => navigate(`/wo/${r.workOrderId}`),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{r.woNumber}</b>, <StatusChip status={r.status} />, r.fgName || '—',
                <span>
                  {r.name}
                  {r.removedFromBom && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: '#b91c1c' }}>removed</span>}
                </span>,
                r.sku || '—', r.required, r.reserved, r.issued, r.returned,
                r.leftover ? <span style={{ color: '#b45309', fontWeight: 700 }}>{r.leftover}</span> : '—',
              ],
            }))}
          />
        ) : view === VIEWS[4] ? (
          <WarehouseStock data={whMeta} displayed={displayed} pageRows={pageRows}
            whFilter={whFilter} setWhFilter={setWhFilter}
            stockFilter={stockFilter} setStockFilter={setStockFilter}
            hideZero={hideZero} setHideZero={setHideZero}
            onRefresh={refreshItem} busyItem={busyItem} groupSync={groupSync} />
        ) : (
          <Table
            head={['Work order', 'Customer', 'Finished good', 'Raw material', 'Required', 'Available', 'On order', 'Short by', 'PO raised']}
            rightFrom={4}
            rows={pageRows.map((r, i) => ({
              key: `${r.workOrderId}-${r.rmItemId}-${i}`, onClick: () => navigate(`/wo/${r.workOrderId}`),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{r.woNumber}</b>, r.customerName, r.fgName, r.rmName,
                r.required, r.available, r.onOrder,
                <span style={{ color: '#dc2626', fontWeight: 700 }}>{r.shortfallQty}</span>,
                r.noPoRaised ? <span style={{ color: '#dc2626', fontWeight: 600 }}>No</span> : 'Yes',
              ],
            }))}
          />
        )}
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}

// Warehouse-stock: one flat row per item, one column per warehouse (no
// grouping), dropdown filters, and Available per the WO logic — Main (Head
// Office) stock − Issue-warehouse stock, org total when no breakdown yet.
const ACCENT = '#7c3aed';
const LOW_STOCK = 10;

// dsDate strings are UTC "yyyy-MM-dd HH:mm:ss" → local short stamp.
function fmtSynced(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '—';
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function WarehouseStock({
  data, displayed, pageRows, whFilter, setWhFilter, stockFilter, setStockFilter,
  hideZero, setHideZero, onRefresh, busyItem, groupSync,
}) {
  const whs = data?.warehouses || [];
  const numCell = { ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 };
  const stockColor = (v) => v === 0 ? 'var(--text-secondary)' : v < LOW_STOCK ? '#b45309' : 'inherit';
  const rowBorder = { borderBottom: '1px solid var(--border)' };

  return (
    <div style={{ marginTop: 12 }}>
      {/* Filters: warehouse + stock qty dropdowns, zero-stock checkbox, count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select style={select} value={whFilter} onChange={e => setWhFilter(e.target.value)}>
          <option value="">All warehouses</option>
          {whs.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <select style={select} value={stockFilter} onChange={e => setStockFilter(e.target.value)}>
          <option value="all">All stock levels</option>
          <option value="in">In stock</option>
          <option value="low">Low (&lt;{LOW_STOCK})</option>
          <option value="zero">Zero</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={hideZero} onChange={e => setHideZero(e.target.checked)} style={{ accentColor: ACCENT }} />
          Ignore items with 0 stock
        </label>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {displayed.length} item{displayed.length === 1 ? '' : 's'} shown
        </span>
      </div>

      {!displayed.length ? <Empty>No items match the current filters.</Empty> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <thead>
            <tr>
              <th style={thStyle}>Item name</th>
              <th style={thStyle}>SKU</th>
              {whs.map(w => <th key={w.id} style={{ ...thStyle, textAlign: 'right' }}>{w.name}</th>)}
              <th style={{ ...thStyle, textAlign: 'right' }}>Available</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Last synced</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(it => {
              const busy = String(busyItem) === String(it.itemId);
              // No breakdown yet → per-warehouse cells show "—", not a false 0.
              const hasBreakdown = Object.keys(it.stocks || {}).length > 0;
              return (
                <tr key={it.itemId} style={rowBorder}>
                  <td style={{ ...cell }}>
                    <button onClick={() => onRefresh(it.itemId)} disabled={busy || !!groupSync} title="Refresh this item's stock from Zoho"
                      style={{ ...refreshBtn, ...(busy ? { animation: 'spin 0.8s linear infinite', cursor: 'default' } : null) }}>⟳</button>
                    <b>{it.itemName || it.itemId}</b>
                  </td>
                  <td style={{ ...cell, color: 'var(--text-secondary)' }}>{it.sku || '—'}</td>
                  {whs.map(w => {
                    const v = it.stocks?.[w.id];
                    return (
                      <td key={w.id} style={{ ...numCell, color: hasBreakdown ? stockColor(v || 0) : 'var(--text-secondary)' }}>
                        {hasBreakdown ? (v || 0) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ ...numCell, fontWeight: 700, color: stockColor(it.available) }}>{it.available}</td>
                  <td style={{ ...numCell, color: stockColor(it.total) }}>{it.total}</td>
                  <td style={{ ...cell, textAlign: 'right', fontSize: 12, color: 'var(--text-secondary)' }}>{fmtSynced(it.syncedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const refreshBtn = {
  marginRight: 8, padding: '1px 5px', fontSize: 13, lineHeight: 1, display: 'inline-block',
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', color: ACCENT, verticalAlign: 'middle',
};

// Plain CSV from the rows already on screen — no server round trip.
const CSV_LABELS = {
  woNumber: 'Work order', salesOrderNumber: 'Sales order', customerName: 'Customer', status: 'Status',
  items: 'Items', required: 'Required', reserved: 'Reserved', issued: 'Issued', ordered: 'On order',
  shortItems: 'Short', rmName: 'Raw material', vendors: 'Vendors', requested: 'Requested',
  noPo: 'On draft PR', onPoDraft: 'On draft PO', onPoOpen: 'On open PO', received: 'Received',
  billed: 'Billed', fgName: 'Finished good', name: 'Item', sku: 'SKU', returned: 'Returned',
  leftover: 'Leftover', removedFromBom: 'Removed from BOM', available: 'Available',
  onOrder: 'On order', shortfallQty: 'Short by', noPoRaised: 'PO raised',
  itemName: 'Item', warehouseName: 'Warehouse', stockOnHand: 'On hand', availableStock: 'Available',
  syncedAt: 'Last synced', total: 'Total',
};
function download(view, rows) {
  const cols = Object.keys(rows[0]);
  const head = cols.map(c => CSV_LABELS[c] || c);
  const csv = [head.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${view.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const btn = {
  padding: '7px 12px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
