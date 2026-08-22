import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import PurchaseTab, { PoSplit } from '../components/PurchaseTab.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice, Table, btn, select } from '../components/woCommon.jsx';
import { fmtMoney, fmtDate } from '../format.js';

/**
 * Purchase Request page. Primary view is **By item** (CR-023): the shortfall of
 * every open work order aggregated per raw material, so the buyer ticks items,
 * picks one vendor, and raises a grouped PO in a single step — no drilling into
 * each work order. Requests/Orders keep the per-WO PurchaseTab and per-PO
 * PoSplit reachable.
 */
const VIEWS = ['By item', 'Requests', 'Orders'];
const nice = s => String(s || '—').replace(/_/g, ' ');

export default function WorkOrderPurchasePage() {
  const [wos, setWos] = useState(null);
  const [prs, setPrs] = useState(null);
  const [pos, setPos] = useState(null);
  const [view, setView] = useState(VIEWS[0]);
  const [statusFilter, setStatusFilter] = useState('');
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
  const loadPrs = () => axios.get('/api/wo/purchase-requests').then(({ data }) => setPrs(data)).catch(() => setPrs([]));
  // Every PO in the Books org (CR-020), not just the ones raised from here.
  const loadPos = () => axios.get('/api/wo/purchase-orders').then(({ data }) => setPos(data)).catch(() => setPos([]));

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
  const filtered = statusFilter ? gridRows.filter(r => r.status === statusFilter) : gridRows;
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
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {!wo ? <Empty>Loading work order…</Empty>
            : <PurchaseTab workOrderId={selected} wo={wo} onChanged={() => { loadDetail(); loadLists(); }} />}
        </div>
      </div>
    );
  }

  const openWos = (wos || []).filter(w => !['Closed', 'Cancelled'].includes(w.status));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => { setView(v); setStatusFilter(''); }} style={{
              padding: '7px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: v === view ? 'var(--blue)' : 'var(--bg-card)',
              color: v === view ? '#fff' : 'var(--text-secondary)', fontWeight: v === view ? 600 : 400,
            }}>{v}</button>
          ))}
        </div>
        {view !== 'By item' && (
          <select style={select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <select style={select} value="" onChange={e => e.target.value && setSelected(e.target.value)}>
          <option value="">Raise request for…</option>
          {openWos.map(w => <option key={w.id} value={w.id}>{w.woNumber} · {w.customerName}</option>)}
        </select>
      </div>

      {view === 'By item' ? (
        <ByItemView onRaised={loadLists} />
      ) : (
        <>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
            {(!prs || !wos || (view === 'Orders' && !pos)) ? <Empty>Loading…</Empty> : !filtered.length ? (
              <Empty>{view === 'Requests' ? 'No purchase requests yet.' : 'No purchase orders in Zoho Books yet.'}</Empty>
            ) : view === 'Requests' ? (
              <Table
                head={['PR #', 'Work order', 'Customer', 'Status', 'Lines', 'PO #s', 'Created']}
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
                head={['PO #', 'Date', 'Vendor', 'Status', 'PR #', 'Work order', 'Received', 'Billed', 'Total']}
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
 * By-item view (CR-023): one row per short raw material across every open work
 * order. Tick items, edit the order quantity if needed, pick one vendor, Raise
 * PO → a consolidated PR + a single grouped draft PO in Books.
 */
function ByItemView({ onRaised }) {
  const [items, setItems] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [checked, setChecked] = useState({});   // rmItemId -> true
  const [qty, setQty] = useState({});            // rmItemId -> edited total
  const [open, setOpen] = useState({});          // rmItemId -> breakdown expanded
  const [vendorId, setVendorId] = useState('');
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

  const { pageRows, pager } = usePager(items || []);
  const chosen = (items || []).filter(i => checked[i.rmItemId]);
  const orderQty = i => { const v = qty[i.rmItemId]; return v === undefined || v === '' ? i.totalQty : Number(v) || 0; };
  const totalUnits = chosen.reduce((s, i) => s + orderQty(i), 0);
  const allOn = (items || []).length > 0 && (items || []).every(i => checked[i.rmItemId]);

  async function raise() {
    if (!vendorId) return toast.error('Pick a vendor');
    if (!chosen.length) return toast.error('Select at least one item');
    const vendor = vendors.find(v => String(v.id) === String(vendorId));
    setRaising(true);
    try {
      const { data } = await axios.post('/api/wo/purchase/raise', {
        vendorId, vendorName: vendor?.name || '',
        items: chosen.map(i => ({ rmItemId: i.rmItemId, rmName: i.rmName, qty: orderQty(i), breakdown: i.breakdown })),
      });
      toast.success(`${data.prNumber} raised · PO ${data.poNumber}`);
      setChecked({}); setQty({}); setVendorId('');
      load();
      onRaised?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not raise the purchase order');
    } finally { setRaising(false); }
  }

  if (!items) return <div style={{ flex: 1 }}><Empty>Loading shortfall…</Empty></div>;
  if (!items.length) return <div style={{ flex: 1 }}><Empty>No shortfall across open work orders — nothing to purchase.</Empty></div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 34 }}>
                <input type="checkbox" checked={allOn}
                  onChange={e => setChecked(e.target.checked ? Object.fromEntries(items.map(i => [i.rmItemId, true])) : {})} />
              </th>
              <th style={th}>Item</th>
              <th style={{ ...th, textAlign: 'right' }}>Order qty</th>
              <th style={th}>Needed by</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(i => (
              <RowGroup key={i.rmItemId}
                item={i} checked={!!checked[i.rmItemId]} qty={qty[i.rmItemId]} open={!!open[i.rmItemId]}
                onCheck={v => setChecked(c => ({ ...c, [i.rmItemId]: v }))}
                onQty={v => setQty(q => ({ ...q, [i.rmItemId]: v }))}
                onToggle={() => setOpen(o => ({ ...o, [i.rmItemId]: !o[i.rmItemId] }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* pinned raise bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {chosen.length ? <><b>{chosen.length}</b> item{chosen.length > 1 ? 's' : ''} · <b>{totalUnits.toLocaleString('en-IN')}</b> units</> : 'Select items to order'}
        </span>
        <div style={{ flex: 1 }} />
        <select style={select} value={vendorId} onChange={e => setVendorId(e.target.value)}>
          <option value="">Select vendor…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button onClick={raise} disabled={raising || !chosen.length || !vendorId}
          style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600, opacity: (raising || !chosen.length || !vendorId) ? 0.5 : 1 }}>
          {raising ? 'Raising…' : 'Raise PO'}
        </button>
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}

function RowGroup({ item, checked, qty, open, onCheck, onQty, onToggle }) {
  const bd = item.breakdown || [];
  return (
    <>
      <tr className="list-row" style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={td}><input type="checkbox" checked={checked} onChange={e => onCheck(e.target.checked)} /></td>
        <td style={{ ...td, fontWeight: 600 }}>{item.rmName || item.rmItemId}</td>
        <td style={{ ...td, textAlign: 'right' }}>
          <input type="number" min="0" step="any" value={qty ?? item.totalQty}
            onChange={e => onQty(e.target.value)}
            style={{ width: 80, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }} />
        </td>
        <td style={td}>
          <button onClick={onToggle} style={{ ...btn, padding: '3px 8px', fontSize: 12 }}>
            {bd.length} work order{bd.length > 1 ? 's' : ''} {open ? '▴' : '▾'}
          </button>
        </td>
      </tr>
      {open && (
        <tr style={{ background: 'var(--bg-page)' }}>
          <td />
          <td colSpan={3} style={{ padding: '6px 12px 10px' }}>
            {bd.map((b, idx) => (
              <span key={idx} style={{ display: 'inline-flex', gap: 6, marginRight: 14, fontSize: 12, color: 'var(--text-secondary)' }}>
                <b style={{ color: 'var(--blue)' }}>{b.woNumber || '—'}</b>
                {b.salesOrderNumber ? <span style={{ color: 'var(--text-muted)' }}>SO {b.salesOrderNumber}</span> : null}
                <span style={{ fontFamily: 'var(--font-mono)' }}>× {b.qty}</span>
              </span>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}
