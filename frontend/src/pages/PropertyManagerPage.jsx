import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import RowDeleteButton from '../components/RowDeleteButton.jsx';

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

const emptyProp = { name: '', caption: '', unit: '', valueType: 'Manual', rangeMin: '', rangeMax: '', required: false, includeInName: false, zohoCfApiName: '', clubKey: '' };
const emptyVal = { displayValue: '', name: '', sku: '', description: '', createAsItem: false };

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

function PropForm({ form, setForm, onSubmit, onCancel, label, clubKeys = [] }) {
  const fi = e => e.target.style.borderColor = 'var(--blue)';
  const fo = e => e.target.style.borderColor = 'var(--border)';
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
        <label style={labelStyle}>Zoho Books custom field (api_name)</label>
        <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={form.zohoCfApiName} onChange={e => setForm(f => ({ ...f, zohoCfApiName: e.target.value }))} placeholder="cf_brand — leave blank to skip sync" onFocus={fi} onBlur={fo} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>This property's value syncs into the matching Books item custom field, and is read back on import.</div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.required} onChange={e => setForm(f => ({ ...f, required: e.target.checked }))} />
        Required for SKU generation
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['##Property##', '##Caption##', '##Unit##'].map(tag => (
          <span key={tag} style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 20, fontSize: 10, fontWeight: 500, padding: '2px 8px', fontFamily: 'var(--font-mono)' }}>{tag}</span>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={!!form.createAsItem} onChange={e => setForm(f => ({ ...f, createAsItem: e.target.checked }))} />
        Also create as an item in Zoho Books
        {form.zohoItemId && <span style={{ background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--blue-border)', borderRadius: 20, fontSize: 10, fontWeight: 600, padding: '2px 8px' }}>✓ In Books</span>}
      </label>
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
  const [propForm, setPropForm] = useState(emptyProp);
  const [valForm, setValForm] = useState(emptyVal);
  const [dragOver, setDragOver] = useState(null);

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
    setPropForm({ name: prop.name, caption: prop.caption, unit: prop.unit || '', valueType: prop.valueType, rangeMin: prop.rangeMin ?? '', rangeMax: prop.rangeMax ?? '', required: !!prop.required, includeInName: !!prop.includeInName, zohoCfApiName: prop.zohoCfApiName || '', clubKey: prop.clubKey || '' });
    setShowEditProp(true);
  }

  async function handleEditProp() {
    try {
      await axios.put(`/api/properties/${selectedProp.id}`, propForm);
      toast.success('Property updated'); setShowEditProp(false); loadProperties();
    } catch { toast.error('Failed to update property'); }
  }

  async function handleDeleteProp(prop) {
    if (!confirm(`Delete property "${prop.name}"?`)) return;
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
    setValForm({ displayValue: val.displayValue, name: val.name, sku: val.sku, description: val.description || '', createAsItem: !!val.createAsItem, zohoItemId: val.zohoItemId || '' });
    setShowEditVal(true);
  }

  async function handleEditVal() {
    try {
      await axios.put(`/api/property-values/${selectedVal.id}`, valForm);
      toast.success('Value updated'); setShowEditVal(false); setSelectedVal(null); loadValues(selectedProp.id);
    } catch { toast.error('Failed to update value'); }
  }

  async function handleDeleteVal(val) {
    if (!confirm(`Delete value "${val.displayValue}"?`)) return;
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
        <Link to="/sku/industries" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>Industries</Link>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{industryName || '…'} — Properties</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar onAdd={() => { setPropForm(emptyProp); setShowAddProp(true); }} onRefresh={loadProperties} />
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
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{prop.caption}{prop.unit ? ` · ${prop.unit}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, flexShrink: 0, background: prop.valueType === 'Range' ? 'var(--orange-light)' : 'var(--bg-secondary)', color: prop.valueType === 'Range' ? 'var(--orange)' : 'var(--text-secondary)', border: `1px solid ${prop.valueType === 'Range' ? 'var(--orange-border)' : 'var(--border)'}` }}>{prop.valueType}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 10, padding: '1px 7px', flexShrink: 0 }}>#{prop.skuPosition}</span>
                    <div className="row-actions" style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        title={`Edit ${prop.name}`}
                        onClick={e => { e.stopPropagation(); openEditProp(prop); }}
                        style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <RowDeleteButton onDelete={() => handleDeleteProp(prop)} title={`Delete ${prop.name}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar onAdd={selectedProp ? () => { setValForm(emptyVal); setShowAddVal(true); } : undefined} onRefresh={selectedProp ? () => loadValues(selectedProp.id) : undefined} />
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
                          <td style={{ padding: '10px 16px' }}>{val.displayValue}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{val.name}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>{val.sku}</td>
                          <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                            <RowDeleteButton onDelete={() => handleDeleteVal(val)} title={`Delete ${val.displayValue}`} />
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
      </div>

      {showAddProp && <Modal title="Add Property" onClose={() => setShowAddProp(false)}><PropForm form={propForm} setForm={setPropForm} clubKeys={clubKeys} onSubmit={handleAddProp} onCancel={() => setShowAddProp(false)} label="Create" /></Modal>}
      {showEditProp && <Modal title="Edit Property" onClose={() => setShowEditProp(false)}><PropForm form={propForm} setForm={setPropForm} clubKeys={clubKeys} onSubmit={handleEditProp} onCancel={() => setShowEditProp(false)} label="Save" /></Modal>}
      {showAddVal && <Modal title="Add Value" onClose={() => setShowAddVal(false)}><ValForm form={valForm} setForm={setValForm} onSubmit={handleAddVal} onCancel={() => setShowAddVal(false)} label="Create" /></Modal>}
      {showEditVal && <Modal title="Edit Value" onClose={() => setShowEditVal(false)}><ValForm form={valForm} setForm={setValForm} onSubmit={handleEditVal} onCancel={() => setShowEditVal(false)} label="Save" /></Modal>}
    </div>
  );
}
