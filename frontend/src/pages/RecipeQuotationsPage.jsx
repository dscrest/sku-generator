import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { StatusPill, inr } from './recipeShared.jsx';

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const tdStyle = { padding: '10px 16px' };

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
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'productCode')} />
                <FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows, 'status')} />
              </div>
            }
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Quotation</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Recipe</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Unit price</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Order value</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Created</th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No quotations yet — configure a product to create one.</td></tr>
              )}
              {pageRows.map(r => (
                <tr key={r.id}
                  onClick={() => navigate(`/recipe/quotations/${r.id}`)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 12.5 }}>{r.qtnNo}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.productCode || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{r.recipeCode} <span style={{ color: 'var(--text-muted)' }}>v{r.recipeVersion}</span></td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.qty}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{inr(r.unitPrice)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600 }}>{inr(r.orderValue)}</td>
                  <td style={tdStyle}><StatusPill status={r.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{(r.createdAt || '').slice(0, 10)}</td>
                  <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <RowMenu editLabel="View snapshot" onEdit={() => navigate(`/recipe/quotations/${r.id}`)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />
    </div>
  );
}
