import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import GridFooter, { usePager, FilterSelect, SearchInput, matches, distinct } from '../components/GridFooter.jsx';
import { StatusPill, statusLabel } from './recipeShared.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

const COLUMNS = [
  { key: 'code', label: 'Code', lock: true, render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.code}</span> },
  { key: 'name', label: 'Template', render: r => <span style={{ fontWeight: 600 }}>{r.name}</span> },
  { key: 'productCode', label: 'Product', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.productCode || '—'}</span> },
  { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
  { key: 'effectiveFrom', label: 'Effective', render: r => <span style={{ color: 'var(--text-muted)' }}>{r.effectiveFrom || '—'}</span> },
  { key: 'updated', label: 'Updated', render: r => <span style={{ color: 'var(--text-muted)' }}>{(r.updatedAt || r.createdAt || '').slice(0, 10)}</span> },
];

export default function RecipeListPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fStatus, setFStatus] = useState('');
  const navigate = useNavigate();
  const { cols, chooser } = useGridColumns('recipe.list', COLUMNS);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/recipes');
      setRows(data);
    } catch { toast.error('Failed to load templates'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r =>
    matches(search, r.code, r.name, r.productCode) &&
    (!fProduct || r.productCode === fProduct) &&
    (!fStatus || statusLabel(r.status) === fStatus));
  const { pageRows, pager } = usePager(filtered);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => navigate('/recipe/recipes/new')}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <SearchInput value={search} onChange={setSearch} placeholder="Search templates…" />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'productCode')} />
                <FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows.map(r => ({ status: statusLabel(r.status) })), 'status')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {rows.length ? 'No matches.' : 'No templates yet — create one.'}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={r => navigate(`/recipe/recipes/${r.id}`)} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />
    </div>
  );
}
