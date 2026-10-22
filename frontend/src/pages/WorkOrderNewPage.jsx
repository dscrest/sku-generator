import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Empty } from '../components/MaterialsGrid.jsx';
import { AccessNotice, WO_PRIORITIES, btn, thStyle, cell } from '../components/woCommon.jsx';
import DateInput from '../components/DateInput.jsx';
import { fmtDate, dueDays } from '../format.js';

/** Work order create (/wo/new) and edit (/wo/:id/edit) — one flat form shaped like
 *  the Zoho Books "New Sales Order" page (CR-252): label left / control right, the
 *  SO's own fields read-only in a two-column block, a finished-goods item table,
 *  Special Instruction, Cancel · Create / Save. Editing keeps the sales order and
 *  finished goods read-only: qty / line changes flow through the SO-driven Apply /
 *  Add banners on the WO page. Due date stays SO-owned (CR-159). */

const field = { padding: '9px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', width: '100%', boxSizing: 'border-box' };
const readOnlyBox = { ...field, background: 'var(--bg-page)', minHeight: 38 };
const divider = { border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' };
const primary = { ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 };
const numInput = { width: 90, padding: '6px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' };

// Books-style form row: label column, control column.
function Row({ label, required, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', alignItems: 'center', gap: 16, padding: '6px 0' }}>
      <div style={{ fontSize: 13, color: required ? '#dc2626' : 'var(--text-secondary)' }}>{label}{required && '*'}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function ReadOnly({ children }) {
  const empty = children === null || children === undefined || children === '';
  return <div style={{ ...readOnlyBox, color: empty ? 'var(--text-muted)' : 'inherit' }}>{empty ? '—' : children}</div>;
}

export default function WorkOrderNewPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  // CR-251: arrived right after an SO qty / line change was applied — say why.
  const hint = useLocation().state?.hint;

  const [q, setQ] = useState('');
  const [sos, setSos] = useState(null);
  const [so, setSo] = useState(null);
  const [soOpen, setSoOpen] = useState(false);
  const [picked, setPicked] = useState({});
  const [wo, setWo] = useState(null); // edit mode: the order being edited
  // Priority (CR-113) prefilled from the SO; TC Required (CR-161); Main warehouse per WO (CR-249);
  // stage dates editable here too (CR-251).
  const [hdr, setHdr] = useState({
    woDate: new Date().toISOString().slice(0, 10), machiningDoneDate: '', fittingDoneDate: '',
    priority: '', tcRequired: '', mainWarehouseId: '', notes: '',
  });
  const [whs, setWhs] = useState({ options: [], orgMain: '', pickMain: false });
  const [nextNo, setNextNo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);
  // Bumped by ⟳ so an SO just confirmed in Books shows up without retyping.
  const [tick, setTick] = useState(0);
  const set = k => e => setHdr(h => ({ ...h, [k]: e.target.value }));

  function onErr(err, fallback) {
    if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
    else if (err.response?.status === 403) setBlocked('disabled');
    else toast.error(err.response?.data?.error || fallback);
  }

  useEffect(() => {
    if (!editing) axios.get('/api/wo/next-number').then(({ data }) => setNextNo(data.number)).catch(() => {});
    // Own endpoint, not /settings: the picker must load without wo.settings (CR-259).
    axios.get('/api/wo/warehouses').then(({ data }) => {
      const orgMain = data.orgMain || '';
      // CR-260: Reserve / Issue are never a Main; with the org's "pick on every
      // work order" setting on, a new WO starts empty.
      const pickMain = Boolean(data.pickMain) && !editing;
      const notMain = data.notMain || [];
      setWhs({ options: (data.warehouses || []).filter(w => !notMain.includes(String(w.id))), orgMain, pickMain });
      setHdr(h => ({ ...h, mainWarehouseId: h.mainWarehouseId || (pickMain ? '' : orgMain) }));
      if (data.warehouseError) toast.error(`Could not read warehouses from Zoho: ${data.warehouseError}`);
    }).catch(() => {});
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    setWo(null);
    axios.get(`/api/wo/${id}`).then(({ data }) => {
      setWo(data);
      setHdr(h => ({
        ...h, woDate: data.woDate || '', machiningDoneDate: data.machiningDoneDate || '', fittingDoneDate: data.fittingDoneDate || '',
        priority: data.priority || '', tcRequired: data.tcRequired || '', mainWarehouseId: data.mainWarehouseId || h.mainWarehouseId, notes: data.notes || '',
      }));
    }).catch(err => { onErr(err, 'Could not load the work order'); if (err.response?.status !== 403) navigate('/wo'); });
  }, [id, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing) return;
    setSos(null);
    const t = setTimeout(() => {
      axios.get('/api/wo/sales-orders', { params: q ? { q } : {} })
        .then(({ data }) => setSos(data))
        .catch(err => onErr(err, 'Could not load sales orders'));
    }, 300);
    return () => clearTimeout(t);
  }, [q, tick, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(s) {
    setSoOpen(false);
    setQ(s.number);
    setSo(null);
    axios.get(`/api/wo/so/${s.id}`).then(({ data }) => {
      // CR-149: service lines (labour) are never finished goods — hidden from the pick list.
      data.lineItems = data.lineItems.filter(l => l.productType !== 'service');
      setSo(data);
      // Default to every line — most sales orders are all finished goods.
      setPicked(Object.fromEntries(data.lineItems.map(l => [l.itemId, l.quantity])));
      setHdr(h => ({ ...h, priority: data.priority || '' }));
    }).catch(err => toast.error(err.response?.data?.error || 'Could not load that sales order'));
  }

  async function save() {
    let req;
    if (editing) req = axios.put(`/api/wo/${id}`, hdr);
    else {
      if (!so) return toast.error('Select a sales order first');
      const fgLines = Object.entries(picked).filter(([, n]) => Number(n) > 0).map(([itemId, n]) => ({ itemId, qty: Number(n) }));
      if (!fgLines.length) return toast.error('Tick at least one finished good');
      if (whs.pickMain && !hdr.mainWarehouseId) return toast.error('Select the Main warehouse');
      req = axios.post('/api/wo', { salesOrderId: so.id, fgLines, ...hdr });
    }
    setBusy(true);
    try {
      const { data } = await req;
      if (editing) {
        toast.success('Work order updated');
        navigate(`/wo/${id}`);
      } else {
        const fromQuote = data.seeded.filter(x => x.source === 'quote').length;
        const fromDesign = data.seeded.filter(x => x.source === 'design').length;
        const from = [fromQuote && `${fromQuote} from the quote configuration`, fromDesign && `${fromDesign} from the product design`].filter(Boolean).join(', ');
        toast.success(`${data.woNumber} created — ${data.seeded.length} BOM(s) seeded${from ? ` (${from})` : ' from Zoho'}`);
        (data.problems || []).forEach(p => toast.error(p, { duration: 7000 }));
        navigate(`/wo/${data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || (editing ? 'Could not save the changes' : 'Could not create the work order'));
      setBusy(false);
    }
  }

  if (blocked) return <AccessNotice kind={blocked} />;
  if (editing && !wo) return <Empty>Loading work order…</Empty>;

  // The SO-owned header fields read from the same names on GET /wo/:id and GET /wo/so/:soId.
  const src = editing ? wo : so;
  const dueDate = src?.dueDate || '';
  const back = editing ? `/wo/${id}` : '/wo';
  const canSave = editing || (so && Object.values(picked).some(n => Number(n) > 0));
  // ponytail: Size on create is unknown — SO lines carry none, fgSize is read from the
  // Books item when the FG is seeded. Add a batched item fetch if the planner needs it earlier.
  const lines = editing
    ? (wo.fgs || []).map(f => ({ itemId: f.fgItemId, name: f.name, sku: f.sku, size: f.size, qty: f.qty, config: f.config }))
    : (so?.lineItems || []).map(l => ({ itemId: l.itemId, name: l.name, sku: l.sku, size: null, qty: l.quantity, config: l.config }));
  // Valves configured on a CRM quote: their raw material comes from the quote's
  // answers (MOC …), not the composite. Column shown only when the SO has one.
  const hasConfig = lines.some(l => l.config);

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-card)' }}>
      <div style={{ maxWidth: 1200, padding: '20px 24px 40px' }}>

        {hint && (
          <div style={{ fontSize: 12, padding: '8px 11px', borderRadius: 'var(--radius-md)', background: '#f59e0b1a', color: '#92400e', marginBottom: 12 }}>
            {hint} — check the dates below.
          </div>
        )}

        <div style={{ maxWidth: 720 }}>
          <Row label="Sales order" required>
            {editing ? <ReadOnly>{wo.salesOrderNumber}</ReadOnly> : (
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={q} autoFocus placeholder="Search sales orders by number…"
                    onChange={e => { setQ(e.target.value); setSo(null); setSoOpen(true); }}
                    onFocus={() => setSoOpen(true)}
                    style={field}
                  />
                  <button type="button" title="Refresh from Zoho Books" style={{ ...btn, padding: '0 12px', fontSize: 15 }}
                    onClick={() => { setSo(null); setSoOpen(true); setTick(t => t + 1); }}>⟳</button>
                </div>
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
            )}
          </Row>
          <Row label="Customer"><ReadOnly>{src?.customerName}</ReadOnly></Row>
          {whs.options.length > 0 && (
            <Row label="Main warehouse">
              {/* CR-249: the server refuses the change while material is reserved / issued. */}
              <select
                value={hdr.mainWarehouseId} onChange={set('mainWarehouseId')}
                style={{ ...field, ...(whs.pickMain && !hdr.mainWarehouseId ? { border: '1px solid #fca5a5' } : {}) }}
              >
                {whs.pickMain && <option value="">Select warehouse</option>}
                {whs.options.map(w => <option key={w.id} value={String(w.id)}>{w.name}</option>)}
              </select>
            </Row>
          )}

          <hr style={divider} />

          <Row label="Work Order#">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ReadOnly>{editing ? wo.woNumber : (nextNo || '…')}</ReadOnly>
              {!editing && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>auto</span>}
            </div>
          </Row>
          <Row label="WO Date" required><DateInput value={hdr.woDate} onChange={set('woDate')} style={field} /></Row>
          <Row label="Expected Shipment">
            {/* The SO's Expected Shipment (CR-159) — edit it in Books, not here. */}
            <ReadOnly>{dueDate ? `${fmtDate(dueDate)} · ${dueDays(dueDate) ?? '—'} days` : src ? 'Not set — add an Expected Shipment date on the sales order' : ''}</ReadOnly>
          </Row>
          <Row label="Machining Date"><DateInput value={hdr.machiningDoneDate} onChange={set('machiningDoneDate')} style={field} /></Row>
          <Row label="Fitting Date"><DateInput value={hdr.fittingDoneDate} onChange={set('fittingDoneDate')} style={field} /></Row>
          <Row label="Priority">
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
          </Row>
          <Row label="TC Required">
            <select value={hdr.tcRequired} onChange={set('tcRequired')} style={{ ...field, width: 160 }}>
              <option value=""></option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </select>
          </Row>
        </div>

        <hr style={divider} />

        {/* SO-owned fields (CR-110 / CR-161), re-synced from Books on every open of the WO. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 40 }}>
          <Row label="SO Date"><ReadOnly>{src?.soDate ? fmtDate(src.soDate) : ''}</ReadOnly></Row>
          <Row label="Buyer Order Date"><ReadOnly>{src?.buyerOrderDate ? fmtDate(src.buyerOrderDate) : ''}</ReadOnly></Row>
          <Row label="Buyer Order No"><ReadOnly>{src?.buyerOrderNo}</ReadOnly></Row>
          <Row label="Freight Charge"><ReadOnly>{src?.freightCharge}</ReadOnly></Row>
          <Row label="Delivery"><ReadOnly>{src?.delivery}</ReadOnly></Row>
          <Row label="Booking"><ReadOnly>{src?.booking}</ReadOnly></Row>
          <Row label="Transporter"><ReadOnly>{src?.transporter}</ReadOnly></Row>
        </div>

        <hr style={divider} />

        {/* Finished goods — the Books item table. */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {!editing && <th style={{ ...thStyle, width: 36 }} />}
                <th style={thStyle}>Item details</th>
                <th style={{ ...thStyle, width: 140 }}>Size</th>
                {hasConfig && <th style={thStyle}>Configuration</th>}
                <th style={{ ...thStyle, width: 120, textAlign: 'right' }}>Quantity</th>
              </tr>
            </thead>
            <tbody>
              {!lines.length ? (
                <tr><td colSpan={5} style={{ ...cell, color: 'var(--text-muted)', padding: '14px 12px' }}>
                  {editing ? 'No finished goods on this work order' : 'Select a sales order to list its finished goods'}
                </td></tr>
              ) : lines.map(l => {
                const on = editing || picked[l.itemId] !== undefined;
                return (
                  <tr key={l.itemId} style={{ borderTop: '1px solid var(--border)', opacity: on ? 1 : 0.55 }}>
                    {!editing && (
                      <td style={{ ...cell, width: 36, textAlign: 'center' }}>
                        <input
                          type="checkbox" checked={on}
                          onChange={e => setPicked(p => {
                            const next = { ...p };
                            if (e.target.checked) next[l.itemId] = l.qty; else delete next[l.itemId];
                            return next;
                          })}
                        />
                      </td>
                    )}
                    <td style={cell}>
                      {l.name}{l.sku && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {l.sku}</span>}
                    </td>
                    <td style={{ ...cell, color: l.size ? 'inherit' : 'var(--text-muted)' }}>{l.size || '—'}</td>
                    {hasConfig && (
                      <td style={{ ...cell, fontSize: 12, color: l.config ? 'inherit' : 'var(--text-muted)' }}>
                        {!l.config ? '—' : (
                          <>
                            {(l.config.quoteNo || l.config.design) && (
                              <span style={{ fontWeight: 600 }}>{[l.config.quoteNo, l.config.design].filter(Boolean).join(' · ')}</span>
                            )}
                            <span style={{ color: 'var(--text-muted)' }}>
                              {(l.config.quoteNo || l.config.design) && Object.keys(l.config.values || {}).length > 0 && ' · '}
                              {Object.entries(l.config.values || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                            </span>
                          </>
                        )}
                      </td>
                    )}
                    <td style={{ ...cell, textAlign: 'right' }}>
                      {editing ? <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.qty}</span> : (
                        <input
                          type="number" min="0" step="any" value={picked[l.itemId] ?? ''}
                          onChange={e => setPicked(p => ({ ...p, [l.itemId]: e.target.value }))}
                          disabled={!on} style={numInput}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {editing
            ? 'Quantity and line changes come from the sales order — use Apply / Add to work order on the Details tab.'
            : hasConfig
              ? "A configured line's BOM is the items mapped for its answers; other lines pull theirs from the Zoho composite item."
              : "Each ticked line's BOM is pulled from its Zoho composite item."}
        </div>

        <hr style={divider} />

        {/* Label on top, box as wide as the item table (Books' Customer Notes). */}
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>Special Instruction</div>
        <textarea
          value={hdr.notes} onChange={set('notes')} rows={4}
          placeholder="Anything the shop floor or fitters need to know"
          style={{ ...field, resize: 'vertical', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
            {busy && !editing && 'Creating the work order and seeding BOMs from Zoho — this can take a moment…'}
          </span>
          <button onClick={() => navigate(back)} disabled={busy} style={{ ...btn, opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={save} disabled={busy || !canSave} style={{ ...primary, opacity: busy || !canSave ? 0.5 : 1 }}>
            {busy ? <><span className="spinner" />{editing ? 'Saving…' : 'Creating…'}</> : editing ? 'Save' : 'Create'}
          </button>
        </div>

      </div>
    </div>
  );
}
