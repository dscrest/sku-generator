import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import { SearchInput, matches } from '../components/GridFooter.jsx';

const inputStyle = {
  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '9px 12px',
  fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)',
  outline: 'none', transition: 'border-color 0.12s',
};
const labelStyle = {
  fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5,
};
const selectStyle = {
  ...inputStyle, appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 30,
};

const emptyProp = { name: '', caption: '', unit: '', valueType: 'Manual', rangeMin: '', rangeMax: '', required: false, includeInName: false, zohoCfApiName: '', clubKey: '', valueSource: 'manual', showInWidget: false, sizingRole: '', booksCategoryId: '' };

// Where a property's values come from (CR-288). Stored server-side as two flags;
// the API speaks `valueSource`.
const SOURCES = [
  { value: 'manual', label: 'This app', hint: 'Values are typed here (Properties → values).' },
  { value: 'items', label: 'Zoho Books items in a category', hint: 'Every active item of the picked Books category is a value; values added here become Books items.' },
  { value: 'options', label: 'Options of the Zoho Books field', hint: 'The dropdown options of the mapped Books item field are the values; a value added here is appended to the field\'s options.' },
];
const sourceLabel = v => (SOURCES.find(s => s.value === v) || SOURCES[0]).label;
const isOptionField = f => !!f && /^(dropdown|multiselect|multi_select|multiselect_dropdown)$/i.test(f.data_type || '');
const cfText = f => `${f.label || f.api_name} · ${f.api_name}${f.data_type ? ` · ${f.data_type}` : ''}`;

// Zoho Books item custom fields (CR-288): null = not loaded, false = Books unreachable, [] = none.
// Loaded on action (form open / Mapping view), once per page.
function useCfFields() {
  const [cfFields, setCfFields] = useState(null);
  const load = useCallback(() => {
    if (cfFields !== null) return;
    axios.get('/api/zoho/item-custom-fields').then(r => setCfFields(r.data || [])).catch(() => setCfFields(false));
  }, [cfFields]);
  return [cfFields, load];
}

// Books category pick for the Mapping grid (CR-286 key). One read per page, on first use.
let _catsCache = null;
function CategorySelect({ value, onChange, style = selectStyle }) {
  const [cats, setCats] = useState(_catsCache);
  useEffect(() => {
    if (cats !== null) return;
    axios.get('/api/properties/books-categories').then(r => { _catsCache = r.data || []; setCats(_catsCache); }).catch(() => setCats([]));
  }, [cats]);
  return (
    <select style={style} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{cats === null ? 'Loading…' : '— none —'}</option>
      {(cats || []).map(c => <option key={c.id} value={c.id}>{c.parent ? `${c.parent} › ${c.name}` : c.name}</option>)}
      {value && cats && !cats.some(c => c.id === value) && <option value={value}>Category {value}</option>}
    </select>
  );
}

// Books field pick: a select from the live list, the stored api name kept when
// it is not in the list, a plain text box when Books could not be read.
function CfSelect({ value, onChange, cfFields, usedBy = {}, style = selectStyle, onFocus, onBlur }) {
  if (cfFields === false) {
    return <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="cf_brand — Books unreachable, type the api_name" onFocus={onFocus} onBlur={onBlur} />;
  }
  const list = cfFields || [];
  return (
    <select style={style} value={value || ''} onChange={e => onChange(e.target.value)} onFocus={onFocus} onBlur={onBlur}>
      <option value="">{cfFields === null ? 'Loading fields from Zoho Books…' : '— not mapped —'}</option>
      {list.map(f => <option key={f.api_name} value={f.api_name}>{cfText(f)}{usedBy[f.api_name] ? ` · also on ${usedBy[f.api_name]}` : ''}</option>)}
      {value && !list.some(f => f.api_name === value) && <option value={value}>{value}</option>}
    </select>
  );
}
const emptyVal = { displayValue: '', name: '', sku: '', description: '', createAsItem: false, isDefault: false, capMin: '', capMax: '' };

