import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice } from './WorkOrderPage.jsx';

/**
 * SO-BOM and shortfall reports (FR-ADO-009). Both read only our own tables, so
 * they cost nothing in Zoho API calls however many projects they span.
 */
const VIEWS = ['SO–BOM status', 'Shortfall / pending'];

export default function WorkOrderReportsPage() {
  const [view, setView] = useState(VIEWS[0]);
  const [rows, setRows] = useState(null);
  const [blocked, setBlocked] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRows(null);
    const url = view === VIEWS[0] ? '/api/wo/reports/so-bom' : '/api/wo/reports/shortfall';
    axios.get(url)
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load the report');
      });
  }, [view]);

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
        <div style={{ flex: 1 }} />
        <button onClick={() => rows && download(view, rows)} disabled={!rows?.length} style={btn}>⬇ Export CSV</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !rows.length ? (
          <Empty>{view === VIEWS[0] ? 'No work orders yet.' : 'Nothing is short — every open work order is covered.'}</Empty>
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

function Table({ head, rows, rightFrom }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      <thead>
        <tr>{head.map((h, i) => <th key={h} style={{ ...thStyle, textAlign: i >= rightFrom ? 'right' : 'left' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key} onClick={r.onClick} className="list-row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
            {r.cells.map((c, i) => (
              <td key={i} style={{ padding: '8px 12px', fontSize: 13, textAlign: i >= rightFrom ? 'right' : 'left', fontFamily: i >= rightFrom ? 'var(--font-mono)' : 'inherit' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Plain CSV from the rows already on screen — no server round trip.
function download(view, rows) {
  const cols = Object.keys(rows[0]);
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
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
const thStyle = {
  padding: '9px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
