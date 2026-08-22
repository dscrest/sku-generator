import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import RowDeleteButton from '../components/RowDeleteButton.jsx';
import RowEditButton from '../components/RowEditButton.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const tdStyle = { padding: '10px 16px' };

export default function PropertiesPage() {
  const [props, setProps] = useState([]);
  const [sortCol, setSortCol] = useState('industryName');
  const [sortDir, setSortDir] = useState('asc');
  const [fIndustry, setFIndustry] = useState('');
  const [fType, setFType] = useState('');
  const [fRequired, setFRequired] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/properties');
      setProps(data);
    } catch { toast.error('Failed to load properties'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = props.filter(p =>
    (!fIndustry || p.industryName === fIndustry) &&
    (!fType || p.valueType === fType) &&
    (!fRequired || (p.required ? 'Yes' : 'No') === fRequired));

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? '';
    const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });
  const { pageRows, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  async function handleDelete(p) {
    try {
      await axios.delete(`/api/properties/${p.id}`);
      toast.success('Property deleted'); load();
    } catch { toast.error('Failed to delete property'); }
    finally { setConfirmDel(null); }
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
          <div style={{ fontSize: 15, fontWeight: 600 }}>Properties</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>All industries — edit opens the industry's property manager</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <FilterSelect label="industries" value={fIndustry} onChange={setFIndustry} options={distinct(props, 'industryName')} />
                <FilterSelect label="types" value={fType} onChange={setFType} options={distinct(props, 'valueType')} />
                <FilterSelect label="required" value={fRequired} onChange={setFRequired} options={['Yes', 'No']} />
              </div>
            }
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('industryName')}>Industry <SortArrow col="industryName" /></th>
                <th style={thStyle} onClick={() => toggleSort('name')}>Name <SortArrow col="name" /></th>
                <th style={thStyle} onClick={() => toggleSort('caption')}>Caption <SortArrow col="caption" /></th>
                <th style={thStyle} onClick={() => toggleSort('valueType')}>Type <SortArrow col="valueType" /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('skuPosition')}>SKU Pos <SortArrow col="skuPosition" /></th>
                <th style={thStyle} onClick={() => toggleSort('unit')}>Unit <SortArrow col="unit" /></th>
                <th style={thStyle} onClick={() => toggleSort('required')}>Required <SortArrow col="required" /></th>
                <th style={{ ...thStyle, width: 84 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No properties found.</td></tr>
              )}
              {pageRows.map(p => (
                <tr
                  key={p.id}
                  style={{ borderTop: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={tdStyle}>
                    <a
                      onClick={() => navigate(`/sku/industries/${p.industryId}/properties`)}
                      style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'none' }}
                      title="Open in property manager"
                    >{p.industryName || p.industryId} ›</a>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.name}</td>
                  <td style={tdStyle}>{p.caption}</td>
                  <td style={tdStyle}>{p.valueType}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.skuPosition}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{p.unit || '—'}</td>
                  <td style={tdStyle}>{p.required ? 'Yes' : 'No'}</td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <RowEditButton onEdit={() => navigate(`/sku/industries/${p.industryId}/properties`)} title={`Edit in ${p.industryName || 'industry'} manager`} />
                      <RowDeleteButton onDelete={() => setConfirmDel(p)} title={`Delete ${p.caption || p.name}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />

      {confirmDel && (
        <ConfirmModal
          title={`Delete property "${confirmDel.caption || confirmDel.name}"?`}
          confirmLabel="Delete property"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          The property and its values are removed. This cannot be undone.
        </ConfirmModal>
      )}
    </div>
  );
}
