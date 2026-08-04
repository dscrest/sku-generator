import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import BomTab from '../components/BomTab.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice, Table, btn } from '../components/woCommon.jsx';

/**
 * Global BOM page (CR-019): BOMs are the primary content — a grid of work
 * orders with their revision and import date, WOs with a BOM first. A row
 * drills into the existing BomTab.
 */
export default function WorkOrderBomPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);   // wo id
  const [wo, setWo] = useState(null);               // full detail for BomTab
  const [blocked, setBlocked] = useState(null);

  function loadList() {
    axios.get('/api/wo')
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load work orders');
      });
  }
  useEffect(loadList, []);

  function loadDetail() {
    if (!selected) return;
    axios.get(`/api/wo/${selected}`)
      .then(({ data }) => setWo(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the work order'));
  }
  useEffect(() => { setWo(null); loadDetail(); /* eslint-disable-next-line */ }, [selected]);

  if (blocked) return <AccessNotice kind={blocked} />;

  const filtered = (rows || [])
    .filter(r =>
      !q || [r.woNumber, r.customerName, r.projectName].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())),
    )
    .sort((a, b) => (b.bomImportedAt ? 1 : 0) - (a.bomImportedAt ? 1 : 0));
  const { pageRows, pager } = usePager(filtered);

  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <button onClick={() => setSelected(null)} style={btn}>← All BOMs</button>
          <b style={{ fontSize: 14 }}>{wo?.woNumber || ''}</b>
          {wo && <StatusChip status={wo.status} />}
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{wo ? wo.customerName : ''}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {!wo ? <Empty>Loading work order…</Empty>
            : <BomTab workOrderId={selected} fgs={wo.fgs} revision={wo.revision} onChanged={() => { loadDetail(); loadList(); }} />}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search WO, customer…"
          style={{ width: 260, padding: '7px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? <Empty>No work orders.</Empty> : (
          <Table
            head={['Work order', 'Customer', 'Finished goods', 'Status', 'Rev', 'BOM imported']}
            rightFrom={4}
            rows={pageRows.map(w => ({
              key: w.id, onClick: () => setSelected(w.id),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{w.woNumber}</b>, w.customerName,
                (w.fgs || []).map(f => f.name).join(', ') || '—',
                <StatusChip status={w.status} />, w.revision,
                w.bomImportedAt || <span style={{ color: '#b45309', fontWeight: 600 }}>No BOM yet</span>,
              ],
            }))}
          />
        )}
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}
