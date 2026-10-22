import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, SearchInput, matches, distinct } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import { readXlsxFile } from '../components/BomTab';
import MasterDetailPage from './MasterDetailPage.jsx';

// ---- Excel import (CR-195) ----
// Sheet: Component | Item (SKU or name) | Qty | UOM | Required (Y/N) | Goes as (BOM / Separate)
// + one column per question caption holding the answer text. Parsed in the
// browser; each good row is POSTed to the normal create endpoint.
const HDR = { component: ['component'], item: ['item', 'item sku', 'sku', 'item name'], qty: ['qty', 'quantity'], uom: ['uom', 'unit'], required: ['required'], goesAs: ['goes as', 'line'] };
const norm = s => String(s ?? '').trim().toLowerCase();
export function parseMapSheet(matrix, q, items) {
  const [head = [], ...body] = matrix;
  const cols = head.map(norm);
  const fixed = {};
  for (const [k, names] of Object.entries(HDR)) fixed[k] = cols.findIndex(c => names.includes(c));
  if (fixed.component < 0 || fixed.item < 0) throw new Error('The sheet needs "Component" and "Item" columns');
  const fixedIdx = new Set(Object.values(fixed).filter(i => i >= 0));
  const qCols = cols.map((c, i) => ({ i, prop: fixedIdx.has(i) || !c ? null : q.props.find(p => norm(p.caption) === c || norm(p.name) === c) }))
    .filter(x => !fixedIdx.has(x.i) && cols[x.i]);
  const unknown = qCols.filter(x => !x.prop).map(x => head[x.i]);
  if (unknown.length) throw new Error('Unknown question column(s): ' + unknown.join(', '));
  const bySku = new Map(items.map(it => [norm(it.sku), it]));
  const byName = new Map(items.map(it => [norm(it.name), it]));
  const yes = s => /^(y|yes|true|1)$/i.test(String(s).trim());
  const rows = [], errors = [];
  body.forEach((r, n) => {
    if (!r.some(v => String(v).trim())) return;
    const line = `Row ${n + 2}`;
    const component = String(r[fixed.component] || '').trim();
    const it = bySku.get(norm(r[fixed.item])) || byName.get(norm(r[fixed.item]));
    if (!component) return errors.push(`${line}: no component`);
    if (!it) return errors.push(`${line}: item "${r[fixed.item]}" is not in the SKU master`);
    const conditions = [];
    for (const { i, prop } of qCols) {
      const text = String(r[i] ?? '').trim();
      if (!text) continue;
      if (prop.valueType === 'Range' || prop.activeInSku === false) return errors.push(`${line}: ${prop.caption} cannot be a condition (number or duty question)`);
      const v = (q.values[prop.id] || []).find(x => norm(x.displayValue) === norm(text));
      if (!v) return errors.push(`${line}: ${prop.caption} has no answer "${text}"`);
      conditions.push({ propertyId: String(prop.id), valueId: String(v.id) });
    }
    const qty = fixed.qty >= 0 && String(r[fixed.qty] ?? '').trim() ? Number(r[fixed.qty]) : 1;
    if (!(qty > 0)) return errors.push(`${line}: qty must be above zero`);
    const uom = fixed.uom >= 0 ? String(r[fixed.uom] ?? '').trim() : '';
    rows.push({
      component, skuItemId: it.id, conditions, qty, status: 'Active',
      ...(uom ? { uom } : {}), // blank → backend default (Nos)
      required: fixed.required >= 0 && yes(r[fixed.required]),
      asQuoteLine: fixed.goesAs >= 0 && /separate|quote|loose/i.test(String(r[fixed.goesAs] ?? '')),
    });
  });
  return { rows, errors };
}

const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const selectStyle = { ...inputStyle, background: 'var(--bg-card)' };
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { industryId: '', component: '', conditions: [], skuItemId: '', qty: 1, uom: 'Nos', qtyPropertyId: '', required: false, asQuoteLine: false, status: 'Active' };


