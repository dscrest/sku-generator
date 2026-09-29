import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { btn } from '../components/woCommon.jsx';
import { useMapLookups, viewRow } from './RecipeComponentMapPage.jsx';
import NewServiceItemModal from '../components/NewServiceItemModal.jsx';

/** Component new / edit (CR-253) — /recipe/component-map/new and
 *  /recipe/component-map/edit?industryId=&component=. One flat Books-style form:
 *  a component is item Y always, or depends on ONE question (answer → item).
 *  Both save as plain ComponentMap rows through PUT /component-map/component;
 *  rows that do not fit (2+ conditions, another question) are listed read-only
 *  as "Advanced rules" and edited per row on /recipe/component-map/:id. */

const field = { padding: '9px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', width: '100%', boxSizing: 'border-box' };
const divider = { border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' };
const primary = { ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 };
const th = { padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', textAlign: 'left' };
const td = { padding: '6px 12px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'middle' };

function Row({ label, required, children, top }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', alignItems: top ? 'start' : 'center', gap: 16, padding: '6px 0' }}>
      <div style={{ fontSize: 13, color: required ? '#dc2626' : 'var(--text-secondary)', paddingTop: top ? 9 : 0 }}>{label}{required && '*'}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

// SKU-master picker: native datalist, value = the SKU, hint = name + Books state.
// ponytail: whole item list in the datalist; server typeahead past a few thousand items
function ItemInput({ items, value, onChange, compact }) {
  const it = items.find(x => String(x.id) === String(value));
  return (
    <div>
      {/* keyed on the item count so the prefilled SKU appears once the lookup lands */}
      <input key={items.length} list="cmp-items" style={{ ...field, padding: compact ? '6px 9px' : field.padding }} placeholder="Type a SKU or name…" defaultValue={it?.sku || ''}
        onChange={e => { const hit = items.find(x => x.sku === e.target.value); onChange(hit ? hit.id : ''); }} />
      <div style={{ fontSize: 11.5, marginTop: 3, color: !it ? 'var(--text-muted)' : it.inBooks ? 'var(--text-muted)' : '#b45309' }}>
        {!it ? (compact ? '' : 'No item picked') : `${it.name}${it.inBooks ? '' : ' · not in Zoho Books yet'}`}
      </div>
    </div>
  );
}

const EMPTY = { industryId: '', component: '', from: '', mode: 'always', propertyId: '', items: {}, qty: 1, uom: 'Nos', qtyPropertyId: '', required: false, asQuoteLine: false, status: 'Active' };

export default function ComponentEditPage() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const editKey = sp.get('industryId') && sp.get('component') ? { industryId: sp.get('industryId'), component: sp.get('component') } : null;
  // kind=service (CR-254): the Books "Associated Services" shape — service item picker,
  // fixed qty only, no Required / Goes as (a service is never stock, never a WO line).
  const service = sp.get('kind') === 'service';
  const lk = useMapLookups();
  const { industries, uoms, questions, loadQuestions } = lk;
  const [created, setCreated] = useState([]); // service items made from this form (Books + SKU master)
  const [newSvc, setNewSvc] = useState(null); // key ('' or answer valueId) whose picker asked for a new item
  const items = [...lk.items, ...created].filter(x => Boolean(x.service) === service);
  const [f, setF] = useState(editKey ? null : { ...EMPTY, industryId: sp.get('industryId') || '' });
  const [advanced, setAdvanced] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));

  // Edit: find the group and unfold it into the form.
  useEffect(() => {
    if (!editKey) return;
    axios.get('/api/recipe/component-map/components').then(({ data }) => {
      const g = data.find(x => String(x.industryId) === editKey.industryId && x.component.trim().toLowerCase() === editKey.component.trim().toLowerCase());
      if (!g) { toast.error('Component not found'); return navigate('/recipe/component-map'); }
      const base = g.simple[0] || g.advanced[0] || {};
      const its = {};
      for (const r of g.simple) its[r.conditions.length ? String(r.conditions[0].valueId) : ''] = String(r.skuItemId);
      setF({
        industryId: String(g.industryId), component: g.component, from: g.component,
        mode: g.propertyId ? 'depends' : 'always', propertyId: g.propertyId || '', items: its,
        qty: base.qty ?? 1, uom: base.uom || 'Nos', qtyPropertyId: base.qtyPropertyId || '',
        required: Boolean(base.required), asQuoteLine: Boolean(base.asQuoteLine), status: base.status || 'Active',
      });
      setAdvanced(g.advanced);
    }).catch(() => toast.error('Failed to load the component'));
  }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = f && questions[String(f.industryId)];
  useEffect(() => {
    if (f?.industryId && !questions[String(f.industryId)]) loadQuestions(f.industryId).catch(() => toast.error('Failed to load questions'));
  }, [f?.industryId, questions, loadQuestions]);

  if (!f) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  // Conditions: SKU-active List questions (duty answers are not stored on the
  // item). A question the configurator does not ask can never match from it.
  const condProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType !== 'Range');
  const qtyProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType === 'Range');
  const answers = f.mode === 'depends' && f.propertyId ? (q?.values[f.propertyId] || []) : [];
  const mapped = answers.filter(a => f.items[String(a.id)]).length;
  const setItem = (key, id) => setF(v => ({ ...v, items: { ...v.items, [key]: id } }));

  async function save() {
    const msg = !f.industryId ? 'Product is required'
      : !f.component.trim() ? 'Component is required'
      : f.mode === 'depends' && !f.propertyId ? 'Pick the question'
      : f.mode === 'depends' && !mapped ? 'Map at least one answer to an item'
      : f.mode === 'always' && !f.items[''] ? 'Pick the item'
      : (!f.qtyPropertyId && !(Number(f.qty) > 0)) ? 'Qty must be above zero' : null;
    if (msg) return toast.error(msg);
    const body = {
      industryId: f.industryId, component: f.component.trim(), from: f.from || undefined,
      propertyId: f.mode === 'depends' ? f.propertyId : null,
      items: f.mode === 'depends'
        ? answers.filter(a => f.items[String(a.id)]).map(a => ({ valueId: String(a.id), skuItemId: f.items[String(a.id)] }))
        : [{ skuItemId: f.items[''] }],
      qty: f.qtyPropertyId ? 1 : Number(f.qty), uom: f.uom, qtyPropertyId: service ? '' : f.qtyPropertyId,
      required: service ? false : f.required, asQuoteLine: service ? false : f.asQuoteLine, status: f.status,
    };
    setBusy(true);
    try {
      await axios.put('/api/recipe/component-map/component', body);
      toast.success(editKey ? 'Saved' : 'Created');
      navigate('/recipe/component-map');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setBusy(false); }
  }

  const productName = industries.find(i => String(i.id) === String(f.industryId))?.name;
  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 820 }}>
        <Row label="Product" required>
          {editKey ? <div style={{ ...field, background: 'var(--bg-page)' }}>{productName || '—'}</div> : (
            <select style={field} value={f.industryId} onChange={e => setF(v => ({ ...v, industryId: e.target.value, propertyId: '', qtyPropertyId: '', items: {} }))}>
              <option value="">—</option>
              {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          )}
        </Row>
        <Row label={service ? 'Service' : 'Component'} required>
          <input style={field} value={f.component} onChange={set('component')} placeholder={service ? 'e.g. Coating, Assembly, Machining' : 'e.g. Casing, Fastener, Motor'} autoFocus={!editKey} />
        </Row>

        <hr style={divider} />

        <Row label={service ? 'Service item' : 'Item'} required top>
          <div style={{ display: 'flex', gap: 18, fontSize: 13, marginBottom: 8 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" checked={f.mode === 'always'} onChange={() => setF(v => ({ ...v, mode: 'always' }))} /> Same item always
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" checked={f.mode === 'depends'} onChange={() => setF(v => ({ ...v, mode: 'depends' }))} /> Depends on the answer to
            </label>
            {f.mode === 'depends' && (
              <select style={{ ...field, width: 'auto', padding: '5px 8px', flex: 1 }} value={f.propertyId} onChange={e => setF(v => ({ ...v, propertyId: e.target.value }))}>
                <option value="">Question…</option>
                {condProps.map(p => <option key={p.id} value={p.id}>{p.caption}{p.showInWidget === false ? ' (not asked in the configurator)' : ''}</option>)}
              </select>
            )}
          </div>
          {f.mode === 'always' && <ItemInput items={items} value={f.items['']} onChange={id => setItem('', id)} />}
          {service && (
            <div style={{ fontSize: 11.5, marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={() => setNewSvc(f.mode === 'always' ? '' : null)} disabled={f.mode !== 'always'}
                style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}>+ New service item in Books</button>
              {!items.length && <span style={{ color: '#b45309' }}>None in the SKU master yet — create one here, or Refresh from Zoho on the Books items industry.</span>}
            </div>
          )}
          {f.mode === 'depends' && f.propertyId && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, width: '32%' }}>Answer</th><th style={th}>Item</th></tr></thead>
                <tbody>
                  {answers.map(a => (
                    <tr key={a.id}>
                      <td style={td}>{a.displayValue}</td>
                      <td style={td}><ItemInput compact items={items} value={f.items[String(a.id)]} onChange={id => setItem(String(a.id), id)} /></td>
                    </tr>
                  ))}
                  {answers.length === 0 && <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={2}>This question has no answers yet.</td></tr>}
                </tbody>
              </table>
              <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-page)' }}>
                {mapped} of {answers.length} answers mapped — an answer left blank gets no item{f.required ? ' and is reported as missing' : ''}.
              </div>
            </div>
          )}
          <datalist id="cmp-items">{items.map(x => <option key={x.id} value={x.sku}>{x.name}</option>)}</datalist>
        </Row>

        <hr style={divider} />

        <Row label="Quantity" required>
          <div style={{ display: 'grid', gridTemplateColumns: service ? '1fr 120px' : '1fr 1fr 120px', gap: 8 }}>
            {!service && (
              <select style={field} value={f.qtyPropertyId || ''} onChange={set('qtyPropertyId')}>
                <option value="">Fixed</option>
                {qtyProps.map(p => <option key={p.id} value={p.id}>From answer: {p.caption}</option>)}
              </select>
            )}
            <input style={{ ...field, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" min="0" disabled={Boolean(f.qtyPropertyId)}
              value={f.qtyPropertyId ? '' : f.qty} onChange={set('qty')} placeholder={f.qtyPropertyId ? 'from the answer' : ''} />
            <select style={field} value={f.uom || 'Nos'} onChange={set('uom')}>
              {[...new Set([f.uom || 'Nos', ...uoms])].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </Row>
        {!service && (
          <>
            <Row label="Required">
              <select style={field} value={f.required ? 'yes' : 'no'} onChange={e => setF(v => ({ ...v, required: e.target.value === 'yes' }))}>
                <option value="no">No — optional / accessory</option>
                <option value="yes">Yes — flag when no item is mapped for the answers</option>
              </select>
            </Row>
            <Row label="Goes as">
              <select style={field} value={f.asQuoteLine ? 'separate' : 'bom'} onChange={e => setF(v => ({ ...v, asQuoteLine: e.target.value === 'separate' }))}>
                <option value="bom">BOM line (inside the Books composite item)</option>
                <option value="separate">Separate quote line</option>
              </select>
            </Row>
          </>
        )}
        <Row label="Status">
          <select style={field} value={f.status || 'Active'} onChange={set('status')}><option>Active</option><option>Inactive</option></select>
        </Row>

        {advanced.length > 0 && (
          <>
            <hr style={divider} />
            <Row label={`Advanced rules (${advanced.length})`} top>
              <div style={{ fontSize: 13 }}>
                {advanced.map(r => { const v = viewRow(r, lk); return (
                  <div key={r.id} style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ flex: 1 }}>{v.when}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{v.item || 'item deleted'} · {v.qtyText}</span>
                    <Link to={`/recipe/component-map/${r.id}`} style={{ color: 'var(--blue)' }}>Edit</Link>
                  </div>
                ); })}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>Rows keyed on two or more answers, or on another question. They still take part: per component the row with the most matching conditions wins.</div>
              </div>
            </Row>
          </>
        )}

        {newSvc !== null && (
          <NewServiceItemModal initialName={f.component} onClose={() => setNewSvc(null)}
            onCreated={it => { setCreated(c => [...c, it]); setItem(newSvc, String(it.id)); setNewSvc(null); }} />
        )}

        <hr style={divider} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn} onClick={() => navigate('/recipe/component-map')} disabled={busy}>Cancel</button>
          <button style={primary} onClick={save} disabled={busy}>{busy ? 'Saving…' : editKey ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
