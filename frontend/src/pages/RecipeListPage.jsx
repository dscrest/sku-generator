import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import { StatusPill } from './recipeShared.jsx';

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const tdStyle = { padding: '10px 16px' };
const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

export default function RecipeListPage() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [creating, setCreating] = useState(null); // {code,name,productItemId}
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/recipes');
      setRows(data);
    } catch { toast.error('Failed to load recipes'); }
  }, []);

  useEffect(() => {
    load();
    axios.get('/api/recipe/products').then(r => setProducts(r.data)).catch(() => {});
  }, [load]);

  const q = search.toLowerCase();
  const filtered = rows.filter(r =>
    (!q || `${r.code} ${r.name} ${r.productCode}`.toLowerCase().includes(q)) &&
    (!fProduct || r.productCode === fProduct) &&
    (!fStatus || r.status === fStatus));
  const { pageRows, pager } = usePager(filtered);

  async function create() {
    if (!creating.code || !creating.name) return toast.error('Code and name are required');
    try {
      const prod = products.find(p => p.id === creating.productItemId);
      const { data } = await axios.post('/api/recipe/recipes', {
        code: creating.code, name: creating.name,
        productItemId: creating.productItemId || '',
        productCode: prod ? prod.sku : creating.productCode || '',
        productName: prod ? prod.name : '',
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
      toast.success('Recipe created as draft v1');
      navigate(`/recipe/recipes/${data.id}`);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create recipe'); }
  }

  async function seedDemo() {
    try {
      const { data } = await axios.post('/api/recipe/seed-demo');
      toast.success(data.skipped ? 'Demo data already present' : 'RAVS150 demo recipe seeded');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Seeding failed'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Recipe templates</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reusable composition rules for main products. One product, many recipes; zero variant SKUs.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {rows.length === 0 && (
            <button onClick={seedDemo} style={{ height: 34, padding: '0 14px', border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text-secondary)' }}>
              Seed RAVS150 demo
            </button>
          )}
          <button onClick={() => setCreating({ code: '', name: '', productItemId: '' })}
            style={{ height: 34, padding: '0 14px', border: 'none', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            + Create Recipe
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)}
                  style={{ height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 10px', fontSize: 12.5, width: 200 }} />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'productCode')} />
                <FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows, 'status')} />
              </div>
            }
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Code</th>
                <th style={thStyle}>Recipe</th>
                <th style={thStyle}>Product</th>
                <th style={thStyle}>Ver</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Effective</th>
                <th style={thStyle}>Updated</th>
                <th style={{ ...thStyle, width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No recipes yet — create one or seed the demo.</td></tr>
              )}
              {pageRows.map(r => (
                <tr key={r.id}
                  onClick={() => navigate(`/recipe/recipes/${r.id}`)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.code}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.name}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.productCode || '—'}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>v{r.version}</td>
                  <td style={tdStyle}><StatusPill status={r.status} /></td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{r.effectiveFrom || '—'}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{(r.updatedAt || r.createdAt || '').slice(0, 10)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--blue)', fontWeight: 500, fontSize: 12.5, whiteSpace: 'nowrap' }}>Open →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />

      {creating && (
        <Modal title="Create Recipe" onClose={() => setCreating(null)} onSubmit={create} width={440}>
          <div><label style={labelStyle}>Recipe name</label>
            <input style={inputStyle} value={creating.name} onChange={e => setCreating(v => ({ ...v, name: e.target.value }))} placeholder="e.g. RAVS150 Standard" autoFocus /></div>
          <div><label style={labelStyle}>Recipe code</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={creating.code} onChange={e => setCreating(v => ({ ...v, code: e.target.value }))} placeholder="e.g. RCP-RAVS150-STD" /></div>
          <div><label style={labelStyle}>Main product (ERP item)</label>
            <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={creating.productItemId} onChange={e => setCreating(v => ({ ...v, productItemId: e.target.value }))}>
              <option value="">— pick later —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
            </select></div>
          <ModalFooter>
            <ModalBtn onClick={() => setCreating(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={create}>Create Draft</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