// Lookups the form, the grid and the details page share (CR-233): products,
// SKU-master items, UOM list and each product's questions (fetched on action).
export function useMapLookups() {
  const [lk, setLk] = useState({ industries: [], items: [], uoms: ['Nos'] });
  const [questions, setQuestions] = useState({}); // industryId -> { props, values }
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    Promise.all([
      axios.get('/api/industries').catch(() => ({ data: [] })),
      axios.get('/api/recipe/products').catch(() => ({ data: [] })),
      axios.get('/api/recipe/uoms').catch(() => ({ data: ['Nos'] })),
    ]).then(([i, it, u]) => setLk({ industries: i.data, items: it.data, uoms: u.data }));
  }, []);
  // Sync from Books on demand (CR-283): the pickers read the local SKU master,
  // which only learns a new Books item when something refreshes it.
  const sync = useCallback(async () => {
    setSyncing(true);
    const tid = toast.loading('Syncing items from Zoho Books…');
    try {
      const { data } = await axios.post('/api/recipe/products/sync');
      const items = (await axios.get('/api/recipe/products')).data;
      setLk(prev => ({ ...prev, items }));
      toast.success(`${data.created} new, ${data.updated} updated${data.errors?.length ? `, ${data.errors.length} errors` : ''}`, { id: tid });
    } catch (err) { toast.error(err.response?.data?.message || err.response?.data?.error || 'Sync failed', { id: tid }); }
    finally { setSyncing(false); }
  }, []);
  const loadQuestions = useCallback(async (industryId) => {
    if (!industryId) return null;
    const [p, v] = await Promise.all([
      axios.get(`/api/industries/${industryId}/properties`),
      axios.get(`/api/industries/${industryId}/property-values`),
    ]);
    const q = { props: p.data, values: v.data };
    setQuestions(prev => ({ ...prev, [industryId]: q }));
    return q;
  }, []);
  return { ...lk, questions, loadQuestions, sync, syncing };
}

// Raw row + lookups → the row the grid, rail and details show.
export function viewRow(r, lk) {
  const q = lk.questions[String(r.industryId)];
  const it = lk.items.find(x => String(x.id) === String(r.skuItemId));
  const qp = r.qtyPropertyId && q?.props.find(x => String(x.id) === String(r.qtyPropertyId));
  const when = !r.conditions.length ? 'Always' : r.conditions.map(c => {
    const p = q?.props.find(x => String(x.id) === String(c.propertyId));
    const v = (q?.values[c.propertyId] || []).find(x => String(x.id) === String(c.valueId));
    return `${p?.caption || '?'} = ${v?.displayValue || '?'}`;
  }).join(', ');
  return {
    ...r, product: lk.industries.find(x => String(x.id) === String(r.industryId))?.name || '', when,
    item: it ? `${it.sku} — ${it.name}` : '', qtyText: `${r.qtyPropertyId ? `= ${qp?.caption || 'answer'}` : String(r.qty ?? 1)} ${r.uom || 'Nos'}`,
  };
}


