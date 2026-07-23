import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal from '../components/Modal.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { Empty } from '../components/MaterialsGrid.jsx';
import { StatusChip, AccessNotice } from './WorkOrderPage.jsx';

/** Work order list + the "new work order from a sales order" flow. */
export default function WorkOrderListPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [customer, setCustomer] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [blocked, setBlocked] = useState(null);

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

  const filtered = (rows || []).filter(r =>
    (!status || r.status === status) &&
    (!customer || r.customerName === customer) &&
    (!q || [r.woNumber, r.salesOrderNumber, r.customerName, r.projectName]
      .some(v => String(v || '').toLowerCase().includes(q.toLowerCase()))),
  );
  const { pageRows, pager } = usePager(filtered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search WO, SO, customer…"
          style={{ padding: '7px 11px', fontSize: 13, minWidth: 240, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
        <FilterSelect label="statuses" value={status} onChange={setStatus} options={distinct(rows || [], 'status')} />
        <FilterSelect label="customers" value={customer} onChange={setCustomer} options={distinct(rows || [], 'customerName')} />
        {(status || customer || q) && (
          <button onClick={() => { setStatus(''); setCustomer(''); setQ(''); }} style={btn}>✕ Clear</button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setCreating(true)} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
          + New work order
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? (
          <Empty>{rows.length ? 'No work orders match these filters.' : 'No work orders yet — create one from a sales order.'}</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>{['Work order', 'Date', 'Sales order', 'Customer', 'Finished goods', 'Rev', 'Status'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i === 5 ? 'right' : 'left' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pageRows.map(r => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/wo/${r.id}`)}
                  className="list-row"
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  <td style={{ ...cell, fontWeight: 600, color: 'var(--blue)' }}>{r.woNumber}</td>
                  <td style={{ ...cell, color: 'var(--text-muted)' }}>{r.woDate}</td>
                  <td style={cell}>{r.salesOrderNumber}</td>
                  <td style={cell}>{r.customerName}{r.projectName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.projectName}</div>}</td>
                  <td style={cell}>{r.fgs.map(f => `${f.name} × ${f.qty}`).join(', ') || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{r.revision}</td>
                  <td style={cell}><StatusChip status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <GridFooter pager={pager} />

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={id => { setCreating(false); load(); navigate(`/wo/${id}`); }} />}
    </div>
  );
}

/** Pick a sales order, tick which lines are finished goods, create. */
function CreateModal({ onClose, onCreated }) {
  const [q, setQ] = useState('');
  const [sos, setSos] = useState(null);
  const [so, setSo] = useState(null);
  const [picked, setPicked] = useState({});
  const [projectName, setProjectName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      axios.get('/api/wo/sales-orders', { params: q ? { q } : {} })
        .then(({ data }) => setSos(data))
        .catch(err => toast.error(err.response?.data?.error || 'Could not load sales orders'));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function choose(id) {
    setSo(null);
    axios.get(`/api/wo/so/${id}`).then(({ data }) => {
      setSo(data);
      // Default to every line — most sales orders are all finished goods.
      setPicked(Object.fromEntries(data.lineItems.map(l => [l.itemId, l.quantity])));
    }).catch(err => toast.error(err.response?.data?.error || 'Could not load that sales order'));
  }

  async function create() {
    const fgLines = Object.entries(picked).filter(([, q]) => Number(q) > 0).map(([itemId, q]) => ({ itemId, qty: Number(q) }));
    if (!fgLines.length) return toast.error('Tick at least one finished good');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/wo', { salesOrderId: so.id, projectName, fgLines });
      toast.success(`${data.woNumber} created — ${data.seeded.length} BOM(s) seeded from Zoho`);
      (data.problems || []).forEach(p => toast.error(p, { duration: 7000 }));
      onCreated(data.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create the work order');
    } finally { setBusy(false); }
  }

  return (
    <Modal title="New work order" onClose={onClose} width={620}>
      {!so ? (
        <>
          <input
            value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search sales orders by number…"
            style={{ width: '100%', padding: '8px 11px', fontSize: 13, marginBottom: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          />
          <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            {!sos ? <Empty>Loading…</Empty> : !sos.length ? <Empty>No sales orders found.</Empty> : sos.map(s => (
              <div key={s.id} onClick={() => choose(s.id)} className="list-row"
                style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                <b style={{ color: 'var(--blue)' }}>{s.number}</b>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customerName}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.date}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            <b>{so.number}</b> · {so.customerName}
            <button onClick={() => setSo(null)} style={{ ...btn, marginLeft: 10 }}>change</button>
          </div>
          <input
            value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project name (optional)"
            style={{ width: '100%', padding: '8px 11px', fontSize: 13, marginBottom: 10, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Which lines are finished goods to manufacture? Each one's BOM is pulled from its Zoho composite item.
          </div>
          <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            {so.lineItems.map(l => (
              <label key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox" checked={picked[l.itemId] !== undefined}
                  onChange={e => setPicked(p => {
                    const next = { ...p };
                    if (e.target.checked) next[l.itemId] = l.quantity; else delete next[l.itemId];
                    return next;
                  })}
                />
                <span style={{ flex: 1 }}>{l.name}{l.sku && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {l.sku}</span>}</span>
                <input
                  type="number" min="0" step="any" value={picked[l.itemId] ?? ''}
                  onChange={e => setPicked(p => ({ ...p, [l.itemId]: e.target.value }))}
                  disabled={picked[l.itemId] === undefined}
                  style={{ width: 76, padding: '4px 6px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={btn}>Cancel</button>
            <button onClick={create} disabled={busy} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
              {busy ? 'Creating…' : 'Create work order'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

const btn = {
  padding: '6px 11px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
const thStyle = {
  padding: '9px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const cell = { padding: '9px 12px', fontSize: 13 };
