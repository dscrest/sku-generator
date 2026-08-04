import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import { ModalBtn } from '../components/Modal.jsx';
import RowDeleteButton from '../components/RowDeleteButton.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';

const inputStyle = {
  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '9px 12px',
  fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box',
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

const selectStyle = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none',
};

export default function SKUItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  // Zoho Books master–detail: selected item id opens the left-list + detail
  // layout; editForm is the detail panel's working copy.
  // ponytail: local state; promote to a /sku/items/:id route if deep-linking is needed
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState(null); // { id, name, sku, description, type } | null
  const [saving, setSaving] = useState(false);
  const [pushingId, setPushingId] = useState(null); // item id currently syncing to Zoho

  // Text filters (free-text + SKU), debounced so we don't fire per keystroke.
  // ?q= seeds the box so a global-search hit lands on a filtered grid.
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [skuFilter, setSkuFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [debounced, setDebounced] = useState({ q: initialQ, sku: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ q: q.trim(), sku: skuFilter.trim() }), 300);
    return () => clearTimeout(t);
  }, [q, skuFilter]);

  // Property search
  const [properties, setProperties] = useState([]);
  const [valueOpts, setValueOpts] = useState({});      // propertyId -> PropertyValue[]
  const [filters, setFilters] = useState([]);          // [{ propertyId, valueId?, text?, label }]
  const [draftProp, setDraftProp] = useState('');
  const [draftVal, setDraftVal] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/sku-items/search', {
        industryId: filterIndustry || undefined,
        q: debounced.q || undefined,
        sku: debounced.sku || undefined,
        type: typeFilter || undefined,
        filters: filters.map(({ propertyId, valueId, text }) => ({ propertyId, valueId, text })),
      });
      setItems(data);
    } catch { toast.error('Failed to load SKU items'); }
  }, [filterIndustry, filters, debounced, typeFilter]);

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => setIndustries(data));
  }, []);

  // Properties are industry-scoped; reset the property filters when industry changes.
  useEffect(() => {
    setFilters([]); setDraftProp(''); setDraftVal('');
    if (!filterIndustry) { setProperties([]); return; }
    axios.get(`/api/industries/${filterIndustry}/properties`).then(({ data }) => setProperties(data));
  }, [filterIndustry]);

  // Load value options for the property being drafted (list types only).
  useEffect(() => {
    setDraftVal('');
    const prop = properties.find(p => String(p.id) === String(draftProp));
    if (!prop || prop.valueType === 'Range' || valueOpts[draftProp]) return;
    axios.get(`/api/properties/${draftProp}/values`)
      .then(({ data }) => setValueOpts(v => ({ ...v, [draftProp]: data })));
  }, [draftProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const draftPropObj = properties.find(p => String(p.id) === String(draftProp));

  // Applies immediately (list: on select; range: on Enter/Apply) — no separate Add step.
  function applyFilter(propId, val) {
    const prop = properties.find(p => String(p.id) === String(propId));
    if (!prop || val === '') return;
    if (prop.valueType === 'Range') {
      setFilters(f => [...f, { propertyId: propId, text: val, label: `${prop.caption}: ${val}` }]);
    } else {
      const v = (valueOpts[propId] || []).find(o => String(o.id) === String(val));
      setFilters(f => [...f, { propertyId: propId, valueId: val, label: `${prop.caption}: ${v?.displayValue ?? val}` }]);
    }
    setDraftProp(''); setDraftVal('');
  }

  const anyFilter = q || skuFilter || typeFilter || filterIndustry || filters.length > 0;
  function clearFilters() {
    setQ(''); setSkuFilter(''); setTypeFilter(''); setFilterIndustry('');
    setFilters([]); setDraftProp(''); setDraftVal('');
  }

  function removeFilter(i) {
    setFilters(f => f.filter((_, idx) => idx !== i));
  }

  const sorted = [...items].sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (sortCol === 'industry') { av = a.industry?.name || ''; bv = b.industry?.name || ''; }
    const v = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });

  const { pageRows: paged, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handlePushZoho(item, e) {
    e.stopPropagation();
    if (pushingId) return; // guard against double-clicks while a push is in flight
    setPushingId(item.id);
    const verb = item.zohoItemId ? 'Re-pushing' : 'Pushing';
    const tid = toast.loading(`${verb} "${item.sku}" to Zoho Books…`);
    try {
      const { data } = await axios.post(`/api/sku-items/${item.id}/push-zoho`);
      toast.success(`Synced to Zoho Books · ID ${data.zohoItemId}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Push failed', { id: tid });
    } finally {
      setPushingId(null);
    }
  }

  async function handleImportZoho() {
    if (!filterIndustry) return toast.error('Select an industry to import into');
    const tid = toast.loading('Importing from Zoho Books…');
    try {
      const { data } = await axios.post('/api/sku-items/import-zoho', { industryId: filterIndustry });
      toast.success(`Imported ${data.imported}, skipped ${data.skipped}${data.valuesMapped ? `, ${data.valuesMapped} values mapped` : ''}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed', { id: tid });
    }
  }

  function openDetail(item) {
    setSelected(item.id);
    setEditForm({ id: item.id, name: item.name, sku: item.sku, description: item.description || '', type: item.type });
  }

  function closeDetail() {
    setSelected(null);
    setEditForm(null);
  }

  async function handleEditSave() {
    if (!editForm.name.trim() || !editForm.sku.trim()) return toast.error('Name and SKU are required');
    setSaving(true);
    try {
      await axios.put(`/api/sku-items/${editForm.id}`, {
        name: editForm.name, sku: editForm.sku, description: editForm.description, type: editForm.type,
      });
      toast.success('SKU updated'); load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete SKU "${item.sku}"?`)) return;
    try {
      await axios.delete(`/api/sku-items/${item.id}`);
      toast.success('Item deleted');
      if (String(item.id) === String(selected)) closeDetail();
      load();
    } catch { toast.error('Failed to delete item'); }
  }

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  // Detail mode needs the fresh row for the read-only bits (industry, Zoho);
  // editForm keeps the user's in-progress edits.
  const selectedItem = selected != null ? items.find(i => String(i.id) === String(selected)) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>SKUs</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Home / SKU Generator</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => navigate('/sku/generator')}
            title="Generate a new SKU"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--blue)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + New
          </button>
          <button
            onClick={handleImportZoho}
            disabled={!filterIndustry}
            title={filterIndustry ? 'Import new items from Zoho Books into this industry' : 'Select an industry first'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c', cursor: filterIndustry ? 'pointer' : 'not-allowed', opacity: filterIndustry ? 1 : 0.5, whiteSpace: 'nowrap' }}
          >
            <span style={{ fontWeight: 700 }}>Z</span> Import from Zoho
          </button>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
            {items.length} record{items.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filter bar: free-text, SKU, Type, Industry (always) + property filters (needs an industry) */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search SKU or name…"
          style={{ ...selectStyle, width: 200 }}
        />
        <input
          value={skuFilter}
          onChange={e => setSkuFilter(e.target.value)}
          placeholder="SKU…"
          style={{ ...selectStyle, width: 130, fontFamily: 'var(--font-mono)' }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="Trading">Trading</option>
          <option value="Manufacturing">Manufacturing</option>
        </select>
        <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} style={selectStyle}>
          <option value="">All Industries</option>
          {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
        </select>
        {!filterIndustry ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select an industry to filter by property.</span>
        ) : (
          <>
            <select value={draftProp} onChange={e => setDraftProp(e.target.value)} style={selectStyle}>
              <option value="">Property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.caption}</option>)}
            </select>
            {draftPropObj && (draftPropObj.valueType === 'Range' ? (
              <>
                <input
                  value={draftVal} onChange={e => setDraftVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyFilter(draftProp, draftVal)}
                  placeholder={`Value${draftPropObj.unit ? ' (' + draftPropObj.unit + ')' : ''} — Enter to apply`}
                  autoFocus
                  style={{ ...selectStyle, width: 180 }}
                />
                <button onClick={() => applyFilter(draftProp, draftVal)} disabled={draftVal === ''}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', opacity: draftVal === '' ? 0.5 : 1 }}>
                  Apply
                </button>
              </>
            ) : (
              <select value={draftVal} onChange={e => applyFilter(draftProp, e.target.value)} style={selectStyle}>
                <option value="">Value…</option>
                {(valueOpts[draftProp] || []).map(v => <option key={v.id} value={v.id}>{v.displayValue}</option>)}
              </select>
            ))}
            {filters.map((f, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 14, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--border)' }}>
                {f.label}
                <span onClick={() => removeFilter(i)} style={{ cursor: 'pointer', fontWeight: 700 }}>×</span>
              </span>
            ))}
          </>
        )}
        {anyFilter && (
          <button
            onClick={clearFilters}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e11d48'; e.currentTarget.style.borderColor = '#fecdd3'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      {!selected ? (
        <>
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <Toolbar onRefresh={load} />
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={thStyle} onClick={() => toggleSort('name')}>Name <SortArrow col="name" /></th>
                      <th style={thStyle} onClick={() => toggleSort('sku')}>SKU <SortArrow col="sku" /></th>
                      <th style={thStyle} onClick={() => toggleSort('description')}>Description <SortArrow col="description" /></th>
                      <th style={thStyle} onClick={() => toggleSort('type')}>Type <SortArrow col="type" /></th>
                      <th style={thStyle} onClick={() => toggleSort('industry')}>Industry <SortArrow col="industry" /></th>
                      <th style={thStyle} onClick={() => toggleSort('createdAt')}>Created <SortArrow col="createdAt" /></th>
                      <th style={{ ...thStyle, width: 110 }}>Zoho</th>
                      <th style={{ ...thStyle, width: 48 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No SKU items yet. Click "+ New" to generate one.</td></tr>
                    )}
                    {paged.map(item => {
                      return (
                        <tr
                          key={item.id}
                          onClick={() => openDetail(item)}
                          title="Click to view details"
                          style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ padding: '10px 16px', fontWeight: 500 }}>{item.name}</td>
                          <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{item.sku}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 240 }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '—'}</div>
                          </td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: item.type === 'Trading' ? '#f0fdf4' : '#faf5ff', color: item.type === 'Trading' ? '#16a34a' : '#7c3aed', border: `1px solid ${item.type === 'Trading' ? '#bbf7d0' : '#e9d5ff'}` }}>
                              {item.type}
                            </span>
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>{item.industry?.name || '—'}</td>
                          <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString()}</td>
                          <td style={{ padding: '8px 16px' }} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={e => handlePushZoho(item, e)}
                              disabled={pushingId === item.id}
                              title={item.zohoItemId ? `Synced to Zoho Books (ID ${item.zohoItemId}) — click to re-push updates` : 'Push to Zoho Books'}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5,
                                padding: '4px 10px', fontSize: 11, fontWeight: 600,
                                background: item.zohoItemId ? '#f0fdf4' : '#fff7ed',
                                color: item.zohoItemId ? '#16a34a' : '#ea580c',
                                border: `1px solid ${item.zohoItemId ? '#bbf7d0' : '#fed7aa'}`,
                                borderRadius: 'var(--radius-sm)',
                                cursor: pushingId === item.id ? 'wait' : 'pointer',
                                opacity: pushingId === item.id ? 0.6 : 1, whiteSpace: 'nowrap',
                              }}
                            >
                              <span style={{ fontWeight: 700 }}>Z</span>
                              {pushingId === item.id ? 'Pushing…' : item.zohoItemId ? '✓ Synced · Re-push' : 'Push'}
                            </button>
                          </td>
                          <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                            <RowDeleteButton onDelete={() => handleDelete(item)} title={`Delete ${item.sku}`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <GridFooter pager={pager} />
        </>
      ) : (
        /* Zoho Books master–detail: narrow item list on the left, detail on the right */
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)' }}>
            {sorted.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No matching items</div>
            )}
            {sorted.map(item => {
              const active = String(item.id) === String(selected);
              return (
                <div
                  key={item.id}
                  onClick={() => openDetail(item)}
                  style={{
                    padding: '10px 13px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: active ? 'var(--blue-light)' : 'transparent',
                    borderLeft: `3px solid ${active ? 'var(--blue)' : 'transparent'}`,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    {item.zohoItemId && <span title={`Zoho ID: ${item.zohoItemId}`} style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>Z</span>}
                  </div>
                  <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--blue)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sku}
                  </div>
                </div>
              );
            })}
          </div>

          {editForm && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              <div style={{ maxWidth: 760, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editForm.name || '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--blue)', marginTop: 2 }}>{editForm.sku}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {selectedItem && (
                      <button
                        onClick={e => handlePushZoho(selectedItem, e)}
                        disabled={pushingId === selectedItem.id}
                        title={selectedItem.zohoItemId ? `Synced to Zoho Books (ID ${selectedItem.zohoItemId}) — click to re-push updates` : 'Push to Zoho Books'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, fontWeight: 600,
                          background: selectedItem.zohoItemId ? '#f0fdf4' : '#fff7ed',
                          color: selectedItem.zohoItemId ? '#16a34a' : '#ea580c',
                          border: `1px solid ${selectedItem.zohoItemId ? '#bbf7d0' : '#fed7aa'}`,
                          borderRadius: 'var(--radius-sm)',
                          cursor: pushingId === selectedItem.id ? 'wait' : 'pointer',
                          opacity: pushingId === selectedItem.id ? 0.6 : 1, whiteSpace: 'nowrap',
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>Z</span>
                        {pushingId === selectedItem.id ? 'Pushing…' : selectedItem.zohoItemId ? '✓ Synced · Re-push to Zoho' : 'Push to Zoho'}
                      </button>
                    )}
                    <button
                      onClick={closeDetail}
                      title="Close details"
                      style={{ width: 28, height: 28, border: '1px solid var(--border)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label>
                      <input style={inputStyle} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label style={labelStyle}>SKU <span style={{ color: '#e11d48' }}>*</span></label>
                      <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} /></div>
                  </div>
                  <div><label style={labelStyle}>Description</label>
                    <textarea rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                    <div><label style={labelStyle}>Type</label>
                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                        <option value="Trading">Trading</option>
                        <option value="Manufacturing">Manufacturing</option>
                      </select></div>
                    <div><label style={labelStyle}>Industry</label>
                      <div style={{ ...inputStyle, background: 'transparent', border: '1px solid transparent', padding: '9px 0' }}>{selectedItem?.industry?.name || '—'}</div></div>
                    <div><label style={labelStyle}>Created</label>
                      <div style={{ ...inputStyle, background: 'transparent', border: '1px solid transparent', padding: '9px 0' }}>{selectedItem ? new Date(selectedItem.createdAt).toLocaleDateString() : '—'}</div></div>
                  </div>
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => selectedItem && handleDelete(selectedItem)}
                    style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font)', border: '1px solid #fecdd3', background: 'transparent', color: '#e11d48', cursor: 'pointer' }}
                  >
                    Delete
                  </button>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <ModalBtn onClick={closeDetail}>Close</ModalBtn>
                    <ModalBtn onClick={handleEditSave} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ModalBtn>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
