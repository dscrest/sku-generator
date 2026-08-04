import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import PurchaseTab, { PoSplit } from '../components/PurchaseTab.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice, Table, btn, select } from '../components/woCommon.jsx';

/**
 * Global Purchase page (CR-019): purchase requests and purchase orders are the
 * primary content — two grids with a Requests/Orders toggle. A row drills into
 * the existing PurchaseTab (per work order) or PoSplit (per PO); "Raise
 * request for…" covers work orders that have no purchases yet.
 */
const VIEWS = ['Requests', 'Orders'];
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

  function loadLists() {
    axios.get('/api/wo')
      .then(({ data }) => setWos(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load work orders');
      });
    axios.get('/api/wo/purchase-requests').then(({ data }) => setPrs(data)).catch(() => setPrs([]));
    // Every PO in the Books org (CR-020), not just the ones raised from here.
    axios.get('/api/wo/purchase-orders').then(({ data }) => setPos(data)).catch(() => setPos([]));
  }
  useEffect(loadLists, []);

  function loadDetail() {
    if (!selected) return;
    axios.get(`/api/wo/${selected}`)
      .then(({ data }) => setWo(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the work order'));
  }
  useEffect(() => { setWo(null); loadDetail(); /* eslint-disable-next-line */ }, [selected]);

  const gridRows = view === VIEWS[0] ? (prs || []) : (pos || []);
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
        <select style={select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <select style={select} value="" onChange={e => e.target.value && setSelected(e.target.value)}>
          <option value="">Raise request for…</option>
          {openWos.map(w => <option key={w.id} value={w.id}>{w.woNumber} · {w.customerName}</option>)}
        </select>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {(!prs || !wos || (view === VIEWS[1] && !pos)) ? <Empty>Loading…</Empty> : !filtered.length ? (
          <Empty>{view === VIEWS[0] ? 'No purchase requests yet — pick a work order above to raise one.' : 'No purchase orders in Zoho Books yet.'}</Empty>
        ) : view === VIEWS[0] ? (
          <Table
            head={['PR #', 'Work order', 'Customer', 'Status', 'Lines', 'PO #s', 'Created']}
            rightFrom={4}
            rows={pageRows.map(pr => ({
              key: pr.id, onClick: () => setSelected(pr.woId),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{pr.prNumber}</b>, pr.woNumber, pr.customerName,
                <StatusChip status={pr.status} />, pr.lines.length,
                [...new Set(pr.lines.map(l => l.poNumber).filter(Boolean))].join(', ') || '—',
                String(pr.createdAt || '').slice(0, 10),
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
                p.total.toLocaleString('en-IN'),
              ],
            }))}
          />
        )}
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}
