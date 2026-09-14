import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { StatusPill, inr } from './recipeShared.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

export default function RecipeQuotationsPage() {
  const [rows, setRows] = useState([]);
  const [fStatus, setFStatus] = useState('');
  const [fProduct, setFProduct] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/quotations');
      setRows(data);
    } catch { toast.error('Failed to load quotations'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r =>
    (!fStatus || r.status === fStatus) && (!fProduct || r.productCode === fProduct));
  const { pageRows, pager } = usePager(filtered);

  // COLUMNS lives in the component: the actions column needs navigate.
  const COLUMNS = [
    { key: 'qtnNo', label: 'Quotation', lock: true, render: r => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5 }}>{r.qtnNo}</span> },
    { key: 'productCode', label: 'Product', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.productCode || '—'}</span> },
    { key: 'recipeCode', label: 'Recipe', render: r => <span style={{ color: 'var(--text-secondary)' }}>{r.recipeCode} <span style={{ color: 'var(--text-muted)' }}>v{r.recipeVersion}</span></span> },
    { key: 'qty', label: 'Qty', align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.qty}</span> },
    { key: 'unitPrice', label: 'Unit price', align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{inr(r.unitPrice)}</span> },
    { key: 'orderValue', label: 'Order value', align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>{inr(r.orderValue)}</span> },
    { key: 'status', label: 'Status', render: r => <StatusPill status={r.status} /> },
    { key: 'createdAt', label: 'Created', render: r => <span style={{ color: 'var(--text-muted)' }}>{(r.createdAt || '').slice(0, 10)}</span> },
    {
      key: 'actions', label: 'Actions', lock: true, width: 60, render: r => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu editLabel="View snapshot" onEdit={() => navigate(`/recipe/quotations/${r.id}`)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.quotations', COLUMNS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Quotations</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Each quotation is an immutable configuration snapshot — master-data changes never touch it</div>
        </div>
        <button onClick={() => navigate('/recipe/configure')}
          style={{ height: 34, padding: '0 14px', border: 'none', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          + Configure product
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'productCode')} />
                <FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows, 'status')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              No quotations yet — configure a product to create one.
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={r => navigate(`/recipe/quotations/${r.id}`)} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />
    </div>
  );
}
