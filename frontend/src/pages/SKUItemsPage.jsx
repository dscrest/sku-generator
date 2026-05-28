import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};

export default function SKUItemsPage() {
  const [items, setItems] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');

  const load = useCallback(async () => {
    try {
      const params = filterIndustry ? { industryId: filterIndustry } : {};
      const { data } = await axios.get('/api/sku-items', { params });
      setItems(data);
    } catch { toast.error('Failed to load SKU items'); }
  }, [filterIndustry]);

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => setIndustries(data));
  }, []);

  useEffect(() => { load(); }, [load]);

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

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete SKU "${selected.sku}"?`)) return;
    try {
      await axios.delete(`/api/sku-items/${selected.id}`);
      toast.success('Item deleted'); setSelected(null); load();
    } catch { toast.error('Failed to delete item'); }
  }

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>SKU Items</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Home / SKU Items</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={filterIndustry}
            onChange={e => setFilterIndustry(e.target.value)}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 28px 6px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none', cursor: 'pointer', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
          >
            <option value="">All Industries</option>
            {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
          </select>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
            {items.length} record{items.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar onDelete={handleDelete} onRefresh={load} selectedCount={selected ? 1 : 0} />
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
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No SKU items yet. Create one from SKU Generator.</td></tr>
                )}
                {sorted.map(item => {
                  const sel = selected?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelected(sel ? null : item)}
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: sel ? 'var(--blue-light)' : 'transparent', borderLeft: `3px solid ${sel ? 'var(--blue)' : 'transparent'}`, transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
