import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import RowDeleteButton from '../components/RowDeleteButton.jsx';

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
  const [items, setItems] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [editForm, setEditForm] = useState(null); // { id, name, sku, description, type } | null
  const [saving, setSaving] = useState(false);

  // Text filters (free-text + SKU), debounced so we don't fire per keystroke.
  const [q, setQ] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [debounced, setDebounced] = useState({ q: '', sku: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ q: q.trim(), sku: skuFilter.trim() }), 300);
    return () => clearTimeout(t);
  }, [q, skuFilter]);

  // Client-side pagination. ponytail: pages the already-fetched result set
  // (one 300-row ZCQL page); switch to server LIMIT/OFFSET when data outgrows it.
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

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
      setPage(0);
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

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handlePushZoho(item, e) {
    e.stopPropagation();
    const tid = toast.loading(`Pushing "${item.sku}" to Zoho…`);
    try {
      const { data } = await axios.post(`/api/sku-items/${item.id}/push-zoho`);
      toast.success(`Synced! Zoho ID: ${data.zohoItemId}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Push failed', { id: tid });
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

  function openEdit(item) {
    setEditForm({ id: item.id, name: item.name, sku: item.sku, description: item.description || '', type: item.type });
  }

  async function handleEditSave() {
    if (!editForm.name.trim() || !editForm.sku.trim()) return toast.error('Name and SKU are required');
    setSaving(true);
    try {
      await axios.put(`/api/sku-items/${editForm.id}`, {
        name: editForm.name, sku: editForm.sku, description: editForm.description, type: editForm.type,
      });
      toast.success('SKU updated'); setEditForm(null); load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setSaving(false); }
  }

  async function handleDelete(item) {
    if (!confirm(`Delete SKU "${item.sku}"?`)) return;
    try {
      await axios.delete(`/api/sku-items/${item.id}`);
      toast.success('Item deleted'); load();
    } catch { toast.error('Failed to delete item'); }
  }

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(curPage * pageSize, (curPage + 1) * pageSize);

  const PageBtn = ({ onClick, disabled, title, path }) => (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>SKU Items</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Home / SKU Items</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                  <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No SKU items yet. Create one from SKU Generator.</td></tr>
                )}
                {paged.map(item => {
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openEdit(item)}
                      title="Click to edit"
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
                          title={item.zohoItemId ? `Zoho ID: ${item.zohoItemId}` : 'Push to Zoho Books'}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', fontSize: 11, fontWeight: 600,
                            background: item.zohoItemId ? '#f0fdf4' : '#fff7ed',
                            color: item.zohoItemId ? '#16a34a' : '#ea580c',
                            border: `1px solid ${item.zohoItemId ? '#bbf7d0' : '#fed7aa'}`,
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>Z</span>
                          {item.zohoItemId ? 'Synced' : 'Push'}
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

      {/* Pagination footer — page-level, pinned below the scroll area (never moves or resizes) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {total === 0 ? 'No records' : `Showing ${curPage * pageSize + 1}–${Math.min((curPage + 1) * pageSize, total)} of ${total} record${total !== 1 ? 's' : ''}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
            style={{ ...selectStyle, padding: '4px 8px' }}
            title="Records per page"
          >
            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <PageBtn title="First page" disabled={curPage === 0} onClick={() => setPage(0)} path="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
          <PageBtn title="Previous page" disabled={curPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))} path="M15 18l-6-6 6-6" />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px' }}>{curPage + 1} / {pageCount}</span>
          <PageBtn title="Next page" disabled={curPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} path="M9 18l6-6-6-6" />
          <PageBtn title="Last page" disabled={curPage >= pageCount - 1} onClick={() => setPage(pageCount - 1)} path="M13 17l5-5-5-5M6 17l5-5-5-5" />
        </div>
      </div>

      {editForm && (
        <Modal title="Edit SKU Item" onClose={() => setEditForm(null)}>
          <div><label style={labelStyle}>Name <span style={{ color: '#e11d48' }}>*</span></label>
            <input style={inputStyle} value={editForm.name} autoFocus onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div><label style={labelStyle}>SKU <span style={{ color: '#e11d48' }}>*</span></label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={editForm.sku} onChange={e => setEditForm(f => ({ ...f, sku: e.target.value }))} /></div>
          <div><label style={labelStyle}>Description</label>
            <input style={inputStyle} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div><label style={labelStyle}>Type</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
              <option value="Trading">Trading</option>
              <option value="Manufacturing">Manufacturing</option>
            </select></div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditForm(null)}>Cancel</ModalBtn>
            <ModalBtn onClick={handleEditSave} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
