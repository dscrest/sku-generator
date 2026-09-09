import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { StatusPill, MetaCard, inr } from './recipeShared.jsx';

const colHead = {
  padding: '9px 16px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};

export default function RecipeSnapshotPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/recipe/quotations/${id}`);
      setQ(data);
    } catch { toast.error('Failed to load quotation'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (!q) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
  const s = q.snapshot || {};
  const els = s.elementsMeta || [];

  async function convert() {
    try {
      await axios.post(`/api/recipe/quotations/${q.id}/convert`);
      toast.success('Converted to sales order'); load();
    } catch (e) { toast.error(e.response?.data?.error || 'Convert failed'); }
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 24px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              <Link to="/recipe/quotations" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Quotations</Link> / {q.qtnNo}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Configuration snapshot</h1>
              <StatusPill status={q.status} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--radius-md)', background: 'var(--blue-light)', color: 'var(--blue)', whiteSpace: 'nowrap' }}>
              🔒 Immutable · captured {(s.capturedAt || q.createdAt || '').slice(0, 10)}
            </span>
            {q.status === 'Quotation' && (
              <button onClick={convert} style={{ height: 34, padding: '0 14px', border: 'none', background: 'var(--blue)', color: '#fff', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Convert to sales order
              </button>
            )}
            {q.status === 'Order' && (
              <button onClick={() => navigate(`/recipe/quotations/${q.id}/mfg`)} style={{ height: 34, padding: '0 14px', border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Manufacturing requirement →
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
          <MetaCard k="Quotation" v={q.qtnNo} />
          <MetaCard k="Main product" v={s.product?.code || q.productCode || '—'} />
          <MetaCard k="Recipe version" v={`${(s.recipe?.code || q.recipeCode || '').replace('RCP-', '')} v${s.recipe?.version ?? q.recipeVersion}`} />
          <MetaCard k="Quantity" v={q.qty} />
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ ...colHead, textAlign: 'left' }}>Component</th>
                  <th style={{ ...colHead, textAlign: 'left' }}>Material</th>
                  <th style={colHead}>Cast wt</th>
                  <th style={colHead}>Rate frozen</th>
                  {els.map(e => <th key={e.code} style={colHead}>{e.label}</th>)}
                  <th style={colHead}>Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {(s.lines || []).map(l => (
                  <tr key={l.componentCode} style={{ borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font)', fontWeight: 600 }}>
                      {l.componentName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>× {l.qty}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>{l.materialCode}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>{l.castWeight} kg</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>₹{l.rateFrozen}/kg</td>
                    {els.map(e => (
                      <td key={e.code} style={{ padding: '10px 16px', textAlign: 'right' }}>
                        {Math.round(l.elements?.[e.code] || 0).toLocaleString('en-IN')}
                      </td>
                    ))}
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{inr(l.componentCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', gap: 28, fontSize: 13, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>Unit cost <b style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{inr(q.unitCost)}</b></span>
            <span style={{ color: 'var(--text-muted)' }}>Unit price <b style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{inr(q.unitPrice)}</b></span>
            <span style={{ color: 'var(--text-muted)' }}>Order value <b style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{inr(q.orderValue)}</b></span>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12 }}>
          Margin {s.marginPct ?? q.marginPct}% · Discount {s.discountPct ?? q.discountPct}% · GST {s.gstPct ?? q.gstPct}% — frozen with the snapshot.
          Changing recipes or material rates later never alters this quotation.
        </div>
      </div>
    </div>
  );
}