// Single-club combobox: shows the current club as a removable chip, filters
// existing clubs as you type, and offers "Create" for a new name. One club per
// property — sets clubKey to the chosen/typed string, '' clears it.
function ClubPicker({ value, onChange, clubKeys }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const query = q.trim();
  const matches = clubKeys.filter(k => k.toLowerCase().includes(query.toLowerCase()));
  const exact = clubKeys.some(k => k.toLowerCase() === query.toLowerCase());
  const pick = v => { onChange(v); setQ(''); setOpen(false); };

  if (value) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 20, padding: '4px 10px' }}>
          ⛓ {value}
          <button type="button" onClick={() => onChange('')} title="Remove club" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6d28d9', fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
        </span>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input
        style={inputStyle} value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={e => { setOpen(true); e.target.style.borderColor = 'var(--blue)'; }}
        onBlur={e => { setTimeout(() => setOpen(false), 150); e.target.style.borderColor = 'var(--border)'; }}
        onKeyDown={e => { if (e.key === 'Enter' && query) { e.preventDefault(); pick(query); } }}
        placeholder="Search clubs or type a new name — blank to keep separate"
      />
      {open && (matches.length > 0 || (query && !exact)) && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', maxHeight: 200, overflowY: 'auto' }}>
          {matches.map(k => (
            <div key={k} onMouseDown={() => pick(k)} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              ⛓ {k}
            </div>
          ))}
          {query && !exact && (
            <div onMouseDown={() => pick(query)} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--blue)', fontWeight: 600, borderTop: matches.length ? '1px solid var(--border)' : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              + Create "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PropForm({ form, setForm, onSubmit, onCancel, label, clubKeys = [], cfFields }) {
  const fi = e => e.target.style.borderColor = 'var(--blue)';
  const fo = e => e.target.style.borderColor = 'var(--border)';
  // Books item categories (CR-286): read once the source is Books items; the pick is the Sync from Books key
  const [cats, setCats] = useState(null); // null = not loaded, [] = none / Books unreachable
  useEffect(() => {
    if (form.valueSource !== 'items' || cats !== null) return;
    axios.get('/api/properties/books-categories').then(r => setCats(r.data)).catch(() => setCats([]));
  }, [form.valueSource, cats]);
  const cf = (cfFields || []).find(f => f.api_name === form.zohoCfApiName) || null;
  const optionsOk = cfFields === false ? !!form.zohoCfApiName : isOptionField(cf);
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus onFocus={fi} onBlur={fo} /></div>
        <div><label style={labelStyle}>Caption <span style={{ color: '#e11d48' }}>*</span></label><input style={inputStyle} value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
        <div><label style={labelStyle}>Unit</label><input style={inputStyle} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="e.g. Inch, GB" onFocus={fi} onBlur={fo} /></div>
        <div>
          <label style={labelStyle}>Value Type <span style={{ color: '#e11d48' }}>*</span></label>
          <select style={selectStyle} value={form.valueType} onChange={e => setForm(f => ({ ...f, valueType: e.target.value }))} onFocus={fi} onBlur={fo}>
            <option value="Manual">Manual</option>
            <option value="Range">Range</option>
          </select>
        </div>
      </div>
      {form.valueType === 'Range' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>Range Min</label><input type="number" style={inputStyle} value={form.rangeMin} onChange={e => setForm(f => ({ ...f, rangeMin: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
          <div><label style={labelStyle}>Range Max</label><input type="number" style={inputStyle} value={form.rangeMax} onChange={e => setForm(f => ({ ...f, rangeMax: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
        </div>
      )}
      <div>
        <label style={labelStyle}>Club</label>
        <ClubPicker value={form.clubKey} onChange={v => setForm(f => ({ ...f, clubKey: v }))} clubKeys={clubKeys} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Pick an existing club or create a new one — properties sharing a club combine into one SKU segment with no separator between their codes.</div>
      </div>
      <div>
        <label style={labelStyle}>Zoho Books field</label>
        <CfSelect value={form.zohoCfApiName} onChange={v => setForm(f => ({ ...f, zohoCfApiName: v, valueSource: f.valueSource === 'options' && !v ? 'manual' : f.valueSource }))} cfFields={cfFields} onFocus={fi} onBlur={fo} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>This property's value is written into that Books item field on push and read back on import.{cf && isOptionField(cf) ? ` ${cf.values?.length || 0} option${cf.values?.length === 1 ? '' : 's'} in Books.` : ''}</div>
      </div>
      <div>
        <label style={labelStyle}>Values come from</label>
        {SOURCES.map(s => {
          const off = s.value === 'options' && !optionsOk;
          return (
            <label key={s.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: off ? 'not-allowed' : 'pointer', fontSize: 13, color: off ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: 6 }}>
              <input type="radio" name="valueSource" style={{ marginTop: 3 }} disabled={off} checked={form.valueSource === s.value} onChange={() => setForm(f => ({ ...f, valueSource: s.value }))} />
              <span>{s.label}
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {s.hint}{off ? (form.zohoCfApiName ? ' Pick a dropdown field above to use this.' : ' Pick a Zoho Books dropdown field above to use this.') : ''}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {form.valueSource === 'items' && (
        <div>
          <label style={labelStyle}>Books category</label>
          <select style={selectStyle} value={form.booksCategoryId || ''} onChange={e => setForm(f => ({ ...f, booksCategoryId: e.target.value }))} onFocus={fi} onBlur={fo}>
            <option value="">— none —</option>
            {(cats || []).map(c => <option key={c.id} value={c.id}>{c.parent ? `${c.parent} › ${c.name}` : c.name}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {cats === null ? 'Loading categories from Zoho Books…' : cats.length === 0 ? 'No categories found in Zoho Books.' : 'Sync from Books pulls every item in this category in as a value.'}
          </div>
        </div>
      )}
      <div>
        <label style={labelStyle}>Sizing role (Product Configurator)</label>
        <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={form.sizingRole || ''} onChange={e => setForm(f => ({ ...f, sizingRole: e.target.value }))}>
          <option value="">None — ordinary question</option>
          <option value="capacity">Capacity (TPH) — sizing input</option>
          <option value="density">Bulk density (kg/ltr) — sizing input</option>
          <option value="speed">Speed (RPM) — sizing input</option>
          <option value="group">Type / group — filters the sizing models</option>
          <option value="series">Series — filled by the picked model</option>
          <option value="model">Model — filled by the picked model</option>
        </select>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
        Required for SKU generation
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.showInWidget} onChange={e => setForm(f => ({ ...f, showInWidget: e.target.checked }))} />
        Show as CRM widget search filter
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— appears in the quote widget's Add-filter menu</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.includeInName} onChange={e => setForm(f => ({ ...f, includeInName: e.target.checked }))} />
        Include in item name
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— tick none and every property is used</span>
      </label>
      <ModalFooter><ModalBtn onClick={onCancel}>Cancel</ModalBtn><ModalBtn onClick={onSubmit} variant="primary">{label}</ModalBtn></ModalFooter>
    </>
  );
}

function ValForm({ form, setForm, onSubmit, onCancel, label }) {
  const fi = e => e.target.style.borderColor = 'var(--blue)';
  const fo = e => e.target.style.borderColor = 'var(--border)';
  return (
    <>
      <div><label style={labelStyle}>Display Value <span style={{ color: '#e11d48' }}>*</span></label><input style={inputStyle} value={form.displayValue} onChange={e => setForm(f => ({ ...f, displayValue: e.target.value }))} autoFocus onFocus={fi} onBlur={fo} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
        <div><label style={labelStyle}>SKU Code <span style={{ color: '#e11d48' }}>*</span></label><input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
      </div>
      <div><label style={labelStyle}>Description</label><input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Auto-pick from (capacity)</label><input type="number" step="any" style={inputStyle} value={form.capMin} onChange={e => setForm(f => ({ ...f, capMin: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
        <div><label style={labelStyle}>to</label><input type="number" step="any" style={inputStyle} value={form.capMax} onChange={e => setForm(f => ({ ...f, capMax: e.target.value }))} onFocus={fi} onBlur={fo} /></div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -6 }}>Pre-selected in the CRM configurator when the capacity input (TPH) falls in this band; sales can still change it.</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />
        Set as default value
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— pre-selected in the SKU generator (one per property)</span>
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['##Property##', '##Caption##', '##Unit##'].map(tag => (
          <span key={tag} style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 20, fontSize: 10, fontWeight: 500, padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>{tag}</span>
        ))}
      </div>
      {form.zohoItemId && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 20, fontSize: 10, fontWeight: 600, padding: '2px 8px' }}>✓ In Books</span>
          {' '}synced from this property's "Values are Zoho Books items" setting.
        </div>
      )}
      <ModalFooter><ModalBtn onClick={onCancel}>Cancel</ModalBtn><ModalBtn onClick={onSubmit} variant="primary">{label}</ModalBtn></ModalFooter>
    </>
  );
}

export default function PropertyManagerPage() {
  const { id: industryId } = useParams();
  const [properties, setProperties] = useState([]);
  const [selectedProp, setSelectedProp] = useState(null);
  const [values, setValues] = useState([]);
  const [selectedVal, setSelectedVal] = useState(null);
  const [industryName, setIndustryName] = useState('');
  const [showAddProp, setShowAddProp] = useState(false);
  const [showEditProp, setShowEditProp] = useState(false);
  const [showAddVal, setShowAddVal] = useState(false);
  const [showEditVal, setShowEditVal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // { kind: 'prop'|'val', row }
  const [propForm, setPropForm] = useState(emptyProp);
  const [valForm, setValForm] = useState(emptyVal);
  const [dragOver, setDragOver] = useState(null);
  // CR-288: Properties (two panes) or Mapping (one grid: property ↔ Books field, side by side)
  const [view, setView] = useState('props');
  const [cfFields, loadCfFields] = useCfFields();
  const [mapQ, setMapQ] = useState('');
  const [valueCounts, setValueCounts] = useState(null); // propertyId -> count, mapping view only
  const [syncingAll, setSyncingAll] = useState(false);
  const loadValueCounts = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/industries/${industryId}/property-values`);
      setValueCounts(Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, (v || []).length])));
    } catch { setValueCounts({}); }
  }, [industryId]);
  useEffect(() => {
    if (view !== 'mapping') return;
    loadCfFields();
    loadValueCounts();
  }, [view, loadCfFields, loadValueCounts]);

  const loadProperties = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/industries/${industryId}/properties`);
      setProperties(data);
    } catch { toast.error('Failed to load properties'); }
  }, [industryId]);

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => {
      const ind = data.find(i => String(i.id) === String(industryId));
      if (ind) setIndustryName(ind.name);
    });
    loadProperties();
  }, [industryId, loadProperties]);

  const loadValues = useCallback(async (propId) => {
    try {
      const { data } = await axios.get(`/api/properties/${propId}/values`);
      setValues(data);
    } catch { toast.error('Failed to load values'); }
  }, []);

  useEffect(() => {
    if (selectedProp) loadValues(selectedProp.id);
    else setValues([]);
    setSelectedVal(null);
  }, [selectedProp, loadValues]);

  // The selected row as the list has it now (an edit reloads the list, not the selection)
  const curProp = selectedProp ? properties.find(p => String(p.id) === String(selectedProp.id)) || selectedProp : null;
  const [syncing, setSyncing] = useState(false);
  // CR-286 / CR-288: Books category items or Books field options → values. Never deletes a value.
  async function syncFromBooks(prop = curProp) {
    setSyncing(true);
    const tid = toast.loading(`Syncing ${prop.caption || prop.name} from Zoho Books…`);
    try {
      const { data } = await axios.post(`/api/properties/${prop.id}/sync-books`);
      toast.success(`${data.created} new, ${data.linked} linked, ${data.renamed} renamed`, { id: tid });
      if (curProp && String(curProp.id) === String(prop.id)) loadValues(prop.id);
      if (view === 'mapping') loadValueCounts();
    } catch (err) { toast.error(err.response?.data?.error || 'Sync failed', { id: tid }); }
    finally { setSyncing(false); }
  }
  async function syncAll() {
    setSyncingAll(true);
    const tid = toast.loading('Syncing every Books-backed property…');
    try {
      const { data } = await axios.post('/api/properties/sync-books-all', { industryId });
      const failed = data.synced.filter(x => x.error);
      const created = data.synced.reduce((n, x) => n + (x.created || 0), 0);
      if (failed.length) toast.error(`${created} new · ${failed.map(f => `${f.caption}: ${f.error}`).join(' · ')}`, { id: tid, duration: 8000 });
      else toast.success(`${data.properties} propert${data.properties === 1 ? 'y' : 'ies'} synced, ${created} new value${created === 1 ? '' : 's'}`, { id: tid });
      loadValueCounts();
      if (curProp) loadValues(curProp.id);
    } catch (err) { toast.error(err.response?.data?.error || 'Sync failed', { id: tid }); }
    finally { setSyncingAll(false); }
  }
  // Inline save from the Mapping grid: one field at a time, the list reloads
  async function saveMapping(prop, patch) {
    try {
      await axios.put(`/api/properties/${prop.id}`, patch);
      loadProperties();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update property'); }
  }
  const syncKeyOf = p => (p.valueSource === 'items' ? p.booksCategoryId : p.valueSource === 'options' ? p.zohoCfApiName : null);
  const syncHint = p => (p.valueSource === 'items'
    ? (p.booksCategoryId ? 'Pull this property\'s Books category items in as values' : 'Pick a Books category on the property first')
    : (p.zohoCfApiName ? 'Pull the Books field\'s options in as values' : 'Pick the Zoho Books field on the property first'));

  async function handleAddProp() {
    if (!propForm.name.trim() || !propForm.caption.trim()) return toast.error('Name and Caption are required');
    const nextPos = properties.length > 0 ? Math.max(...properties.map(p => p.skuPosition)) + 1 : 1;
    try {
      await axios.post('/api/properties', { ...propForm, skuPosition: nextPos, industryId });
      toast.success('Property created'); setShowAddProp(false); setPropForm(emptyProp); loadProperties();
    } catch { toast.error('Failed to create property'); }
  }

  function openEditProp(prop) {
    setSelectedProp(prop);
    setPropForm({ name: prop.name, caption: prop.caption, unit: prop.unit || '', valueType: prop.valueType, rangeMin: prop.rangeMin ?? '', rangeMax: prop.rangeMax ?? '', required: !!prop.required, includeInName: !!prop.includeInName, zohoCfApiName: prop.zohoCfApiName || '', clubKey: prop.clubKey || '', valueSource: prop.valueSource || (prop.createValuesAsItems ? 'items' : 'manual'), showInWidget: !!prop.showInWidget, sizingRole: prop.sizingRole || '', booksCategoryId: prop.booksCategoryId || '' });
    loadCfFields();
    setShowEditProp(true);
  }

  async function handleEditProp() {
    try {
      await axios.put(`/api/properties/${selectedProp.id}`, propForm);
      toast.success('Property updated'); setShowEditProp(false); loadProperties();
    } catch { toast.error('Failed to update property'); }
  }

  async function handleDeleteProp(prop) {
    setConfirmDel(null);
    try {
      await axios.delete(`/api/properties/${prop.id}`);
      toast.success('Property deleted');
      if (selectedProp?.id === prop.id) setSelectedProp(null);
      loadProperties();
    } catch { toast.error('Failed to delete property'); }
  }

  async function handleAddVal() {
    if (!valForm.displayValue.trim() || !valForm.name.trim() || !valForm.sku.trim()) return toast.error('Display Value, Name, SKU required');
    try {
      await axios.post('/api/property-values', { ...valForm, propertyId: selectedProp.id });
      toast.success('Value created'); setShowAddVal(false); setValForm(emptyVal); loadValues(selectedProp.id);
    } catch { toast.error('Failed to create value'); }
  }

  function openEditVal(val) {
    setSelectedVal(val);
    setValForm({ displayValue: val.displayValue, name: val.name, sku: val.sku, description: val.description || '', createAsItem: !!val.createAsItem, isDefault: !!val.isDefault, zohoItemId: val.zohoItemId || '', capMin: val.capMin ?? '', capMax: val.capMax ?? '' });
    setShowEditVal(true);
  }

  async function handleEditVal() {
    try {
      await axios.put(`/api/property-values/${selectedVal.id}`, valForm);
      toast.success('Value updated'); setShowEditVal(false); setSelectedVal(null); loadValues(selectedProp.id);
    } catch { toast.error('Failed to update value'); }
  }

  async function handleDeleteVal(val) {
    setConfirmDel(null);
    try {
      await axios.delete(`/api/property-values/${val.id}`);
      toast.success('Value deleted');
      if (selectedVal?.id === val.id) setSelectedVal(null);
      loadValues(selectedProp.id);
    } catch { toast.error('Failed to delete value'); }
  }

  async function onDrop(e, targetProp) {
    const dragId = e.dataTransfer.getData('propId');
    if (String(dragId) === String(targetProp.id)) return;
    const reordered = [...properties];
    const fromIdx = reordered.findIndex(p => String(p.id) === String(dragId));
    const toIdx = reordered.findIndex(p => p.id === targetProp.id);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updated = reordered.map((p, i) => ({ ...p, skuPosition: i + 1 }));
    setProperties(updated); setDragOver(null);
    try {
      await Promise.all(updated.map(p => axios.put(`/api/properties/${p.id}`, { skuPosition: p.skuPosition })));
    } catch { toast.error('Failed to reorder'); loadProperties(); }
  }

  const thStyle = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' };

  // Existing clubs in this industry — feed the Club field's typeahead datalist.
  const clubKeys = [...new Set(properties.map(p => p.clubKey).filter(Boolean))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', flexShrink: 0, gap: 8 }}>
        <Link to="/settings/sku/industries" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>Industries</Link>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{industryName || '…'} — Properties</span>
        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
          {[['props', 'Properties'], ['mapping', 'Mapping']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              style={{ height: 28, padding: '0 12px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, background: view === k ? 'var(--blue)' : 'var(--bg-card)', color: view === k ? '#fff' : 'var(--text-secondary)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {view === 'mapping' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '20px 24px' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar
              onRefresh={() => { loadProperties(); loadValueCounts(); }}
              right={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <SearchInput value={mapQ} onChange={setMapQ} placeholder="Search properties…" />
                  <button type="button" onClick={syncAll} disabled={syncingAll || !properties.some(p => syncKeyOf(p))}
                    title="Sync every property whose values come from Zoho Books (items or field options)"
                    style={{ ...inputStyle, width: 'auto', display: 'flex', alignItems: 'center', background: 'var(--bg-card)', fontSize: 13, cursor: 'pointer', opacity: syncingAll || !properties.some(p => syncKeyOf(p)) ? 0.5 : 1 }}>
                    {syncingAll ? 'Syncing…' : 'Sync all from Books'}
                  </button>
                </div>
              }
            />
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>
                  <th style={thStyle}>Property</th>
                  <th style={thStyle}>Values come from</th>
                  <th style={thStyle}>Zoho Books field</th>
                  <th style={thStyle}>Books category</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Values</th>
                  <th style={{ ...thStyle, width: 120 }}></th>
                </tr></thead>
                <tbody>
                  {properties.filter(p => matches(mapQ, p.name, p.caption, p.zohoCfApiName, sourceLabel(p.valueSource))).map(p => {
                    const cf = (cfFields || []).find(f => f.api_name === p.zohoCfApiName) || null;
                    const optionsOk = cfFields === false ? !!p.zohoCfApiName : isOptionField(cf);
                    // other properties of this industry already on a Books field → "also on …" in the select
                    const usedBy = Object.fromEntries(properties.filter(o => o.zohoCfApiName && String(o.id) !== String(p.id)).map(o => [o.zohoCfApiName, o.name]));
                    const cell = { padding: '8px 12px', borderTop: '1px solid var(--border)', verticalAlign: 'middle' };
                    const sel = { ...selectStyle, padding: '6px 28px 6px 10px', background: 'var(--bg-card)' };
                    return (
                      <tr key={p.id}>
                        <td style={cell}>
                          <div style={{ fontWeight: 500 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.caption}{p.unit ? ` · ${p.unit}` : ''}</div>
                        </td>
                        <td style={{ ...cell, minWidth: 200 }}>
                          <select style={sel} value={p.valueSource || 'manual'} onChange={e => saveMapping(p, { valueSource: e.target.value })}>
                            {SOURCES.map(s => <option key={s.value} value={s.value} disabled={s.value === 'options' && !optionsOk}>{s.label}{s.value === 'options' && !optionsOk ? ' (needs a dropdown field)' : ''}</option>)}
                          </select>
                        </td>
                        <td style={{ ...cell, minWidth: 240 }}>
                          <CfSelect value={p.zohoCfApiName} cfFields={cfFields} usedBy={usedBy} style={sel}
                            onChange={v => saveMapping(p, { zohoCfApiName: v, ...(p.valueSource === 'options' && !v ? { valueSource: 'manual' } : {}) })} />
                        </td>
                        <td style={{ ...cell, minWidth: 180 }}>
                          {p.valueSource === 'items' ? <CategorySelect value={p.booksCategoryId} onChange={v => saveMapping(p, { booksCategoryId: v })} style={sel} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{valueCounts ? (valueCounts[String(p.id)] || 0) : '…'}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>
                          {p.valueSource !== 'manual' && (
                            <button type="button" onClick={() => syncFromBooks(p)} disabled={!syncKeyOf(p) || syncing} title={syncHint(p)}
                              style={{ ...inputStyle, width: 'auto', padding: '6px 10px', display: 'inline-flex', alignItems: 'center', background: 'var(--bg-card)', fontSize: 12.5, cursor: syncKeyOf(p) ? 'pointer' : 'not-allowed', opacity: !syncKeyOf(p) || syncing ? 0.5 : 1 }}>
                              Sync
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {properties.length === 0 && <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>No properties. Add them on the Properties view.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'props' && <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar onAdd={() => { setPropForm(emptyProp); loadCfFields(); setShowAddProp(true); }} onRefresh={loadProperties} />
            <div>
              {properties.length === 0 && <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No properties. Click + to add.</div>}
              {properties.map(prop => {
                const sel = selectedProp?.id === prop.id;
                return (
                  <div key={prop.id} className="list-row" draggable onDragStart={e => e.dataTransfer.setData('propId', prop.id)} onDragOver={e => { e.preventDefault(); setDragOver(prop.id); }} onDragLeave={() => setDragOver(null)} onDrop={e => onDrop(e, prop)} onClick={() => setSelectedProp(sel ? null : prop)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s', background: dragOver === prop.id ? 'var(--blue-mid)' : sel ? 'var(--blue-light)' : 'transparent', borderLeft: `3px solid ${sel ? 'var(--blue)' : 'transparent'}` }}
                    onMouseEnter={e => { if (!sel && dragOver !== prop.id) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={e => { if (!sel && dragOver !== prop.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ color: 'var(--text-muted)', cursor: 'grab' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                    </div>
                    <div style={{ width: 30, height: 30, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {prop.name}
                        {prop.required && <span style={{ fontSize: 9, fontWeight: 700, color: '#e11d48', background: '#fef2f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>REQUIRED</span>}
                        {prop.includeInName && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-light)', border: '1px solid var(--blue-border)', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>IN NAME</span>}
                        {prop.activeInSku === false && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>NOT IN SKU</span>}
                        {prop.clubKey && <span title={`Clubbed: ${prop.clubKey}`} style={{ fontSize: 9, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>⛓ {prop.clubKey}</span>}
                        {prop.valueSource === 'items' && <span title="Values of this property are Zoho Books items" style={{ fontSize: 9, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>→ BOOKS</span>}
                        {prop.valueSource === 'options' && <span title={`Values of this property are the options of the Books field ${prop.zohoCfApiName || ''}`} style={{ fontSize: 9, fontWeight: 700, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>⇄ FIELD</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{prop.caption}{prop.unit ? ` · ${prop.unit}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, flexShrink: 0, background: prop.valueType === 'Range' ? 'var(--orange-light)' : 'var(--bg-secondary)', color: prop.valueType === 'Range' ? 'var(--orange)' : 'var(--text-secondary)', border: `1px solid ${prop.valueType === 'Range' ? 'var(--orange-border)' : 'var(--border)'}` }}>{prop.valueType}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 10, padding: '1px 7px', flexShrink: 0 }}>#{prop.skuPosition}</span>
                    <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <RowMenu onEdit={() => openEditProp(prop)} onDelete={() => setConfirmDel({ kind: 'prop', row: prop })} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar
              onAdd={selectedProp ? () => { setValForm(emptyVal); setShowAddVal(true); } : undefined}
              onRefresh={selectedProp ? () => loadValues(selectedProp.id) : undefined}
              right={curProp && curProp.valueSource !== 'manual' ? (
                <button type="button" onClick={() => syncFromBooks()} disabled={!syncKeyOf(curProp) || syncing}
                  title={syncHint(curProp)}
                  style={{ ...inputStyle, width: 'auto', display: 'flex', alignItems: 'center', cursor: syncKeyOf(curProp) ? 'pointer' : 'not-allowed', background: 'var(--bg-card)', fontSize: 13, opacity: !syncKeyOf(curProp) || syncing ? 0.5 : 1 }}>
                  Sync from Books
                </button>
              ) : undefined}
            />
            {!selectedProp ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Select a property to view its values</div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={thStyle}>Display Value</th><th style={thStyle}>Name</th><th style={thStyle}>SKU Code</th><th style={{ ...thStyle, width: 48 }}></th></tr></thead>
                  <tbody>
                    {values.length === 0 && <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>No values. Click + to add.</td></tr>}
                    {values.map(val => {
                      return (
                        <tr key={val.id} onClick={() => openEditVal(val)} title="Click to edit"
                          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '10px 16px' }}>
                            {val.displayValue}
                            {val.isDefault && <span title="Default value — pre-selected in the SKU generator" style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '1px 6px', letterSpacing: '0.03em' }}>DEFAULT</span>}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{val.name}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>{val.sku}</td>
                          <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                            <RowMenu onEdit={() => openEditVal(val)} onDelete={() => setConfirmDel({ kind: 'val', row: val })} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: 6, padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  {['##Property##', '##Caption##', '##Unit##'].map(tag => (
                    <span key={tag} style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 20, fontSize: 10, fontWeight: 500, padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>{tag}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>}

      {showAddProp && <Modal title="New" onClose={() => setShowAddProp(false)} onSubmit={handleAddProp}><PropForm form={propForm} setForm={setPropForm} clubKeys={clubKeys} cfFields={cfFields} onSubmit={handleAddProp} onCancel={() => setShowAddProp(false)} label="Create" /></Modal>}
      {showEditProp && <Modal title="Edit" onClose={() => setShowEditProp(false)} onSubmit={handleEditProp}><PropForm form={propForm} setForm={setPropForm} clubKeys={clubKeys} cfFields={cfFields} onSubmit={handleEditProp} onCancel={() => setShowEditProp(false)} label="Save" /></Modal>}
      {showAddVal && <Modal title="New" onClose={() => setShowAddVal(false)} onSubmit={handleAddVal}><ValForm form={valForm} setForm={setValForm} onSubmit={handleAddVal} onCancel={() => setShowAddVal(false)} label="Create" /></Modal>}
      {showEditVal && <Modal title="Edit" onClose={() => setShowEditVal(false)} onSubmit={handleEditVal}><ValForm form={valForm} setForm={setValForm} onSubmit={handleEditVal} onCancel={() => setShowEditVal(false)} label="Save" /></Modal>}
      {confirmDel && (
        <ConfirmModal
          title={confirmDel.kind === 'prop' ? `Delete property "${confirmDel.row.name}"?` : `Delete value "${confirmDel.row.displayValue}"?`}
          confirmLabel={confirmDel.kind === 'prop' ? 'Delete property' : 'Delete value'}
          onConfirm={() => (confirmDel.kind === 'prop' ? handleDeleteProp(confirmDel.row) : handleDeleteVal(confirmDel.row))}
          onClose={() => setConfirmDel(null)}
        >
          {confirmDel.kind === 'prop'
            ? 'The property and its values are removed. This cannot be undone.'
            : 'The value is removed. This cannot be undone.'}
        </ConfirmModal>
      )}
    </div>
  );
}
