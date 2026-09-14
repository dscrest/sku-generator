import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

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

  // Columns need navigate + delete state, so they're built in-render.
  const COLUMNS = [
    {
      key: 'industryName', label: 'Industry', lock: true, sortKey: 'industryName', render: p => (
        <a
          onClick={e => { e.stopPropagation(); navigate(`/sku/industries/${p.industryId}/properties`); }}
          style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'none' }}
          title="Open in property manager"
        >{p.industryName || p.industryId} ›</a>
      ),
    },
    { key: 'name', label: 'Name', sortKey: 'name', render: p => <span style={{ fontWeight: 500 }}>{p.name}</span> },
    { key: 'caption', label: 'Caption', sortKey: 'caption', render: p => p.caption },
    { key: 'valueType', label: 'Type', sortKey: 'valueType', render: p => p.valueType },
    { key: 'skuPosition', label: 'SKU Pos', sortKey: 'skuPosition', align: 'right', render: p => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{p.skuPosition}</span> },
    { key: 'unit', label: 'Unit', sortKey: 'unit', render: p => <span style={{ color: 'var(--text-muted)' }}>{p.unit || '—'}</span> },
    { key: 'required', label: 'Required', sortKey: 'required', render: p => p.required ? 'Yes' : 'No' },
    {
      key: 'actions', label: '', lock: true, width: 84, render: p => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu editLabel="Edit in manager" onEdit={() => navigate(`/sku/industries/${p.industryId}/properties`)} onDelete={() => setConfirmDel(p)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('sku.properties', COLUMNS);

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
                <ColumnChooser chooser={chooser} />
                <FilterSelect label="industries" value={fIndustry} onChange={setFIndustry} options={distinct(props, 'industryName')} />
                <FilterSelect label="types" value={fType} onChange={setFType} options={distinct(props, 'valueType')} />
                <FilterSelect label="required" value={fRequired} onChange={setFRequired} options={['Yes', 'No']} />
              </div>
            }
          />
          <DataTable
            cols={cols} rows={pageRows}
            onRowClick={p => navigate(`/sku/industries/${p.industryId}/properties`)}
            sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort}
          />
          {pageRows.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No properties found.</div>
          )}
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
