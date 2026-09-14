import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Empty } from '../components/MaterialsGrid.jsx';
import { AccessNotice, WO_PRIORITIES, btn } from '../components/woCommon.jsx';
import { fmtDate, dueDays } from '../format.js';
import DateInput from '../components/DateInput.jsx';

/** New work order as a full page (CR reference design): Sales order card,
 *  Schedule card (dates + days-from-today counters), Details card
 *  (priority segments + instructions). Attachments deferred — no file backend. */

const hdrField = { padding: '9px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 };
const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 };
const cardTitle = { fontSize: 15, fontWeight: 700, margin: 0 };
const helper = { fontSize: 12, color: 'var(--text-muted)', margin: 0 };

export default function WorkOrderNewPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sos, setSos] = useState(null);
  const [so, setSo] = useState(null);
  const [soOpen, setSoOpen] = useState(false);
  const [picked, setPicked] = useState({});
  // Header fields (CR-113): prefilled from the SO custom fields, user-editable.
  const [hdr, setHdr] = useState({ dueDate: '', priority: '', machiningDoneDate: '', fittingDoneDate: '' });
  const [notes, setNotes] = useState('');
  const [nextNo, setNextNo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);

  useEffect(() => {
    axios.get('/api/wo/next-number').then(({ data }) => setNextNo(data.number)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      axios.get('/api/wo/sales-orders', { params: q ? { q } : {} })
        .then(({ data }) => setSos(data))
        .catch(err => {
          if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
          else if (err.response?.status === 403) setBlocked('disabled');
          else toast.error(err.response?.data?.error || 'Could not load sales orders');
        });
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  function choose(s) {
    setSoOpen(false);
    setQ(s.number);
    setSo(null);
    axios.get(`/api/wo/so/${s.id}`).then(({ data }) => {
      setSo(data);
      // Default to every line — most sales orders are all finished goods.
      setPicked(Object.fromEntries(data.lineItems.map(l => [l.itemId, l.quantity])));
      setHdr({
        dueDate: data.dueDate || '', priority: data.priority || '',
        machiningDoneDate: data.machiningDoneDate || '', fittingDoneDate: data.fittingDoneDate || '',
      });
    }).catch(err => toast.error(err.response?.data?.error || 'Could not load that sales order'));
  }

  async function create() {
    if (!so) return toast.error('Select a sales order first');
    const fgLines = Object.entries(picked).filter(([, q]) => Number(q) > 0).map(([itemId, q]) => ({ itemId, qty: Number(q) }));
    if (!fgLines.length) return toast.error('Tick at least one finished good');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/wo', { salesOrderId: so.id, fgLines, notes, ...hdr });
      toast.success(`${data.woNumber} created — ${data.seeded.length} BOM(s) seeded from Zoho`);
      (data.problems || []).forEach(p => toast.error(p, { duration: 7000 }));
      navigate(`/wo/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create the work order');
      setBusy(false);
    }
  }

  if (blocked) return <AccessNotice kind={blocked} />;

  const days = v => {
    const d = dueDays(v);
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Days: {d ?? '—'}</div>;
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-page)' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, flex: 1 }}>New work order</h1>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Work order no.</span>
          <span style={{ padding: '4px 10px', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 600, border: '1px solid var(--border)', borderRadius: 99, background: 'var(--bg-card)' }}>
            {nextNo || '…'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>auto</span>
        </div>

        {/* ---- Sales order ---- */}
        <div style={card}>
          <h2 style={cardTitle}>Sales order</h2>
          <p style={helper}>The work order takes its customer, items and delivery date from this order.</p>
          <div style={{ position: 'relative' }}>
            <label style={label}>
              Select sales order
              <input
                value={q} autoFocus placeholder="Search sales orders by number…"
                onChange={e => { setQ(e.target.value); setSo(null); setSoOpen(true); }}
                onFocus={() => setSoOpen(true)}
                style={hdrField}
              />
            </label>
            {soOpen && !so && (
              <>
                <div onClick={() => setSoOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 41, maxHeight: 280, overflow: 'auto',
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                }}>
                  {!sos ? <Empty>Loading…</Empty> : !sos.length ? <Empty>No sales orders found.</Empty> : sos.map(s => (
                    <div key={s.id} onClick={() => choose(s)} className="list-row"
                      style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                      <b style={{ color: 'var(--blue)' }}>{s.number}</b>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customerName}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.date}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {so && (
            <>
              <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', padding: '10px 14px', background: 'var(--blue-light)', border: '1px solid var(--blue-border)', borderRadius: 'var(--radius-md)', fontSize: 13, flexWrap: 'wrap' }}>
                <b style={{ color: 'var(--blue)' }}>{so.number}</b>
                <span style={{ fontWeight: 600 }}>{so.customerName}</span>
                {so.date && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>SO Date: {fmtDate(so.date)}</span>}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Finished goods to manufacture</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Each ticked line's BOM is pulled from its Zoho composite item.
                </div>
                <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  {so.lineItems.map(l => (
                    <label key={l.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
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
                        style={{ width: 76, padding: '5px 7px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ---- Schedule ---- */}
        <div style={card}>
          <h2 style={cardTitle}>Schedule</h2>
          <p style={helper}>Days are counted from today and updated as you pick dates.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 14px' }}>
            {[
              ['Machining date', 'machiningDoneDate'],
              ['Fitting date', 'fittingDoneDate'],
              ['Completion date', 'dueDate'],
            ].map(([lbl, key]) => (
              <div key={key}>
                <label style={label}>
                  {lbl}
                  <DateInput value={hdr[key]} onChange={e => setHdr(h => ({ ...h, [key]: e.target.value }))} style={hdrField} />
                </label>
                {days(hdr[key])}
              </div>
            ))}
          </div>
        </div>

        {/* ---- Details ---- */}
        <div style={card}>
          <h2 style={cardTitle}>Details</h2>
          <div style={{ ...label, gap: 6 }}>
            Priority
            <div style={{ display: 'flex', gap: 8 }}>
              {WO_PRIORITIES.map(p => {
                const on = hdr.priority === p;
                return (
                  <button
                    key={p} type="button"
                    onClick={() => setHdr(h => ({ ...h, priority: on ? '' : p }))}
                    style={{
                      ...btn, padding: '8px 18px', fontSize: 13, fontWeight: on ? 600 : 400,
                      background: on ? 'var(--blue)' : 'var(--bg-card)',
                      color: on ? '#fff' : 'var(--text-secondary)',
                      borderColor: on ? 'var(--blue)' : 'var(--border)',
                    }}
                  >{p}</button>
                );
              })}
            </div>
          </div>
          <label style={label}>
            Instructions
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)} rows={5}
              placeholder="Anything the shop floor or fitters need to know"
              style={{ ...hdrField, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
          {busy && (
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
              Creating the work order and seeding BOMs from Zoho — this can take a moment…
            </span>
          )}
          <button onClick={() => navigate('/wo')} disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={create} disabled={busy || !so} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600, opacity: !so ? 0.5 : 1 }}>
            {busy ? <><span className="spinner" />Creating…</> : 'Create Work Order'}
          </button>
        </div>

      </div>
    </div>
  );
}
