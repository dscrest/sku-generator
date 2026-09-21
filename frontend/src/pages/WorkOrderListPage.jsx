import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, ProcChip, DueDays, AccessNotice } from '../components/woCommon.jsx';
import { fmtDate, dueDays } from '../format.js';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

const COLUMNS = [
  {
    key: 'woNumber', label: 'Work Order', lock: true, render: r => (
      <span style={{ fontWeight: 600, color: 'var(--blue)' }}>
        {r.attention && <span title="New progress — a PO receipt landed since this was last opened" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#dc2626', marginRight: 6 }} />}
        {r.woNumber}
      </span>
    ),
  },
  { key: 'woDate', label: 'Date', render: r => <span style={{ color: 'var(--text-muted)' }}>{fmtDate(r.woDate)}</span> },
  { key: 'salesOrderNumber', label: 'Sales Order', render: r => r.salesOrderNumber },
  {
    key: 'customerName', label: 'Customer', render: r => (
      <span style={{ fontWeight: 600 }}>{r.customerName}</span>
    ),
  },
  { key: 'fgs', label: 'Finished Goods', render: r => r.fgs.map(f => `${f.name} × ${f.qty}`).join(', ') || '—' },
  {
    key: 'dueDate', label: 'Due Date', render: r => (
      <span style={{ fontWeight: 600, color: dueDays(r.dueDate) !== null && dueDays(r.dueDate) < 4 ? '#dc2626' : 'var(--text-muted)' }}>{fmtDate(r.dueDate)}</span>
    ),
  },
  { key: 'dueDays', label: 'Due Days', render: r => <DueDays date={r.dueDate} /> },
  { key: 'revision', label: 'Rev', align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono)' }}>{r.revision}</span> },
  { key: 'status', label: 'SO Status', render: r => <StatusChip status={r.status} /> },
  { key: 'procStatus', label: 'Purchase Status', render: r => <ProcChip status={r.procStatus} /> },
];

/** Work order list; creation lives on its own page at /wo/new. */
export default function WorkOrderListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  // Filters live in the URL too, so refresh keeps them (CR-038).
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [customer, setCustomer] = useState(searchParams.get('customer') || '');
  const [proc, setProc] = useState(searchParams.get('proc') || '');
  const [priority, setPriority] = useState(searchParams.get('priority') || '');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of [['status', status], ['customer', customer], ['proc', proc], ['priority', priority], ['q', q]]) {
        v ? p.set(k, v) : p.delete(k);
      }
      return p;
    }, { replace: true });
  }, [status, customer, proc, priority, q, setSearchParams]);

  function load() {
    axios.get('/api/wo')
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load work orders');
      });
  }
  useEffect(load, []);

  if (blocked) return <AccessNotice kind={blocked} />;

  const { cols, chooser } = useGridColumns('wo.list', COLUMNS);
  const filtered = (rows || []).filter(r =>
    (!status || r.status === status) &&
    (!customer || r.customerName === customer) &&
    (!proc || r.procStatus === proc) &&
    (!priority || r.priority === priority) &&
    (!q || [r.woNumber, r.salesOrderNumber, r.customerName]
      .some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))),
  );
  const { pageRows, pager } = usePager(filtered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search WO, SO, customer…"
          aria-label="Search work orders"
          style={{ padding: '7px 11px', fontSize: 13, minWidth: 240, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
        <FilterSelect label="SO Statuses" value={status} onChange={setStatus} options={distinct(rows || [], 'status')} />
        <FilterSelect label="Purchase Statuses" value={proc} onChange={setProc} options={distinct(rows || [], 'procStatus')} />
        <FilterSelect label="Customers" value={customer} onChange={setCustomer} options={distinct(rows || [], 'customerName')} />
        <FilterSelect label="Priorities" value={priority} onChange={setPriority} options={distinct(rows || [], 'priority')} />
        {(status || customer || proc || priority || q) && (
          <button onClick={() => { setStatus(''); setCustomer(''); setProc(''); setPriority(''); setQ(''); }} style={btn}>✕ Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => { setRows(null); load(); }} title="Refresh" style={btn}>⟳</button>
        <ColumnChooser chooser={chooser} />
        <button onClick={() => navigate('/wo/new')} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
          + New Work Order
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? (
          <Empty>{rows.length ? 'No work orders match these filters.' : 'No work orders yet — create one from a sales order.'}</Empty>
        ) : (
          <div style={{ marginTop: 12 }}>
            <DataTable cols={cols} rows={pageRows} onRowClick={r => navigate(`/wo/${r.id}`)} />
          </div>
        )}
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}


const btn = {
  padding: '6px 11px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