// Modal body, shared by the grid's New/Edit and the details page.
export function MapForm({ editing, setEditing, rows, lk }) {
  const { industries, items, uoms, questions, loadQuestions } = lk;
  const itemById = new Map(items.map(x => [String(x.id), x]));
  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));
  const setCond = (i, patch) => setEditing(v => ({ ...v, conditions: v.conditions.map((c, j) => j === i ? { ...c, ...patch } : c) }));
  const q = questions[String(editing.industryId)];
  useEffect(() => {
    if (editing.industryId && !questions[String(editing.industryId)]) loadQuestions(editing.industryId).catch(() => toast.error('Failed to load questions'));
  }, [editing.industryId, questions, loadQuestions]);
  // Only SKU-active List questions: duty answers are not stored on the item, so
  // the Books BOM could never evaluate a condition on them.
  const condProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType !== 'Range');
  const qtyProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType === 'Range');
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Product</label>
          <select style={selectStyle} value={editing.industryId}
            onChange={e => { const id = e.target.value; setEditing(v => ({ ...v, industryId: id, conditions: [], qtyPropertyId: '' })); }}>
            <option value="">—</option>
            {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>Component</label>
          <input style={inputStyle} value={editing.component} onChange={set('component')} placeholder="e.g. Body casting" list="cmap-components" autoFocus />
          <datalist id="cmap-components">{distinct(rows, 'component').map(c => <option key={c} value={c} />)}</datalist></div>
      </div>

      <div>
        <label style={labelStyle}>When (all must hold — none = always)</label>
        {editing.conditions.map((c, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: 8, marginBottom: 6 }}>
            <select style={selectStyle} value={c.propertyId} onChange={e => setCond(i, { propertyId: e.target.value, valueId: '' })}>
              <option value="">Question…</option>
              {condProps.map(p => <option key={p.id} value={p.id}>{p.caption}</option>)}
            </select>
            <select style={selectStyle} value={c.valueId} onChange={e => setCond(i, { valueId: e.target.value })}>
              <option value="">Answer…</option>
              {(q?.values[c.propertyId] || []).map(v => <option key={v.id} value={v.id}>{v.displayValue}</option>)}
            </select>
            <button type="button" title="Remove" onClick={() => setEditing(v => ({ ...v, conditions: v.conditions.filter((_, j) => j !== i) }))}
              style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setEditing(v => ({ ...v, conditions: [...v.conditions, { propertyId: '', valueId: '' }] }))}
          style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>+ Add condition</button>
      </div>

      <div><label style={labelStyle}>Item</label>
        <input style={inputStyle} list="cmap-items" placeholder="Type a SKU or name…"
          defaultValue={itemById.get(String(editing.skuItemId))?.sku || ''}
          onChange={e => { const hit = items.find(x => x.sku === e.target.value); setEditing(v => ({ ...v, skuItemId: hit ? hit.id : '' })); }} />
        {/* ponytail: native datalist over the full item list; swap for a server typeahead past a few thousand items */}
        <datalist id="cmap-items">{items.map(x => <option key={x.id} value={x.sku}>{x.name}</option>)}</datalist>
        <div style={{ fontSize: 11.5, color: editing.skuItemId ? 'var(--text-muted)' : '#dc2626', marginTop: 4 }}>
          {editing.skuItemId ? itemById.get(String(editing.skuItemId))?.name : 'No item picked'}
        </div></div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Qty from</label>
          <select style={selectStyle} value={editing.qtyPropertyId || ''} onChange={set('qtyPropertyId')}>
            <option value="">Fixed qty</option>
            {qtyProps.map(p => <option key={p.id} value={p.id}>Answer: {p.caption}</option>)}
          </select></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
          <div><label style={labelStyle}>Qty per unit</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" min="0" disabled={Boolean(editing.qtyPropertyId)}
              value={editing.qtyPropertyId ? '' : editing.qty} onChange={set('qty')} /></div>
          <div><label style={labelStyle}>UOM</label>
            <select style={selectStyle} value={editing.uom || 'Nos'} onChange={set('uom')}>
              {[...new Set([editing.uom || 'Nos', ...uoms])].map(u => <option key={u}>{u}</option>)}
            </select></div>
        </div>
        <div><label style={labelStyle}>Required</label>
          <select style={selectStyle} value={editing.required ? 'yes' : 'no'} onChange={e => setEditing(v => ({ ...v, required: e.target.value === 'yes' }))}>
            <option value="no">No — optional / accessory</option>
            <option value="yes">Yes — flag when nothing matches</option>
          </select></div>
        <div><label style={labelStyle}>Goes as</label>
          <select style={selectStyle} value={editing.asQuoteLine ? 'separate' : 'bom'} onChange={e => setEditing(v => ({ ...v, asQuoteLine: e.target.value === 'separate' }))}>
            <option value="bom">BOM line (inside the composite)</option>
            <option value="separate">Separate quote line</option>
          </select></div>
        <div><label style={labelStyle}>Status</label>
          <select style={selectStyle} value={editing.status || 'Active'} onChange={set('status')}>
            <option>Active</option><option>Inactive</option>
          </select></div>
      </div>
    </>
  );
}

