import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';

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

const emptyProp = { name: '', caption: '', unit: '', valueType: 'Manual', rangeMin: '', rangeMax: '' };
const emptyVal = { displayValue: '', name: '', sku: '', description: '' };

function PropForm({ form, setForm, onSubmit, onCancel, label }) {
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

  async function handleEditProp() {
    try {
      await axios.put(`/api/properties/${selectedProp.id}`, propForm);
      toast.success('Property updated'); setShowEditProp(false); loadProperties();
    } catch { toast.error('Failed to update property'); }
  }

  async function handleDeleteProp() {
    if (!selectedProp || !confirm(`Delete property "${selectedProp.name}"?`)) return;
    try {
      await axios.delete(`/api/properties/${selectedProp.id}`);
      toast.success('Property deleted'); setSelectedProp(null); loadProperties();
    } catch { toast.error('Failed to delete property'); }
  }

  async function handleAddVal() {
    if (!valForm.displayValue.trim() || !valForm.name.trim() || !valForm.sku.trim()) return toast.error('Display Value, Name, SKU required');
    try {
      await axios.post('/api/property-values', { ...valForm, propertyId: selectedProp.id });
      toast.success('Value created'); setShowAddVal(false); setValForm(emptyVal); loadValues(selectedProp.id);
    } catch { toast.error('Failed to create value'); }
  }

  async function handleEditVal() {
    try {
      await axios.put(`/api/property-values/${selectedVal.id}`, valForm);
      toast.success('Value updated'); setShowEditVal(false); setSelectedVal(null); loadValues(selectedProp.id);
    } catch { toast.error('Failed to update value'); }
  }

  async function handleDeleteVal() {
    if (!selectedVal || !confirm(`Delete value "${selectedVal.displayValue}"?`)) return;
    try {
      await axios.delete(`/api/property-values/${selectedVal.id}`);
      toast.success('Value deleted'); setSelectedVal(null); loadValues(selectedProp.id);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', flexShrink: 0, gap: 8 }}>
        <Link to="/admin/industries" style={{ fontSize: 13, color: 'var(--blue)', textDecoration: 'none', fontWeight: 500 }}>Industries</Link>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{industryName || '…'} — Properties</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar onAdd={() => { setPropForm(emptyProp); setShowAddProp(true); }} onEdit={selectedProp ? () => { setPropForm({ name: selectedProp.name, caption: selectedProp.caption, unit: selectedProp.unit || '', valueType: selectedProp.valueType, rangeMin: selectedProp.rangeMin ?? '', rangeMax: selectedProp.rangeMax ?? '' }); setShowEditProp(true); } : undefined} onDelete={handleDeleteProp} onRefresh={loadProperties} selectedCount={selectedProp ? 1 : 0} />
            <div>
              {properties.length === 0 && <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No properties. Click + to add.</div>}
              {properties.map(prop => {
                const sel = selectedProp?.id === prop.id;
                return (
                  <div key={prop.id} draggable onDragStart={e => e.dataTransfer.setData('propId', prop.id)} onDragOver={e => { e.preventDefault(); setDragOver(prop.id); }} onDragLeave={() => setDragOver(null)} onDrop={e => onDrop(e, prop)} onClick={() => setSelectedProp(sel ? null : prop)}
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
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{prop.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{prop.caption}{prop.unit ? ` · ${prop.unit}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, flexShrink: 0, background: prop.valueType === 'Range' ? 'var(--orange-light)' : 'var(--bg-secondary)', color: prop.valueType === 'Range' ? 'var(--orange)' : 'var(--text-secondary)', border: `1px solid ${prop.valueType === 'Range' ? 'var(--orange-border)' : 'var(--border)'}` }}>{prop.valueType}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 10, padding: '1px 7px', flexShrink: 0 }}>#{prop.skuPosition}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <Toolbar onAdd={selectedProp ? () => { setValForm(emptyVal); setShowAddVal(true); } : undefined} onEdit={selectedVal ? () => { setValForm({ displayValue: selectedVal.displayValue, name: selectedVal.name, sku: selectedVal.sku, description: selectedVal.description || '' }); setShowEditVal(true); } : undefined} onDelete={handleDeleteVal} onRefresh={selectedProp ? () => loadValues(selectedProp.id) : undefined} selectedCount={selectedVal ? 1 : 0} />
            {!selectedProp ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Select a property to view its values</div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead><tr><th style={thStyle}>Display Value</th><th style={thStyle}>Name</th><th style={thStyle}>SKU Code</th></tr></thead>
                  <tbody>
                    {values.length === 0 && <tr><td colSpan={3} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>No values. Click + to add.</td></tr>}
                    {values.map(val => {
                      const sel = selectedVal?.id === val.id;
                      return (
                        <tr key={val.id} onClick={() => setSelectedVal(sel ? null : val)}
                          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: sel ? 'var(--blue-light)' : 'transparent', borderLeft: `3px solid ${sel ? 'var(--blue)' : 'transparent'}`, transition: 'background 0.1s' }}
                          onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                          onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '10px 16px' }}>{val.displayValue}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{val.name}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)' }}>{val.sku}</td>
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

      {showAddProp && <Modal title="Add Property" onClose={() => setShowAddProp(false)}><PropForm form={propForm} setForm={setPropForm} onSubmit={handleAddProp} onCancel={() => setShowAddProp(false)} label="Create" /></Modal>}
      {showEditProp && <Modal title="Edit Property" onClose={() => setShowEditProp(false)}><PropForm form={propForm} setForm={setPropForm} onSubmit={handleEditProp} onCancel={() => setShowEditProp(false)} label="Save" /></Modal>}
      {showAddVal && <Modal title="Add Value" onClose={() => setShowAddVal(false)}><ValForm form={valForm} setForm={setValForm} onSubmit={handleAddVal} onCancel={() => setShowAddVal(false)} label="Create" /></Modal>}
      {showEditVal && <Modal title="Edit Value" onClose={() => setShowEditVal(false)}><ValForm form={valForm} setForm={setValForm} onSubmit={handleEditVal} onCancel={() => setShowEditVal(false)} label="Save" /></Modal>}
    </div>
  );
}
