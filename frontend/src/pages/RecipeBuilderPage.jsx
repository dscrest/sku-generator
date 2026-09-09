import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import { StatusPill, inr } from './recipeShared.jsx';

const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' };
const inputStyle = {
  height: 34, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const labelStyle = { fontSize: 11.5, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
const btn = {
  height: 32, padding: '0 12px', border: '1px solid var(--border)', background: 'var(--bg-card)',
  borderRadius: 'var(--radius-md)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', color: 'var(--text-primary)',
};
const btnPrimary = { ...btn, border: 'none', background: 'var(--blue)', color: '#fff' };
const colHead = {
  fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', padding: '8px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const CALC_COLORS = { RATE_QTY: ['#dcfce7', '#15803d'], FIXED: ['#dbeafe', '#1d4ed8'], PERCENTAGE: ['#fef3c7', '#92400e'] };
const CALC_RULES = { RATE_QTY: 'material.rate × castWeight', FIXED: 'fixed value per material row', PERCENTAGE: '% of running subtotal' };
const UOM_DEFAULTS = ['Nos', 'Set', 'KG', 'Mtr'];
const miniBtn = {
  width: 24, height: 24, border: '1px solid var(--border)', background: 'var(--bg-card)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', padding: 0,
};

const TABS = [['components', 'Components'], ['materials', 'Materials & costing'], ['test', 'Test recipe'], ['versions', 'Versions']];

export default function RecipeBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null); // {recipe, components, options, materials, costElements}
  const [tab, setTab] = useState('components');
  const [compIdx, setCompIdx] = useState(0);
  const [meta, setMeta] = useState(null); // editable copy of recipe header fields
  const [products, setProducts] = useState([]);
  const [adding, setAdding] = useState(null); // add-component modal state
  const [addingMat, setAddingMat] = useState(false);
  const [confirmDelComp, setConfirmDelComp] = useState(null);
  const [newVersion, setNewVersion] = useState(null); // {changeReason}
  const [dragIdx, setDragIdx] = useState(null);
  const [addingEl, setAddingEl] = useState(null); // {label, calcType, rate?, code?}
  const [confirmDelEl, setConfirmDelEl] = useState(null);
  const [masterEls, setMasterEls] = useState([]); // cost master, for the add-element picker

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/recipe/recipes/${id}`);
      setBundle(data);
      setMeta({
        name: data.recipe.name, productItemId: data.recipe.productItemId || '',
        effectiveFrom: data.recipe.effectiveFrom || '', changeReason: data.recipe.changeReason || '',
      });
    } catch { toast.error('Failed to load recipe'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { axios.get('/api/recipe/products').then(r => setProducts(r.data)).catch(() => {}); }, []);
  useEffect(() => { axios.get('/api/recipe/cost-elements').then(r => setMasterEls(r.data)).catch(() => {}); }, []);

  if (!bundle) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  const { recipe, components, options, materials, costElements } = bundle;
  const isDraft = recipe.status === 'Draft';
  const comp = components[Math.min(compIdx, components.length - 1)] || null;
  const optsOf = (c) => options.filter(o => String(o.componentId) === String(c.id));

  const err = (e, fallback) => toast.error(e.response?.data?.error || fallback);

  async function saveMeta() {
    try {
      const prod = products.find(p => p.id === meta.productItemId);
      await axios.put(`/api/recipe/recipes/${recipe.id}`, {
        ...meta,
        productCode: prod ? prod.sku : recipe.productCode,
        productName: prod ? prod.name : recipe.productName,
      });
      toast.success('Recipe saved'); load();
    } catch (e) { err(e, 'Failed to save'); }
  }

  async function publish() {
    try {
      await axios.post(`/api/recipe/recipes/${recipe.id}/publish`);
      toast.success(`v${recipe.version} published — it is now immutable`); load();
    } catch (e) { err(e, 'Publish failed'); }
  }

  async function createVersion() {
    try {
      const { data } = await axios.post(`/api/recipe/recipes/${recipe.id}/new-version`, { changeReason: newVersion.changeReason });
      toast.success(`Draft v${data.version} created`);
      setNewVersion(null);
      navigate(`/recipe/recipes/${data.id}`);
    } catch (e) {
      // A draft already exists — open it instead of erroring.
      if (e.response?.status === 409) {
        try {
          const { data: versions } = await axios.get(`/api/recipe/recipes/${recipe.id}/versions`);
          const draft = versions.find(v => v.status === 'Draft');
          if (draft) {
            toast.success(`Opened existing draft v${draft.version}`);
            setNewVersion(null);
            navigate(`/recipe/recipes/${draft.id}`);
            return;
          }
        } catch { /* fall through to the generic error */ }
      }
      err(e, 'Failed to create version');
    }
  }

  async function addElement() {
    if (!addingEl.label) return toast.error('Label is required');
    try {
      await axios.post(`/api/recipe/recipes/${recipe.id}/cost-elements`, addingEl);
      setAddingEl(null); load();
    } catch (e) { err(e, 'Failed to add cost element'); }
  }

  async function patchElement(elId, patch) {
    try { await axios.put(`/api/recipe/cost-elements/${elId}`, patch); load(); }
    catch (e) { err(e, 'Failed to save cost element'); }
  }

  async function deleteElement(el) {
    try { await axios.delete(`/api/recipe/cost-elements/${el.id}`); setConfirmDelEl(null); load(); }
    catch (e) { err(e, 'Failed to delete cost element'); setConfirmDelEl(null); }
  }

  async function moveElement(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= costElements.length) return;
    try {
      await axios.put(`/api/recipe/cost-elements/${costElements[i].id}`, { sequence: j + 1 });
      await axios.put(`/api/recipe/cost-elements/${costElements[j].id}`, { sequence: i + 1 });
      load();
    } catch (e) { err(e, 'Reorder failed'); }
  }

  async function copyDefaultElements() {
    try {
      const { data } = await axios.get('/api/recipe/cost-elements');
      for (const el of data) {
        await axios.post(`/api/recipe/recipes/${recipe.id}/cost-elements`, { code: el.code, label: el.label, calcType: el.calcType });
      }
      toast.success('Default elements copied'); load();
    } catch (e) { err(e, 'Failed to copy defaults'); }
  }

  async function addComponent() {
    if (!adding.name) return toast.error('Name is required');
    try {
      await axios.post(`/api/recipe/recipes/${recipe.id}/components`, adding);
      setAdding(null); load();
    } catch (e) { err(e, 'Failed to add component'); }
  }

  async function patchComponent(cid, patch) {
    try { await axios.put(`/api/recipe/components/${cid}`, patch); load(); }
    catch (e) { err(e, 'Failed to save component'); }
  }

  async function deleteComponent(c) {
    try { await axios.delete(`/api/recipe/components/${c.id}`); setConfirmDelComp(null); setCompIdx(0); load(); }
    catch (e) { err(e, 'Failed to delete component'); setConfirmDelComp(null); }
  }

  async function reorder(from, to) {
    if (from === to) return;
    const ids = components.map(c => c.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    try { await axios.put(`/api/recipe/recipes/${recipe.id}/component-order`, { ids }); load(); }
    catch (e) { err(e, 'Reorder failed'); }
  }

  async function patchOption(oid, patch) {
    try { await axios.put(`/api/recipe/options/${oid}`, patch); load(); }
    catch (e) { err(e, 'Failed to save'); }
  }

  async function addOption(materialId) {
    try { await axios.post(`/api/recipe/components/${comp.id}/options`, { materialId }); setAddingMat(false); load(); }
    catch (e) { err(e, 'Failed to add material'); }
  }

  const flagPills = (c) => [
    c.required ? 'Required' : 'Optional',
    ...(c.allowMaterial ? ['Material choice'] : []),
  ];

  const uoms = [...new Set([...UOM_DEFAULTS, ...materials.map(m => m.uom), ...components.map(c => c.uom)])].filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <datalist id="recipe-uoms">{uoms.map(u => <option key={u} value={u} />)}</datalist>
      {/* Header */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Link to="/recipe/recipes" style={{ fontSize: 12.5, color: 'var(--blue)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← Recipes</Link>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{recipe.name}</div>
          <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>v{recipe.version}</span>
          <StatusPill status={recipe.status} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button style={btn} onClick={() => setTab('test')}>Test recipe</button>
          {!isDraft && <button style={btnPrimary} onClick={() => setNewVersion({ changeReason: '' })}>Edit recipe</button>}
          {isDraft && <button style={btnPrimary} onClick={publish}>Publish v{recipe.version}</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: '0 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 14px', fontSize: 13, border: 'none', background: 'transparent', cursor: 'pointer',
            color: tab === k ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: tab === k ? 500 : 400,
            borderBottom: tab === k ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1,
          }}>{label}</button>
        ))}
        {!isDraft && (
          <div style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
            {recipe.status} versions are immutable — "Edit recipe" creates a new draft version
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* ===== Components tab ===== */}
        {tab === 'components' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>
            <div>
              {/* Recipe meta */}
              <div style={{ ...card, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.6fr 1fr auto', gap: 12, alignItems: 'end' }}>
                <div><label style={labelStyle}>Recipe name</label>
                  <input style={inputStyle} disabled={!isDraft} value={meta.name} onChange={e => setMeta(v => ({ ...v, name: e.target.value }))} /></div>
                <div><label style={labelStyle}>Main product (ERP item)</label>
                  <select style={{ ...inputStyle, background: 'var(--bg-card)' }} disabled={!isDraft} value={meta.productItemId} onChange={e => setMeta(v => ({ ...v, productItemId: e.target.value }))}>
                    <option value="">{recipe.productCode ? `${recipe.productCode} (unlinked)` : '— select —'}</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                  </select></div>
                <div><label style={labelStyle}>Version</label>
                  <input style={{ ...inputStyle, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }} disabled value={`v${recipe.version}`} /></div>
                <div><label style={labelStyle}>Effective from</label>
                  <input style={inputStyle} type="date" disabled={!isDraft} value={meta.effectiveFrom} onChange={e => setMeta(v => ({ ...v, effectiveFrom: e.target.value }))} /></div>
                {isDraft && <button style={{ ...btnPrimary, height: 34 }} onClick={saveMeta}>Save</button>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Components</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{isDraft ? 'Drag ☰ to reorder · click a row to edit' : 'Read-only'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {components.map((c, i) => (
                  <div key={c.id}
                    draggable={isDraft}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                    onClick={() => setCompIdx(i)}
                    style={{
                      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '12px 14px',
                      border: `1.5px solid ${i === compIdx ? 'var(--blue)' : 'var(--border)'}`,
                      display: 'grid', gridTemplateColumns: '20px 1.5fr 1fr 1fr 1.2fr auto', gap: 12, alignItems: 'center', cursor: 'pointer',
                    }}>
                    <span style={{ color: 'var(--text-muted)', cursor: isDraft ? 'grab' : 'default', fontSize: 15 }}>☰</span>
                    <span>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.code}</div>
                    </span>
                    <span style={{ fontSize: 12.5 }}>{c.qty} {c.uom} / unit</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{optsOf(c).length} material{optsOf(c).length !== 1 ? 's' : ''}</span>
                    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {flagPills(c).map(f => (
                        <span key={f} style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--bg-secondary)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{f}</span>
                      ))}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>›</span>
                  </div>
                ))}
                {isDraft && (
                  <button onClick={() => setAdding({ name: '', question: '', qty: 1, uom: 'Nos', required: true, allowMaterial: true })}
                    style={{ height: 42, border: '1.5px dashed var(--border-mid, var(--border))', background: 'transparent', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    + Add component
                  </button>
                )}
                {components.length === 0 && !isDraft && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No components.</div>
                )}
              </div>
            </div>

            {/* Component drawer */}
            {comp ? (
              <ComponentDrawer key={comp.id} comp={comp} isDraft={isDraft}
                onSave={patch => patchComponent(comp.id, patch)}
                onDelete={() => setConfirmDelComp(comp)}
                onMaterials={() => setTab('materials')} />
            ) : (
              <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Add a component to configure it.</div>
            )}
          </div>
        )}

        {/* ===== Materials & costing tab ===== */}
        {tab === 'materials' && (
          <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 10px 6px' }}>Component</div>
              {components.map((c, i) => (
                <button key={c.id} onClick={() => setCompIdx(i)} style={{
                  textAlign: 'left', padding: '9px 12px', borderRadius: 'var(--radius-md)', border: 'none',
                  background: i === compIdx ? 'var(--blue-light)' : 'transparent',
                  color: i === compIdx ? 'var(--blue)' : 'var(--text-primary)',
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{optsOf(c).length}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
                {/* Costing rules */}
                <div style={card}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Costing rules</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Each element becomes a column below. Default values come live from the Cost Master; material rows and quotations can override them.</div>
                    </div>
                    {isDraft && costElements.length > 0 && <button style={btn} onClick={() => setAddingEl({ label: '', calcType: 'FIXED' })}>+ Add cost element</button>}
                  </div>
                  {costElements.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 1.1fr 1.2fr 1.1fr 1.5fr 92px', gap: 10, ...colHead }}>
                      <span>#</span><span>Element</span><span>Display label</span><span>Calculation</span><span>Default value</span><span />
                    </div>
                  )}
                  {costElements.map((e, i) => (
                    <ElementRow key={e.id || e.code} el={e} idx={i} count={costElements.length} isDraft={isDraft}
                      onPatch={patch => patchElement(e.id, patch)}
                      onMove={dir => moveElement(i, dir)}
                      onDelete={() => setConfirmDelEl(e)} />
                  ))}
                  {costElements.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No cost elements yet — define the costing columns that fit this product (e.g. Assembly, Testing).
                      {isDraft && (
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                          <button style={btnPrimary} onClick={() => setAddingEl({ label: '', calcType: 'FIXED' })}>+ Add cost element</button>
                          <button style={btn} onClick={copyDefaultElements}>Copy default elements</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Allowed materials */}
                {comp ? (
                <div style={card}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Allowed materials · {comp.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>Rates come from the material master. Fixed values are per component-material.</div>
                    </div>
                    {isDraft && <button style={btn} onClick={() => setAddingMat(true)}>+ Add material</button>}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                      <thead>
                        <tr>
                          <th style={{ ...colHead, width: 36, textAlign: 'left' }}></th>
                          <th style={{ ...colHead, textAlign: 'left' }}>Material</th>
                          <th style={{ ...colHead, textAlign: 'right' }}>Rate</th>
                          <th style={{ ...colHead, textAlign: 'right' }}>Cast wt</th>
                          {costElements.map(e => <th key={e.code} style={{ ...colHead, textAlign: 'right' }}>{e.label}</th>)}
                          <th style={{ ...colHead, textAlign: 'right' }}>Total</th>
                          {isDraft && <th style={{ ...colHead, width: 40 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {optsOf(comp).map(o => (
                          <OptionRow key={o.id} option={o} costElements={costElements} isDraft={isDraft}
                            onPatch={patch => patchOption(o.id, patch)}
                            onRemove={() => axios.delete(`/api/recipe/options/${o.id}`).then(load).catch(e => err(e, 'Failed to remove'))} />
                        ))}
                        {optsOf(comp).length === 0 && (
                          <tr><td colSpan={6 + costElements.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No materials allowed yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                ) : <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Add a component to allow materials for it.</div>}
            </div>
          </div>
        )}

        {/* ===== Test tab ===== */}
        {tab === 'test' && <TestTab bundle={bundle} />}

        {/* ===== Versions tab ===== */}
        {tab === 'versions' && <VersionsTab recipeId={recipe.id} currentId={recipe.id} navigate={navigate} />}
      </div>

      {/* Modals */}
      {adding && (
        <Modal title="Add component" onClose={() => setAdding(null)} onSubmit={addComponent} width={440}>
          <div><label style={labelStyle}>Component name</label>
            <input style={inputStyle} value={adding.name} onChange={e => setAdding(v => ({ ...v, name: e.target.value }))} placeholder="e.g. Casing" autoFocus /></div>
          <div><label style={labelStyle}>Question shown to sales</label>
            <input style={inputStyle} value={adding.question} onChange={e => setAdding(v => ({ ...v, question: e.target.value }))} placeholder="e.g. What material should the casing be made from?" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Quantity per unit</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" value={adding.qty} onChange={e => setAdding(v => ({ ...v, qty: e.target.value }))} /></div>
            <div><label style={labelStyle}>UOM</label>
              <input style={inputStyle} list="recipe-uoms" value={adding.uom} onChange={e => setAdding(v => ({ ...v, uom: e.target.value }))} placeholder="Nos, KG, TB…" /></div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={adding.allowMaterial} onChange={e => setAdding(v => ({ ...v, allowMaterial: e.target.checked }))} />
            Sales chooses the material (configurable component)
          </label>
          <ModalFooter>
            <ModalBtn onClick={() => setAdding(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={addComponent}>Add component</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {addingMat && comp && (
        <Modal title={`Allow a material for ${comp.name}`} onClose={() => setAddingMat(false)} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {materials.filter(m => !optsOf(comp).some(o => String(o.materialId) === String(m.id))).map(m => (
              <button key={m.id} onClick={() => addOption(m.id)} style={{ ...btn, height: 38, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{m.code}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>₹{m.rate}/{m.uom || 'KG'}</span>
              </button>
            ))}
            {materials.filter(m => !optsOf(comp).some(o => String(o.materialId) === String(m.id))).length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8 }}>All materials are already allowed. Add more in Materials master.</div>
            )}
          </div>
        </Modal>
      )}

      {newVersion && (
        <Modal title={`New version of ${recipe.code}`} onClose={() => setNewVersion(null)} onSubmit={createVersion} width={440}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Copies every component and material option into a new draft. The current published version stays live until the draft is published.
          </div>
          <div><label style={labelStyle}>Change reason</label>
            <input style={inputStyle} value={newVersion.changeReason} onChange={e => setNewVersion(v => ({ ...v, changeReason: e.target.value }))} placeholder="e.g. Added CF8M casing option" autoFocus /></div>
          <ModalFooter>
            <ModalBtn onClick={() => setNewVersion(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={createVersion}>Create draft version</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDelComp && (
        <ConfirmModal title={`Delete component "${confirmDelComp.name}"?`} confirmLabel="Delete component"
          onConfirm={() => deleteComponent(confirmDelComp)} onClose={() => setConfirmDelComp(null)}>
          Its material options are removed too. This cannot be undone.
        </ConfirmModal>
      )}

      {addingEl && (
        <Modal title="Add cost element" onClose={() => setAddingEl(null)} onSubmit={addElement} width={420}>
          {masterEls.filter(m => !costElements.some(e => e.code === m.code)).length > 0 && (
            <div><label style={labelStyle}>From cost master (optional)</label>
              <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value=""
                onChange={e => {
                  const m = masterEls.find(x => String(x.id) === e.target.value);
                  if (m) setAddingEl({ code: m.code, label: m.label, calcType: m.calcType });
                }}>
                <option value="">— pick to prefill; default value stays linked to the master —</option>
                {masterEls.filter(m => !costElements.some(e => e.code === m.code)).map(m => (
                  <option key={m.id} value={m.id}>{m.label} ({m.calcType === 'RATE_QTY' ? 'RATE × QTY' : m.calcType}{m.calcType === 'FIXED' ? ` · ₹${Number(m.rate || 0)}` : m.calcType === 'PERCENTAGE' ? ` · ${Number(m.rate || 0)}%` : ''})</option>
                ))}
              </select></div>
          )}
          <div><label style={labelStyle}>Label</label>
            <input style={inputStyle} value={addingEl.label} onChange={e => setAddingEl(v => ({ ...v, label: e.target.value, code: undefined }))} placeholder="e.g. Assembly labour" autoFocus /></div>
          <div><label style={labelStyle}>Calculation</label>
            <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={addingEl.calcType} onChange={e => setAddingEl(v => ({ ...v, calcType: e.target.value }))}>
              <option value="FIXED">Fixed — value entered per material row</option>
              <option value="RATE_QTY">Rate × qty — material rate × cast weight</option>
              <option value="PERCENTAGE">Percentage — % of running subtotal</option>
            </select></div>
          <ModalFooter>
            <ModalBtn onClick={() => setAddingEl(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={addElement}>Add cost element</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDelEl && (
        <ConfirmModal title={`Delete cost element "${confirmDelEl.label}"?`} confirmLabel="Delete element"
          onConfirm={() => deleteElement(confirmDelEl)} onClose={() => setConfirmDelEl(null)}>
          Its column disappears from the material grid. Values already entered under it are ignored.
        </ConfirmModal>
      )}
    </div>
  );
}

// One cost-element row: label save-on-blur, calcType select, default value
// (live from the cost master unless overridden here), ↑↓ reorder, delete.
// Code is immutable (it keys fixedCosts on options).
function ElementRow({ el, idx, count, isDraft, onPatch, onMove, onDelete }) {
  const [label, setLabel] = useState(el.label || '');
  const [rate, setRate] = useState(el.rate ?? '');
  const [bg, fg] = CALC_COLORS[el.calcType] || CALC_COLORS.FIXED;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1.1fr 1.2fr 1.1fr 1.5fr 92px', gap: 10, alignItems: 'center', padding: '9px 16px', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}
      title={CALC_RULES[el.calcType] || ''}>
      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{idx + 1}</span>
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.code}</span>
      {isDraft ? (
        <input style={{ ...inputStyle, height: 28, fontSize: 12.5 }} value={label} onChange={e => setLabel(e.target.value)}
          onBlur={() => label !== el.label && onPatch({ label })} />
      ) : <span>{el.label}</span>}
      {isDraft ? (
        <select style={{ ...inputStyle, height: 28, fontSize: 12, background: 'var(--bg-card)' }} value={el.calcType} onChange={e => onPatch({ calcType: e.target.value })}>
          <option value="FIXED">FIXED</option>
          <option value="RATE_QTY">RATE × QTY</option>
          <option value="PERCENTAGE">PERCENTAGE</option>
        </select>
      ) : (
        <span><span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg, fontFamily: 'var(--font-mono)' }}>{el.calcType === 'RATE_QTY' ? 'RATE × QTY' : el.calcType}</span></span>
      )}
      {el.calcType === 'RATE_QTY' ? (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)' }}>material rate × cast wt</span>
      ) : isDraft ? (
        <input style={{ ...inputStyle, height: 28, fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" step="0.01"
          value={rate} placeholder="from cost master"
          onChange={e => setRate(e.target.value)}
          onBlur={() => String(rate) !== String(el.rate ?? '') && onPatch({ rate })} />
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'right' }}>
          {el.calcType === 'PERCENTAGE' ? `${Number(el.rate || 0)}%` : `₹${Number(el.rate || 0).toLocaleString('en-IN')}`}
        </span>
      )}
      <span style={{ display: 'flex', gap: 3, justifyContent: 'flex-end' }}>
        {isDraft && (
          <>
            <button style={{ ...miniBtn, opacity: idx === 0 ? 0.35 : 1 }} disabled={idx === 0} onClick={() => onMove(-1)} title="Move up">↑</button>
            <button style={{ ...miniBtn, opacity: idx === count - 1 ? 0.35 : 1 }} disabled={idx === count - 1} onClick={() => onMove(1)} title="Move down">↓</button>
            <button style={{ ...miniBtn, color: '#dc2626' }} onClick={onDelete} title="Delete element">×</button>
          </>
        )}
      </span>
    </div>
  );
}

// Sticky right drawer editing one component. Local state, explicit Save.
function ComponentDrawer({ comp, isDraft, onSave, onDelete, onMaterials }) {
  const [v, setV] = useState({
    name: comp.name || '', code: comp.code || '', question: comp.question || '',
    qty: comp.qty ?? 1, uom: comp.uom || 'Nos', required: comp.required === true,
    allowMaterial: comp.allowMaterial === true, allowQtyOverride: comp.allowQtyOverride === true,
    allowComponentOverride: comp.allowComponentOverride === true,
  });
  const set = (patch) => setV(s => ({ ...s, ...patch }));
  const flags = [
    ['required', 'Required'],
    ['allowMaterial', 'Allow material selection'],
    ['allowQtyOverride', 'Allow quantity override'],
    ['allowComponentOverride', 'Allow component override'],
  ];
  return (
    <div style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{comp.name}</div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{comp.code}</span>
      </div>
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div><label style={labelStyle}>Name</label>
          <input style={inputStyle} disabled={!isDraft} value={v.name} onChange={e => set({ name: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Quantity</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" disabled={!isDraft} value={v.qty} onChange={e => set({ qty: e.target.value })} /></div>
          <div><label style={labelStyle}>UOM</label>
            <input style={inputStyle} list="recipe-uoms" disabled={!isDraft} value={v.uom} onChange={e => set({ uom: e.target.value })} placeholder="Nos, KG, TB…" /></div>
        </div>
        <div><label style={labelStyle}>Question shown to sales</label>
          <input style={inputStyle} disabled={!isDraft} value={v.question} onChange={e => set({ question: e.target.value })} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {flags.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', cursor: isDraft ? 'pointer' : 'default' }}>
              <span>{label}</span>
              <input type="checkbox" disabled={!isDraft} checked={v[k]} onChange={e => set({ [k]: e.target.checked })} style={{ width: 15, height: 15, accentColor: 'var(--blue)' }} />
            </label>
          ))}
        </div>
        {isDraft && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btnPrimary, flex: 1 }} onClick={() => onSave(v)}>Save component</button>
            <button style={{ ...btn, color: '#dc2626' }} onClick={onDelete}>Delete</button>
          </div>
        )}
        <button style={btn} onClick={onMaterials}>Edit materials & costing →</button>
      </div>
    </div>
  );
}

// One allowed-material row: enable toggle, editable castWeight + fixed element
// values (save on blur), server-computed RATE_QTY element + total.
function OptionRow({ option, costElements, isDraft, onPatch, onRemove }) {
  const [wt, setWt] = useState(option.castWeight ?? 0);
  const [fixed, setFixed] = useState(option.fixedCosts || {});
  const cost = option.cost || { elements: {}, total: 0 };
  const on = option.enabled !== false;
  const cellNum = { padding: '7px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 };
  const numInput = {
    width: 76, height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '0 8px', fontSize: 12, textAlign: 'right', fontFamily: 'var(--font-mono)', background: '#fffdf0',
  };
  return (
    <tr style={{ borderTop: '1px solid var(--border)', opacity: on ? 1 : 0.45 }}>
      <td style={{ padding: '7px 16px' }}>
        <input type="checkbox" checked={on} disabled={!isDraft} onChange={e => onPatch({ enabled: e.target.checked })} style={{ width: 15, height: 15, accentColor: 'var(--blue)' }} />
      </td>
      <td style={{ padding: '7px 16px', fontWeight: 600 }}>{option.materialCode}</td>
      <td style={{ ...cellNum, color: 'var(--text-muted)' }}>{option.materialRate ?? '—'}</td>
      <td style={{ ...cellNum }}>
        {isDraft ? (
          <input style={numInput} type="number" step="0.01" value={wt}
            onChange={e => setWt(e.target.value)}
            onBlur={() => Number(wt) !== Number(option.castWeight) && onPatch({ castWeight: wt })} />
        ) : wt}
      </td>
      {costElements.map(el => {
        if (el.calcType === 'RATE_QTY') {
          return <td key={el.code} style={{ ...cellNum, color: 'var(--text-muted)' }}>{Math.round(cost.elements[el.code] || 0).toLocaleString('en-IN')}</td>;
        }
        const val = fixed[el.code] ?? '';
        return (
          <td key={el.code} style={cellNum}>
            {isDraft ? (
              // Blank = inherit the element default (shown as placeholder).
              <input style={numInput} type="number" step="0.01" value={val}
                placeholder={el.rate != null && el.rate !== '' ? String(el.rate) : ''}
                onChange={e => setFixed(f => ({ ...f, [el.code]: e.target.value }))}
                onBlur={() => {
                  const clean = Object.fromEntries(Object.entries(fixed)
                    .filter(([, v2]) => v2 !== '' && v2 !== null && v2 !== undefined)
                    .map(([k, v2]) => [k, Number(v2) || 0]));
                  if (JSON.stringify(clean) !== JSON.stringify(option.fixedCosts || {})) onPatch({ fixedCosts: clean });
                }} />
            ) : (Number(cost.elements[el.code]) || 0).toLocaleString('en-IN')}
          </td>
        );
      })}
      <td style={{ ...cellNum, fontWeight: 600 }}>{Math.round(cost.total || 0).toLocaleString('en-IN')}</td>
      {isDraft && (
        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
          <button title="Remove material" onClick={onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>×</button>
        </td>
      )}
    </tr>
  );
}

// Test calculator: pick qty + materials, server computes. Nothing saved.
function TestTab({ bundle }) {
  const { recipe, components, options, costElements } = bundle;
  const configurable = components.filter(c => c.allowMaterial);
  const rateCodes = (costElements || []).filter(e => e.calcType === 'RATE_QTY').map(e => e.code);
  const [qty, setQty] = useState(10);
  const [sel, setSel] = useState({}); // componentId -> optionId
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const optsOf = (c) => options.filter(o => String(o.componentId) === String(c.id) && o.enabled !== false);

  useEffect(() => {
    // default: first enabled option per configurable component
    setSel(Object.fromEntries(configurable.map(c => [c.id, (optsOf(c)[0] || {}).id]).filter(([, v]) => v)));
  }, [bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (configurable.some(c => !sel[c.id])) { setResult(null); return; }
    let stale = false;
    axios.post(`/api/recipe/recipes/${recipe.id}/calculate`, { qty, selections: sel })
      .then(r => { if (!stale) { setResult(r.data); setError(null); } })
      .catch(e => { if (!stale) { setResult(null); setError(e.response?.data?.error || 'Calculation failed'); } });
    return () => { stale = true; };
  }, [sel, qty, recipe.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tile = (k, v) => (
    <div key={k}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 2 }}>{v}</div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      <div style={{ ...card, padding: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Test recipe</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>Verify the calculation before publishing. Nothing is saved.</div>
        <div style={{ marginBottom: 12 }}><label style={labelStyle}>Quantity</label>
          <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} /></div>
        {configurable.map(c => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{c.name}</label>
            <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={sel[c.id] || ''} onChange={e => setSel(s => ({ ...s, [c.id]: e.target.value }))}>
              {optsOf(c).map(o => <option key={o.id} value={o.id}>{o.materialCode} — {inr(o.cost?.total)}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div style={card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr', gap: 10, ...colHead }}>
          <span>Component</span><span>Material</span>
          <span style={{ textAlign: 'right' }}>Material cost</span><span style={{ textAlign: 'right' }}>Mfg cost</span>
          <span style={{ textAlign: 'right' }}>Unit</span><span style={{ textAlign: 'right' }}>× {qty}</span>
        </div>
        {error && <div style={{ padding: 20, fontSize: 13, color: '#dc2626' }}>{error}</div>}
        {result && result.lines.map(l => {
          const matCost = rateCodes.reduce((s, c) => s + (l.elements[c] || 0), 0);
          const mfg = l.optionCost - matCost;
          return (
            <div key={l.componentId} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr 1fr', gap: 10, padding: '10px 16px', fontSize: 12.5, borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>
              <span style={{ fontFamily: 'var(--font)', fontWeight: 600 }}>{l.componentName} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>× {l.qty}</span></span>
              <span>{l.materialCode}</span>
              <span style={{ textAlign: 'right' }}>{inr(matCost * l.qty)}</span>
              <span style={{ textAlign: 'right' }}>{inr(mfg * l.qty)}</span>
              <span style={{ textAlign: 'right', fontWeight: 600 }}>{inr(l.componentCost)}</span>
              <span style={{ textAlign: 'right' }}>{inr(l.componentCost * result.qty)}</span>
            </div>
          );
        })}
        {result && (
          <div style={{ padding: '14px 16px', background: 'var(--bg-secondary)', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {tile('Unit cost', inr(result.unitCost))}
            {tile('Quantity', result.qty)}
            {tile('Total manufacturing cost', inr(result.unitCost * result.qty))}
          </div>
        )}
        {!result && !error && <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Pick a material for every configurable component.</div>}
      </div>
    </div>
  );
}

// Version timeline; clicking a card opens that version (each version is a row).
function VersionsTab({ recipeId, currentId, navigate }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    axios.get(`/api/recipe/recipes/${recipeId}/versions`).then(r => setRows(r.data)).catch(() => {});
  }, [recipeId]);
  return (
    <div style={{ maxWidth: 760 }}>
      {rows.map((vr, i) => (
        <div key={vr.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: String(vr.id) === String(currentId) ? 'var(--blue)' : 'var(--border-mid, var(--border))', marginTop: 20, flexShrink: 0 }} />
            {i < rows.length - 1 && <span style={{ flex: 1, width: 2, background: 'var(--border)' }} />}
          </div>
          <div onClick={() => navigate(`/recipe/recipes/${vr.id}`)} style={{ ...card, padding: '14px 18px', marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)' }}>v{vr.version}</span>
              <StatusPill status={vr.status} />
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{(vr.updatedAt || vr.createdAt || '').slice(0, 10)}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{vr.changeReason || '—'}</div>
            {vr.status !== 'Draft' && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6 }}>Immutable. Referenced by quotations created against it.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