const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
const FIELDS = [
  { key: 'component', label: 'Component', sortKey: 'component', render: m => <span style={{ fontWeight: 600 }}>{m.component}</span> },
  { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
  { key: 'when', label: 'When', sortKey: 'when', render: m => m.conditions.length ? m.when : muted('Always') },
  { key: 'item', label: 'Item', sortKey: 'item', render: m => m.item || <span style={{ color: '#dc2626' }}>item deleted</span> },
  { key: 'qtyText', label: 'Qty', align: 'right', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{m.qtyText}</span> },
  { key: 'required', label: 'Required', sortKey: 'required', render: m => m.required ? 'Yes' : muted('No') },
  { key: 'asQuoteLine', label: 'Goes as', sortKey: 'asQuoteLine', render: m => m.asQuoteLine ? 'Separate line' : muted('BOM') },
  {
    key: 'status', label: 'Status', sortKey: 'status', render: m => (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: m.status === 'Inactive' ? 'var(--bg-secondary)' : '#dcfce7',
        color: m.status === 'Inactive' ? 'var(--text-muted)' : '#15803d',
      }}>{m.status || 'Active'}</span>
    ),
  },
];
const validate = e => !e.industryId ? 'Product is required'
  : !String(e.component || '').trim() ? 'Component is required'
  : !e.skuItemId ? 'Pick the item'
  : e.conditions.some(c => !c.propertyId || !c.valueId) ? 'Finish or remove the empty condition'
  : (!e.qtyPropertyId && !(Number(e.qty) > 0)) ? 'Qty must be above zero' : null;
const toForm = r => ({ ...EMPTY, ...r, conditions: (r.conditions || []).map(c => ({ ...c })) });
const toBody = e => ({ ...e, qty: e.qtyPropertyId ? 1 : Number(e.qty) });
// One questions fetch per product that has rows, so "When" shows captions.
const loadQuestionsFor = (rows, lk) => {
  for (const id of new Set(rows.map(r => String(r.industryId)))) if (!lk.questions[id]) lk.loadQuestions(id).catch(() => null);
};
const CFG = {
  entityType: 'ComponentMap', listUrl: '/api/recipe/component-map', backTo: '/recipe/component-map',
  title: m => m.component, sub: m => `${m.product}${m.conditions.length ? ` · ${m.when}` : ''} · ${m.item || 'item deleted'}`, statusField: 'status',
  search: m => `${m.component} ${m.product} ${m.when} ${m.item}`,
  filters: [{ label: 'Products', value: m => m.product }, { label: 'Components', value: m => m.component }],
  fields: FIELDS, Form: MapForm, formWidth: 560, validate, toForm, toBody, duplicate: true,
  empty: 'No component rows', deleteHint: 'The widget and the Books BOM stop using it. Set it Inactive instead to keep the row.',
};
export function Detail() {
  const lk = useMapLookups();
  return <MasterDetailPage cfg={{ ...CFG, view: rows => rows.map(r => viewRow(r, lk)), onRows: rows => loadQuestionsFor(rows, lk), formProps: { lk } }} />;
}

// A component group (GET /component-map/components) → the grid row.
function groupView(g, lk) {
  const q = lk.questions[String(g.industryId)];
  const base = g.simple[0] || g.advanced[0] || {};
  const it = lk.items.find(x => String(x.id) === String(base.skuItemId));
  const qp = base.qtyPropertyId && q?.props.find(x => String(x.id) === String(base.qtyPropertyId));
  const prop = g.propertyId && q?.props.find(x => String(x.id) === String(g.propertyId));
  const answers = g.propertyId ? (q?.values[g.propertyId] || []).length : 0;
  return {
    id: `${g.industryId}|${g.component}`, industryId: g.industryId, component: g.component, advanced: g.advanced.length,
    product: lk.industries.find(x => String(x.id) === String(g.industryId))?.name || '',
    item: g.propertyId ? `By ${prop?.caption || 'answer'} · ${g.simple.length}${answers ? `/${answers}` : ''} answers`
      : it ? `${it.sku} — ${it.name}` : (g.simple.length ? 'item deleted' : ''),
    byAnswer: Boolean(g.propertyId),
    service: Boolean(it?.service), // Books product_type → Associated Services section (CR-254)
    qtyText: `${base.qtyPropertyId ? `= ${qp?.caption || 'answer'}` : String(base.qty ?? 1)} ${base.uom || 'Nos'}`,
    required: Boolean(base.required), asQuoteLine: Boolean(base.asQuoteLine), status: base.status || 'Active',
  };
}

