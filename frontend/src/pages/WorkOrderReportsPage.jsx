import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice, Table, select } from '../components/woCommon.jsx';

/**
 * SO-BOM, shortfall and item-pipeline reports (FR-ADO-009). All read only our
 * own tables, so they cost nothing in Zoho API calls however many projects
 * they span.
 */
const VIEWS = ['SO–BOM status', 'Shortfall / pending', 'Item pipeline', 'Reconciliation'];

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
  const navigate = useNavigate();

  useEffect(() => {
    setRows(null);
    const url = view === VIEWS[0] ? '/api/wo/reports/so-bom'
      : view === VIEWS[1] ? '/api/wo/reports/shortfall'
      : view === VIEWS[3] ? `/api/wo/reports/reconciliation?workOrderId=${woFilter}`
      : `/api/wo/reports/item-pipeline?workOrderId=${woFilter}&vendorId=${vendorFilter}`;
    axios.get(url)
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load the report');
      });
  }, [view, woFilter, vendorFilter]);

  // WO / vendor filter options, fetched once when a filterable view first opens.
  useEffect(() => {
    if ((view !== VIEWS[2] && view !== VIEWS[3]) || filterOpts) return;
    Promise.all([axios.get('/api/wo'), axios.get('/api/wo/vendors')])
      .then(([wos, vendors]) => setFilterOpts({ wos: wos.data, vendors: vendors.data }))
      .catch(() => setFilterOpts({ wos: [], vendors: [] }));
  }, [view, filterOpts]);

  const { pageRows, pager } = usePager(rows || []);
  if (blocked) return <AccessNotice kind={blocked} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {VIEWS.map(v => (
            <button key={v} onClick={() => setView(v)} style={{
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
        <div style={{ flex: 1 }} />
        <button onClick={() => rows && download(view, rows)} disabled={!rows?.length} style={btn}>⬇ Export CSV</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? (
          <Empty>{view === VIEWS[0] ? 'No work orders yet.'
            : view === VIEWS[1] ? 'Nothing is short — every open work order is covered.'
            : view === VIEWS[3] ? 'No work order lines to reconcile yet.'
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

// Plain CSV from the rows already on screen — no server round trip.
const CSV_LABELS = {
  woNumber: 'Work order', salesOrderNumber: 'Sales order', customerName: 'Customer', status: 'Status',
  items: 'Items', required: 'Required', reserved: 'Reserved', issued: 'Issued', ordered: 'On order',
  shortItems: 'Short', rmName: 'Raw material', vendors: 'Vendors', requested: 'Requested',
  noPo: 'On draft PR', onPoDraft: 'On draft PO', onPoOpen: 'On open PO', received: 'Received',
  billed: 'Billed', fgName: 'Finished good', name: 'Item', sku: 'SKU', returned: 'Returned',
  leftover: 'Leftover', removedFromBom: 'Removed from BOM', available: 'Available',
  onOrder: 'On order', shortfallQty: 'Short by', noPoRaised: 'PO raised',
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
