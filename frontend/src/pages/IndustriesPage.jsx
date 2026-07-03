import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import RowDeleteButton from '../components/RowDeleteButton.jsx';
import RowEditButton from '../components/RowEditButton.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';

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
const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};

export default function IndustriesPage() {
  const [industries, setIndustries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState({ name: '', skuSeparator: '' });
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [fName, setFName] = useState('');
  const [fSep, setFSep] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/industries');
      setIndustries(data);
    } catch { toast.error('Failed to load industries'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = industries.filter(i =>
    (!fName || i.name === fName) && (!fSep || i.skuSeparator === fSep));
  const sorted = [...filtered].sort((a, b) => {
    const v = a[sortCol] < b[sortCol] ? -1 : a[sortCol] > b[sortCol] ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });
  const { pageRows, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handleAdd() {
    if (!form.name.trim()) return toast.error('Name is required');
    try {
      await axios.post('/api/industries', form);
      toast.success('Industry created');
      setShowAdd(false); setForm({ name: '', skuSeparator: '' }); load();
    } catch { toast.error('Failed to create industry'); }
  }

  function openEdit(ind) {
    setSelected(ind);
    setForm({ name: ind.name, skuSeparator: ind.skuSeparator });
    setShowEdit(true);
  }

  async function handleEdit() {
    try {
      await axios.put(`/api/industries/${selected.id}`, form);
      toast.success('Industry updated');
      setShowEdit(false); setSelected(null); load();
    } catch { toast.error('Failed to update industry'); }
  }

  async function handleDelete(ind) {
    if (!confirm(`Delete "${ind.name}"?`)) return;
    try {
      await axios.delete(`/api/industries/${ind.id}`);
      toast.success('Industry deleted'); load();
    } catch { toast.error('Failed to delete industry'); }
  }

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  const focusIn = e => e.target.style.borderColor = 'var(--blue)';
  const focusOut = e => e.target.style.borderColor = 'var(--border)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Industries</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Admin / Industries</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
          {industries.length} record{industries.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => { setForm({ name: '', skuSeparator: '' }); setShowAdd(true); }}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <FilterSelect label="names" value={fName} onChange={setFName} options={distinct(industries, 'name')} />
                <FilterSelect label="separators" value={fSep} onChange={setFSep} options={distinct(industries, 'skuSeparator')} />
              </div>
            }
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 60 }} onClick={() => toggleSort('id')}>ID <SortArrow col="id" /></th>
                <th style={thStyle} onClick={() => toggleSort('name')}>Name <SortArrow col="name" /></th>
                <th style={thStyle} onClick={() => toggleSort('skuSeparator')}>SKU Separator <SortArrow col="skuSeparator" /></th>
                <th style={{ ...thStyle, width: 84 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No industries found.</td></tr>
              )}
              {pageRows.map(ind => {
                return (
                  <tr
                    key={ind.id}
                    style={{ borderTop: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{ind.id}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>
                      <a
                        onClick={() => navigate(`/sku/industries/${ind.id}/properties`)}
                        style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'none' }}
                        title="Open properties"
                      >{ind.name} ›</a>
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>"{ind.skuSeparator}"</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <RowEditButton onEdit={() => openEdit(ind)} title={`Edit ${ind.name}`} />
                        <RowDeleteButton onDelete={() => handleDelete(ind)} title={`Delete ${ind.name}`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />

      {showAdd && (
        <Modal title="Add Industry" onClose={() => setShowAdd(false)}>
          <div>
            <label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Valve" autoFocus onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>SKU Separator</label>
            <input style={inputStyle} value={form.skuSeparator} onChange={e => setForm(f => ({ ...f, skuSeparator: e.target.value }))} placeholder='e.g. - or leave blank' onFocus={focusIn} onBlur={focusOut} />
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setShowAdd(false)}>Cancel</ModalBtn>
            <ModalBtn onClick={handleAdd} variant="primary">Create</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {showEdit && selected && (
        <Modal title="Edit Industry" onClose={() => setShowEdit(false)}>
          <div>
            <label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus onFocus={focusIn} onBlur={focusOut} />
          </div>
          <div>
            <label style={labelStyle}>SKU Separator</label>
            <input style={inputStyle} value={form.skuSeparator} onChange={e => setForm(f => ({ ...f, skuSeparator: e.target.value }))} onFocus={focusIn} onBlur={focusOut} />
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setShowEdit(false)}>Cancel</ModalBtn>
            <ModalBtn onClick={handleEdit} variant="primary">Save</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
