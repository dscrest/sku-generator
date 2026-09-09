import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { MetaCard } from './recipeShared.jsx';

// Manufacturing requirement: pure display expansion of the frozen snapshot ×
// order qty (weights only — pricing stays on the snapshot view).
export default function RecipeMfgPage() {
  const { id } = useParams();
  const [q, setQ] = useState(null);

  useEffect(() => {
    axios.get(`/api/recipe/quotations/${id}`).then(r => setQ(r.data)).catch(() => toast.error('Failed to load'));
  }, [id]);

  if (!q) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
  const s = q.snapshot || {};
  const orderQty = Number(q.qty) || 1;
  const lines = s.lines || [];

  const byMat = {};
  for (const l of lines) {
    if (!l.materialCode) continue;
    byMat[l.materialCode] = (byMat[l.materialCode] || 0) + (l.castWeight || 0) * (l.qty || 1) * orderQty;
  }

  const statCell = (k, v, unit, bold) => (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
      <div style={{ fontSize: 15, fontWeight: bold ? 700 : 600, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
        {v} {unit && <span style={{ fontSize: 11, fontWeight: 500, fontFamily: 'var(--font)', color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 60px' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            <Link to={`/recipe/quotations/${q.id}`} style={{ color: 'var(--blue)', textDecoration: 'none' }}>{q.qtnNo}</Link> / manufacturing
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Manufacturing requirement</h1>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <MetaCard k={q.status === 'Order' ? 'Sales Order' : 'Quotation'} v={q.qtnNo} />
          <MetaCard k="Product" v={s.product?.code || q.productCode || '—'} />
          <MetaCard k="Order qty" v={`${orderQty} Nos`} />
          <MetaCard k="Recipe snapshot" v={`${(s.recipe?.code || q.recipeCode || '').replace('RCP-', '')} v${s.recipe?.version ?? q.recipeVersion}`} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {lines.map(l => (
            <div key={l.componentCode} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              padding: '16px 20px', display: 'grid', gridTemplateColumns: '1.4fr repeat(4,1fr)', gap: 14, alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{l.componentName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{l.componentCode}</div>
              </div>
              {statCell('Material', l.materialCode || '—')}
              {statCell('Quantity', (l.qty || 1) * orderQty, l.uom)}
              {statCell('Cast wt / pc', l.castWeight, 'kg')}
              {statCell('Total cast wt', ((l.castWeight || 0) * (l.qty || 1) * orderQty).toLocaleString('en-IN'), 'kg', true)}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 20px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Material summary by grade
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(byMat).map(([mat, kg]) => (
              <span key={mat} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '7px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
                <b>{mat}</b><span style={{ fontFamily: 'var(--font-mono)' }}>{kg.toLocaleString('en-IN')} kg</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
