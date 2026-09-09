import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { inr } from './recipeShared.jsx';

/**
 * Sales configurator (CR-104): 5-step guided wizard. Sales never sees the
 * recipe builder — just product, recipe, material questions, price, quotation.
 * All pricing math comes from the server (option costs are precomputed on the
 * recipe bundle; review totals come from POST /calculate; the quotation itself
 * is recomputed and frozen server-side).
 */

const STEPS = ['Product', 'Recipe', 'Configure', 'Review', 'Quotation'];

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' };
const btn = {
  height: 38, padding: '0 18px', border: '1px solid var(--border)', background: 'var(--bg-card)',
  borderRadius: 'var(--radius-md)', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', color: 'var(--text-primary)',
};
const btnPrimary = { ...btn, border: 'none', background: 'var(--blue)', color: '#fff' };
const h1 = { margin: '0 0 4px', fontSize: 19, fontWeight: 600 };
const sub = { color: 'var(--text-secondary)', fontSize: 13, marginBottom: 18 };

export default function RecipeWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [productCode, setProductCode] = useState('');
  const [search, setSearch] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const [bundle, setBundle] = useState(null); // full recipe bundle for the chosen recipe
  const [qty, setQty] = useState(10);
  const [choices, setChoices] = useState({}); // componentId -> optionId
  const [overrides, setOverrides] = useState({}); // componentId -> {CODE: value} quote-time cost edits
  const [expandedLine, setExpandedLine] = useState(null); // componentId open in review
  const [margin, setMargin] = useState(18);
  const [discount, setDiscount] = useState(0);
  const [gst, setGst] = useState(18);
  const [review, setReview] = useState(null); // server calculate result
  const [qtn, setQtn] = useState(null); // created quotation
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get('/api/recipe/products').then(r => setProducts(r.data)).catch(() => {});
    axios.get('/api/recipe/recipes').then(r => setRecipes(r.data)).catch(() => toast.error('Failed to load recipes'));
  }, []);

  // Products that actually have a published recipe, plus recipe-only product
  // codes (recipes not linked to an ERP item yet still need to be quotable).
  const published = recipes.filter(r => r.status === 'Published');
  const productCards = useMemo(() => {
    const byCode = new Map();
    for (const p of products) byCode.set(p.sku, { code: p.sku, name: p.name, recipes: 0 });
    for (const r of published) {
      if (!r.productCode) continue;
      if (!byCode.has(r.productCode)) byCode.set(r.productCode, { code: r.productCode, name: r.productName || '', recipes: 0 });
      byCode.get(r.productCode).recipes++;
    }
    const q = search.toLowerCase();
    // All ERP products stay visible; ones without a published recipe get a
    // "create one" CTA instead of silently disappearing.
    return [...byCode.values()]
      .filter(p => !q || `${p.code} ${p.name}`.toLowerCase().includes(q))
      .sort((a, b) => (b.recipes > 0) - (a.recipes > 0) || a.code.localeCompare(b.code));
  }, [products, published, search]);

  const productRecipes = recipes.filter(r => r.productCode === productCode && r.status !== 'Archived');

  // Load the chosen recipe's bundle (components + option prices) for step 3.
  useEffect(() => {
    if (!recipeId) { setBundle(null); return; }
    axios.get(`/api/recipe/recipes/${recipeId}`).then(r => setBundle(r.data)).catch(() => toast.error('Failed to load recipe'));
  }, [recipeId]);

  const components = bundle?.components || [];
  const configurable = components.filter(c => c.allowMaterial);
  const fixed = components.filter(c => !c.allowMaterial);
  const optsOf = (c) => (bundle?.options || []).filter(o => String(o.componentId) === String(c.id) && o.enabled !== false);
  const chosen = (c) => optsOf(c).find(o => String(o.id) === String(choices[c.id]));
  const allAnswered = !!bundle && configurable.every(c => chosen(c));

  // Server-side calculation for review + rail totals once everything is answered.
  useEffect(() => {
    if (!recipeId || !allAnswered) { setReview(null); return; }
    let stale = false;
    axios.post(`/api/recipe/recipes/${recipeId}/calculate`, {
      qty, selections: choices, overrides, marginPct: margin, discountPct: discount, gstPct: gst,
    })
      .then(r => { if (!stale) setReview(r.data); })
      .catch(() => { if (!stale) setReview(null); });
    return () => { stale = true; };
  }, [recipeId, allAnswered, choices, overrides, qty, margin, discount, gst]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true);
    try {
      const { data } = await axios.post('/api/recipe/quotations', {
        recipeId, qty, selections: choices, overrides, marginPct: margin, discountPct: discount, gstPct: gst,
      });
      setQtn(data);
      setStep(4);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed to create quotation'); }
    finally { setBusy(false); }
  }

  function reset() {
    setStep(0); setProductCode(''); setRecipeId(''); setBundle(null);
    setChoices({}); setOverrides({}); setExpandedLine(null); setQtn(null); setReview(null);
  }

  // Quote-time edit for one element on one line; blank reverts to the recipe value.
  function setOverride(cid, code, v) {
    setOverrides(o => {
      const line = { ...(o[cid] || {}) };
      if (v === '' || v === null) delete line[code]; else line[code] = v;
      const next = { ...o, [cid]: line };
      if (!Object.keys(line).length) delete next[cid];
      return next;
    });
  }

  const canNext = [
    !!productCode,
    !!recipeId && Number(qty) > 0,
    allAnswered,
    !!review,
    false,
  ][step];

  function next() {
    if (step === 1 && productRecipes.filter(r => r.status === 'Published').length && !recipeId) return;
    if (step === 3) return generate();
    setStep(s => Math.min(4, s + 1));
  }

  const selRecipe = recipes.find(r => String(r.id) === String(recipeId));

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 24px 60px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', rowGap: 8 }}>
            {STEPS.map((label, i) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <button onClick={() => i < step && step < 4 && setStep(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent',
                  cursor: i < step && step < 4 ? 'pointer' : 'default', padding: 0, fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
                  color: i === step ? 'var(--text-primary)' : i < step ? 'var(--text-secondary)' : 'var(--text-muted)',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10.5, fontWeight: 700,
                    background: i <= step ? 'var(--blue)' : 'var(--bg-card)',
                    color: i <= step ? '#fff' : 'var(--text-muted)',
                    border: i <= step ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                  }}>{i < step ? '✓' : i + 1}</span>
                  {label}
                </button>
                {i < STEPS.length - 1 && <span style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 10px', minWidth: 12 }} />}
              </span>
            ))}
          </div>

          {/* Step 1: product */}
          {step === 0 && (
            <div style={{ ...card, padding: 24 }}>
              <h1 style={h1}>Which product is the customer asking for?</h1>
              <div style={sub}>Main products come from the ERP item master. No variant items are created.</div>
              <input placeholder="Search item code or name…" value={search} onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 12px', fontSize: 14, marginBottom: 12 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productCards.map(p => {
                  const on = productCode === p.code;
                  const hasRecipe = p.recipes > 0;
                  return (
                    <button key={p.code} onClick={() => {
                      if (!hasRecipe) return navigate('/recipe/recipes');
                      setProductCode(p.code); setChoices({});
                      const def = published.find(r => r.productCode === p.code);
                      setRecipeId(def ? def.id : '');
                    }} style={{
                      display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '13px 15px',
                      borderRadius: 'var(--radius-md)', cursor: 'pointer', opacity: hasRecipe ? 1 : 0.75,
                      border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                      background: on ? 'var(--blue-light)' : 'var(--bg-card)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 600, minWidth: 90 }}>{p.code}</span>
                      <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', flex: 1 }}>{p.name}</span>
                      {hasRecipe
                        ? <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{p.recipes} recipe{p.recipes !== 1 ? 's' : ''}</span>
                        : <span style={{ fontSize: 11.5, color: 'var(--blue)', fontWeight: 600 }}>No recipe yet — create one →</span>}
                    </button>
                  );
                })}
                {productCards.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No products yet. <button onClick={() => navigate('/recipe/recipes')} style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>Create a recipe →</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: recipe + qty */}
          {step === 1 && (
            <div style={{ ...card, padding: 24 }}>
              <h1 style={h1}>Which recipe applies?</h1>
              <div style={sub}>Only published recipes for {productCode} are selectable. The default is preselected.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {productRecipes.map((r, i) => {
                  const on = String(recipeId) === String(r.id);
                  const selectable = r.status === 'Published';
                  return (
                    <button key={r.id} disabled={!selectable} onClick={() => { setRecipeId(r.id); setChoices({}); }} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 14px', textAlign: 'left', padding: '13px 15px',
                      borderRadius: 'var(--radius-md)', cursor: selectable ? 'pointer' : 'not-allowed', opacity: selectable ? 1 : 0.55,
                      border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                      background: on ? 'var(--blue-light)' : 'var(--bg-card)',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>v{r.version}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.effectiveFrom ? `Effective ${r.effectiveFrom}` : ''}</span>
                      <span style={{ fontSize: 11.5, color: selectable ? 'var(--blue)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {selectable ? (i === productRecipes.findIndex(x => x.status === 'Published') ? 'Default' : '') : `${r.status} · not selectable`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 18, maxWidth: 200 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Quantity</label>
                <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                  style={{ width: '100%', height: 40, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 12px', fontSize: 15, fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>
          )}

          {/* Step 3: configure */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {configurable.map(c => {
                const sel = chosen(c);
                return (
                  <div key={c.id} style={{ ...card, padding: '18px 22px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {c.name} · {c.qty} {c.uom} per unit
                      </span>
                      {sel && <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--blue)' }}>Answered</span>}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 12 }}>{c.question || `Which material for ${c.name}?`}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {optsOf(c).map(o => {
                        const on = sel && String(sel.id) === String(o.id);
                        return (
                          <button key={o.id} onClick={() => {
                            setChoices(v => ({ ...v, [c.id]: o.id }));
                            setOverrides(o2 => { const n = { ...o2 }; delete n[c.id]; return n; });
                          }} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '9px 13px', minWidth: 90,
                            borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                            border: `1.5px solid ${on ? 'var(--blue)' : 'var(--border)'}`,
                            background: on ? 'var(--blue-light)' : 'var(--bg-card)',
                          }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--blue)' : 'var(--text-primary)' }}>{o.materialCode}</span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{inr(o.cost?.total)}</span>
                          </button>
                        );
                      })}
                    </div>
                    {sel && (
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Estimated component price</span>
                        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{inr((sel.cost?.total || 0) * (c.qty || 1))}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {fixed.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '0 4px' }}>
                  Also included without a choice: {fixed.map(c => {
                    const o = optsOf(c)[0];
                    return `${c.name}${o ? ` (${o.materialCode})` : ''}`;
                  }).join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Step 4: review */}
          {step === 3 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px 12px' }}>
                <h1 style={h1}>Review cost and price</h1>
                <div style={{ ...sub, marginBottom: 0 }}>Cost comes from the recipe and cost master; click a line to adjust its costs for this quotation only.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '8px 24px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <span>Component</span><span>Material</span><span style={{ textAlign: 'right' }}>Unit cost</span><span style={{ textAlign: 'right' }}>× {review?.qty ?? qty}</span>
              </div>
              {(review?.lines || []).map(l => {
                const cid = String(l.componentId);
                const open = expandedLine === cid;
                const edited = !!overrides[cid];
                const els = [...(bundle?.costElements || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                return (
                  <div key={cid} style={{ borderBottom: '1px solid var(--border)' }}>
                    <div onClick={() => setExpandedLine(open ? null : cid)}
                      style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '11px 24px', fontSize: 13, cursor: 'pointer', background: open ? 'var(--bg-secondary)' : 'transparent' }}>
                      <span style={{ fontWeight: 600 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginRight: 6 }}>{open ? '▾' : '▸'}</span>
                        {l.componentName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>× {l.qty}</span>
                        {edited && <span style={{ fontSize: 10.5, fontWeight: 600, marginLeft: 8, padding: '1px 7px', borderRadius: 5, background: '#fef3c7', color: '#92400e' }}>adjusted</span>}
                      </span>
                      <span>{l.materialCode}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{inr(l.componentCost)}</span>
                      <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{inr(l.componentCost * (review?.qty || 1))}</span>
                    </div>
                    {open && (
                      <div style={{ padding: '4px 24px 14px 44px', background: 'var(--bg-secondary)', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                        {els.map(el => (
                          <div key={el.code}>
                            <label style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 }}>
                              {el.label}{el.calcType === 'PERCENTAGE' ? ' (%)' : ''}
                            </label>
                            <input type="number" step="0.01"
                              value={overrides[cid]?.[el.code] ?? ''}
                              placeholder={el.calcType === 'PERCENTAGE' ? String(el.rate ?? 0) : String(l.elements?.[el.code] ?? 0)}
                              onChange={e => setOverride(cid, el.code, e.target.value)}
                              style={{ width: 96, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 12.5, fontFamily: 'var(--font-mono)', textAlign: 'right', background: overrides[cid]?.[el.code] !== undefined ? '#fffdf0' : 'var(--bg-card)' }} />
                          </div>
                        ))}
                        <div style={{ alignSelf: 'flex-end', fontSize: 11.5, color: 'var(--text-muted)', paddingBottom: 7 }}>
                          Blank = recipe value. Applies to this quotation only.
                          {edited && <button onClick={() => setOverrides(o => { const n = { ...o }; delete n[cid]; return n; })}
                            style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 11.5, padding: 0, marginLeft: 8, fontWeight: 600 }}>Reset</button>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '18px 24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Manufacturing cost / unit</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{inr(review?.unitCost)}</span>
                  </div>
                  {[['Margin', margin, setMargin], ['Discount', discount, setDiscount], ['GST', gst, setGst]].map(([label, val, set]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="number" value={val} onChange={e => set(e.target.value)}
                          style={{ width: 62, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0 8px', fontFamily: 'var(--font-mono)', fontSize: 12.5, textAlign: 'right' }} />%
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'var(--blue-light)', borderRadius: 'var(--radius-md)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Selling price / unit</span><span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{inr(review?.unitPrice)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>Quantity</span><span style={{ fontFamily: 'var(--font-mono)' }}>{review?.qty ?? qty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>Order value</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20 }}>{inr(review?.orderValue)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: created */}
          {step === 4 && qtn && (
            <div style={{ ...card, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--blue-light)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 20, fontWeight: 700 }}>✓</div>
              <h1 style={{ ...h1, fontSize: 20 }}>Quotation {qtn.qtnNo} created</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 440, margin: '0 auto 20px', lineHeight: 1.55 }}>
                The configuration, recipe version and material rates are frozen in a snapshot. Later changes to the recipe or rates will not affect this quotation.
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button style={btn} onClick={() => navigate(`/recipe/quotations/${qtn.id}`)}>View snapshot</button>
                <button style={btnPrimary} onClick={async () => {
                  try {
                    await axios.post(`/api/recipe/quotations/${qtn.id}/convert`);
                    toast.success('Converted to sales order');
                    navigate(`/recipe/quotations/${qtn.id}/mfg`);
                  } catch (e) { toast.error(e.response?.data?.error || 'Convert failed'); }
                }}>Convert to sales order</button>
              </div>
              <button onClick={reset} style={{ ...btn, border: 'none', marginTop: 16, color: 'var(--text-muted)', background: 'transparent' }}>Start a new configuration</button>
            </div>
          )}

          {/* Footer nav */}
          {step < 4 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button style={{ ...btn, opacity: step === 0 ? 0.4 : 1 }} disabled={step === 0} onClick={() => setStep(s => Math.max(0, s - 1))}>Back</button>
              <button style={{ ...btnPrimary, opacity: canNext && !busy ? 1 : 0.4 }} disabled={!canNext || busy} onClick={next}>
                {step === 3 ? (busy ? 'Generating…' : 'Generate quotation') : 'Continue'}
              </button>
            </div>
          )}
        </div>

        {/* Summary rail */}
        <aside style={{ position: 'sticky', top: 0, ...card, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Configuration summary</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 6, fontFamily: 'var(--font-mono)' }}>{productCode || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {selRecipe ? `${selRecipe.name} v${selRecipe.version}` : 'No recipe selected'} · Qty {qty}
            </div>
          </div>
          <div style={{ padding: '6px 16px' }}>
            {components.map(c => {
              const o = c.allowMaterial ? chosen(c) : optsOf(c)[0];
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                  <span style={{ fontWeight: 600, color: o ? 'var(--text-primary)' : 'var(--text-muted)' }}>{o ? o.materialCode : 'Not chosen'}</span>
                </div>
              );
            })}
            {components.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Pick a product and recipe to begin.</div>}
          </div>
          <div style={{ padding: '10px 16px 14px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>Unit cost</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{review ? inr(review.unitCost) : '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total cost</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{review ? inr(review.unitCost * review.qty) : '—'}</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