const chip = (s) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
    background: s === 'Inactive' ? 'var(--bg-secondary)' : '#dcfce7', color: s === 'Inactive' ? 'var(--text-muted)' : '#15803d',
  }}>{s}</span>
);
const GROUP_COLS = [
  { key: 'component', label: 'Component', sortKey: 'component', lock: true, render: m => <span style={{ fontWeight: 600 }}>{m.component}{m.advanced ? <span title="Has advanced rules" style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>+{m.advanced} rule{m.advanced > 1 ? 's' : ''}</span> : null}</span> },
  { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
  { key: 'item', label: 'Item', sortKey: 'item', render: m => m.item ? <span style={{ color: m.byAnswer ? 'var(--blue)' : 'inherit' }}>{m.item}</span> : muted('advanced rules only') },
  { key: 'qtyText', label: 'Qty', align: 'right', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{m.qtyText}</span> },
  { key: 'required', label: 'Required', sortKey: 'required', render: m => m.required ? 'Yes' : muted('No') },
  { key: 'asQuoteLine', label: 'Goes as', sortKey: 'asQuoteLine', render: m => m.asQuoteLine ? 'Separate line' : muted('BOM') },
  { key: 'status', label: 'Status', sortKey: 'status', render: m => chip(m.status) },
];
// Associated Services (CR-254): like the Books composite form — service · item · qty, nothing else.
const SERVICE_COLS = [
  { ...GROUP_COLS[0], label: 'Service' },
  GROUP_COLS[1], GROUP_COLS[2], GROUP_COLS[3], GROUP_COLS[6],
];
const sectionHead = { padding: '10px 18px', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const addLink = { border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: 0 };

// Test (CR-253): pick answers, see what the widget / Books push will get.
function TestModal({ lk, industryId: initial, onClose }) {
  const [industryId, setIndustryId] = useState(initial || lk.industries[0]?.id || '');
  const [sel, setSel] = useState({});
  const [res, setRes] = useState(null);
  const q = lk.questions[String(industryId)];
  useEffect(() => { if (industryId && !q) lk.loadQuestions(industryId).catch(() => null); }, [industryId, q, lk]);
  const props = (q?.props || []).filter(p => p.activeInSku !== false);
  async function run(next) {
    setSel(next);
    try { setRes((await axios.post('/api/recipe/component-map/resolve', { industryId, selectedValues: next })).data); }
    catch { toast.error('Could not resolve'); }
  }
  return (
    <Modal title="Test the mapping" onClose={onClose} width={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Product</label>
          <select style={selectStyle} value={industryId} onChange={e => { setIndustryId(e.target.value); setSel({}); setRes(null); }}>
            {lk.industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        {props.map(p => (
          <div key={p.id}><label style={labelStyle}>{p.caption}</label>
            {p.valueType === 'Range'
              ? <input style={inputStyle} type="number" value={sel[p.id] ?? ''} onChange={e => run({ ...sel, [p.id]: e.target.value })} />
              : <select style={selectStyle} value={sel[p.id] || ''} onChange={e => run({ ...sel, [p.id]: e.target.value })}>
                  <option value="">—</option>
                  {(q?.values[p.id] || []).map(v => <option key={v.id} value={v.id}>{v.displayValue}</option>)}
                </select>}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
        {!res ? <div style={{ padding: 12, color: 'var(--text-muted)' }}>Pick answers to see the items.</div> : (
          <>
            {res.lines.map(l => (
              <div key={l.component + l.skuItemId} style={{ display: 'flex', gap: 10, padding: '6px 12px', borderBottom: '1px solid var(--border)', color: l.inBooks ? 'inherit' : '#b45309' }}>
                <span style={{ fontWeight: 600, width: 160 }}>{l.component}</span>
                <span style={{ flex: 1 }}>{l.sku ? `${l.sku} · ${l.name || ''}` : 'item deleted'}{lk.items.find(x => String(x.id) === String(l.skuItemId))?.service ? ' · service' : ''}{l.inBooks ? '' : ' · not in Books'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>× {l.qty} {l.uom}{l.asQuoteLine ? ' · separate line' : ''}</span>
              </div>
            ))}
            {res.missing.map(c => (
              <div key={c} style={{ display: 'flex', gap: 10, padding: '6px 12px', borderBottom: '1px solid var(--border)', color: '#dc2626' }}>
                <span style={{ fontWeight: 600, width: 160 }}>{c}</span><span>required — no item mapped for these answers</span>
              </div>
            ))}
            {!res.lines.length && !res.missing.length && <div style={{ padding: 12, color: 'var(--text-muted)' }}>Nothing matches these answers.</div>}
          </>
        )}
      </div>
      <ModalFooter><ModalBtn onClick={onClose}>Close</ModalBtn></ModalFooter>
    </Modal>
  );
}

// Components for the Product Configurator (CR-253): one row per component —
// "item Y always" or "by <question>: answer → item". Row click / New open the
// flat form (ComponentEditPage); rows keyed on 2+ answers stay on the per-row
// details page. The widget lists the matched items under the valve and they
// become the Books composite BOM on push (recipe/componentMap.js).
export default function RecipeComponentMapPage() {
  const [groups, setGroups] = useState([]);
  const lk = useMapLookups();
  const [q, setQ] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [test, setTest] = useState(false);
  const [imp, setImp] = useState(null); // { industryId, rows, errors, busy, done }
  const [sortCol, setSortCol] = useState('component');
  const [sortDir, setSortDir] = useState('asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setGroups((await axios.get('/api/recipe/component-map/components')).data); }
    catch { toast.error('Failed to load the components'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadQuestionsFor(groups, lk); }, [groups, lk.questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { industries } = lk;
  const productName = new Map(industries.map(x => [String(x.id), x.name]));
  const view = groups.map(g => groupView(g, lk));
  const filtered = view.filter(r => matches(q, r.component, r.product, r.item) && (!fProduct || r.product === fProduct));
  const narrowed = Boolean(q.trim() || fProduct);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });
  // Two sections like the Books composite item: items page, services are few and list whole.
  const services = sorted.filter(r => r.service);
  const { pageRows, pager } = usePager(sorted.filter(r => !r.service));
  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const filterIndustryId = industries.find(i => i.name === fProduct)?.id || '';
  const editUrl = m => `/recipe/component-map/edit?industryId=${m.industryId}&component=${encodeURIComponent(m.component)}${m.service ? '&kind=service' : ''}`;
  const newUrl = kind => `/recipe/component-map/new?${filterIndustryId ? `industryId=${filterIndustryId}&` : ''}kind=${kind}`;
  const actions = {
    key: 'actions', label: 'Actions', lock: true, width: 60, render: m => (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
        <RowMenu onEdit={() => navigate(editUrl(m))} onDelete={() => setConfirmDel(m)} />
      </div>
    ),
  };
  const { cols, chooser } = useGridColumns('recipe.components', [...GROUP_COLS, actions]);
  const serviceCols = [...SERVICE_COLS, actions];

  async function handleDelete(m) {
    try {
      await axios.delete('/api/recipe/component-map/component', { params: { industryId: m.industryId, component: m.component } });
      toast.success('Component deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
    finally { setConfirmDel(null); }
  }

  // CR-195: Excel/CSV import into the product picked in the filter (or the first one).
  async function onImportFile(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const industryId = filterIndustryId || industries[0]?.id;
    if (!industryId) return toast.error('Add a product first');
    try {
      const q = lk.questions[String(industryId)] || await lk.loadQuestions(industryId);
      const { rows, errors } = parseMapSheet(await readXlsxFile(file), q, lk.items);
      setImp({ industryId, rows, errors, busy: false, done: 0 });
    } catch (err) { toast.error(err.message || 'Could not read the file'); }
  }
  async function runImport() {
    setImp(v => ({ ...v, busy: true, done: 0 }));
    let ok = 0; const failed = [];
    // ponytail: 5 at a time — Dev functions cap around 10 concurrent
    for (let i = 0; i < imp.rows.length; i += 5) {
      await Promise.all(imp.rows.slice(i, i + 5).map(r =>
        axios.post('/api/recipe/component-map', { ...r, industryId: imp.industryId }).then(() => { ok++; })
          .catch(err => failed.push(`${r.component}: ${err.response?.data?.error || 'failed'}`))));
      setImp(v => v && ({ ...v, done: Math.min(i + 5, imp.rows.length) }));
    }
    setImp(null); load();
    if (failed.length) toast.error(`${ok} imported, ${failed.length} failed: ${failed.slice(0, 3).join('; ')}`);
    else toast.success(`${ok} row(s) imported`);
  }

  const tbtn = { ...inputStyle, width: 'auto', display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'var(--bg-card)', fontSize: 13 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => navigate(newUrl('item'))}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={{ ...tbtn, opacity: lk.syncing ? 0.5 : 1 }} disabled={lk.syncing} onClick={lk.sync} title="Pull new / renamed items from Zoho Books into the item list">Sync from Books</button>
                <button type="button" style={tbtn} onClick={() => setTest(true)} title="Pick answers and see the resolved items">Test</button>
                <label title="Import rows from Excel/CSV into the selected product" style={tbtn}>
                  Import
                  <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={onImportFile} />
                </label>
                <ColumnChooser chooser={chooser} />
                <SearchInput value={q} onChange={setQ} placeholder="Search components…" />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(view, 'product')} />
              </div>
            }
          />
        </div>
        {/* Associated Items — raw material components (paged) */}
        <div style={{ marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={sectionHead}>Associated Items<button type="button" style={addLink} onClick={() => navigate(newUrl('item'))}>+ Add item</button></div>
          {pageRows.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {narrowed ? 'No matches.' : 'No items yet. Add item → name the component, pick its item (or the question it depends on).'}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => navigate(editUrl(m))} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
        {/* Associated Services — labour / processing (CR-254): qty 1 like any RM, no stock, never a WO line */}
        <div style={{ marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={sectionHead}>Associated Services<button type="button" style={addLink} onClick={() => navigate(newUrl('service'))}>+ Add service</button></div>
          {services.length === 0 ? (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              {narrowed ? 'No matches.' : 'No services yet. Add service → Coating, Assembly, Machining… pick the Books service item.'}
            </div>
          ) : (
            <DataTable cols={serviceCols} rows={services} onRowClick={m => navigate(editUrl(m))} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {test && <TestModal lk={lk} industryId={filterIndustryId} onClose={() => setTest(false)} />}

      {imp && (
        <Modal title={`Import into ${productName.get(String(imp.industryId)) || 'product'}`} onClose={() => !imp.busy && setImp(null)} onSubmit={() => imp.rows.length && !imp.busy && runImport()} width={560}>
          <div style={{ fontSize: 13 }}>
            {imp.rows.length} row(s) ready{imp.errors.length ? `, ${imp.errors.length} skipped:` : '.'}
            {imp.errors.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#dc2626', maxHeight: 180, overflow: 'auto' }}>
                {imp.errors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            )}
            <div style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: 12 }}>
              Columns: Component · Item (SKU or name) · Qty · UOM (Nos / Kgs / MM …, blank = Nos) · Required (Y/N) · Goes as (BOM / Separate) · one column per question caption with the answer text.
            </div>
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setImp(null)} disabled={imp.busy}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={runImport} disabled={!imp.rows.length || imp.busy}>
              {imp.busy ? `Importing ${imp.done}/${imp.rows.length}…` : `Import ${imp.rows.length} row(s)`}
            </ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete "${confirmDel.component}"?`}
          confirmLabel="Delete component"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          Every mapping row of this component goes{confirmDel.advanced ? ', advanced rules included' : ''}. The widget and the Books BOM stop using it — set it Inactive instead to keep it.
        </ConfirmModal>
      )}
    </div>
  );
}
