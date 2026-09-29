import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { StatusPill, MetaCard, inr } from './recipeShared.jsx';
import RecordPage, { RecordRail, RailCard } from '../components/RecordPage.jsx';
import HistoryTab from '../components/HistoryTab.jsx';
import Menu from '../components/Menu.jsx';
import { CloseX } from '../components/Modal.jsx';
import { btn } from '../components/woCommon.jsx';

const colHead = {
  padding: '9px 16px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const TABS = [['snapshot', 'Snapshot'], ['history', 'History']];

// One quotation, record-page shape (CR-233): rail of quotations · header ·
// Snapshot / History tabs. The snapshot itself stays immutable.
export default function RecipeSnapshotPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [q, setQ] = useState(null);
  const [list, setList] = useState(null);
  const [tab, setTab] = useState('snapshot');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/recipe/quotations/${id}`);
      setQ(data);
      axios.get('/api/recipe/quotations').then(r => setList(r.data)).catch(() => setList([]));
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
    <RecordPage
      rail={
        <RecordRail
          items={list} selectedId={id} onSelect={r => navigate(`/recipe/quotations/${r.id}`)}
          search={r => `${r.qtnNo} ${r.productCode} ${r.recipeCode}`}
          filters={[{ label: 'Statuses', value: r => r.status }, { label: 'Products', value: r => r.productCode }]}
          card={r => <RailCard title={r.qtnNo} chip={<StatusPill status={r.status} />} sub={`${r.productCode || r.recipeCode || '—'} · ×${r.qty} · ${inr(r.orderValue)}`} />}
          empty="No quotations"
        />
      }
      title={q.qtnNo}
      chips={
        <>
          <StatusPill status={q.status} />
          <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 'var(--radius-md)', background: 'var(--blue-light)', color: 'var(--blue)', whiteSpace: 'nowrap' }}>
            🔒 Immutable · captured {(s.capturedAt || q.createdAt || '').slice(0, 10)}
          </span>
        </>
      }
      actions={
        <>
          {q.status === 'Quotation' && (
            <button onClick={convert} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>Convert to sales order</button>
          )}
          <Menu align="right" trigger="More ▾" triggerStyle={btn} items={[
            ...(q.status === 'Order' ? [{ label: 'Manufacturing requirement', onClick: () => navigate(`/recipe/quotations/${q.id}/mfg`) }] : []),
            { label: 'Print', onClick: () => window.print() },
          ]} />
          <CloseX onClick={() => navigate('/recipe/quotations')} title="Back to the list" />
        </>
      }
      tabs={TABS} tab={tab} onTab={setTab}
    >
      {tab === 'history' && <HistoryTab entityType="RecipeQuotation" entityId={q.id} />}
      {tab === 'snapshot' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px 60px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
            <MetaCard k="Quotation" v={q.qtnNo} />
            <MetaCard k="Main product" v={s.product?.code || q.productCode || '—'} />
            <MetaCard k="Template" v={(s.recipe?.code || q.recipeCode || '').replace('RCP-', '')} />
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
          </div>
        </div>
      )}
    </RecordPage>
  );
}
