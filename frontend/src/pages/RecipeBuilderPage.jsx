import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn, ConfirmModal, CloseX } from '../components/Modal.jsx';
import Menu from '../components/Menu.jsx';
import RecordPage, { RecordRail, RailCard } from '../components/RecordPage.jsx';
import HistoryTab from '../components/HistoryTab.jsx';
import { StatusPill, statusLabel } from './recipeShared.jsx';

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
const miniBtn = {
  width: 24, height: 24, border: '1px solid var(--border)', background: 'var(--bg-card)',
  borderRadius: 'var(--radius-sm)', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', padding: 0,
};

// Books-style details page (CR-230): Overview first; rows are added/removed on the Edit page.
const TABS = [['overview', 'Overview'], ['components', 'Components'], ['materials', 'Materials & costing'], ['history', 'History']];

export default function RecipeBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState(null); // {recipe, components, options, materials, costElements}
  const [list, setList] = useState(null); // every design, for the left panel (CR-233)
  const [tab, setTab] = useState('overview');
  const [compIdx, setCompIdx] = useState(0);
  const [addingMat, setAddingMat] = useState(false);
  const [cloning, setCloning] = useState(null); // {code, name}
  const [confirmDel, setConfirmDel] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [addingEl, setAddingEl] = useState(null); // {label, calcType, rate?, code?}
  const [confirmDelEl, setConfirmDelEl] = useState(null);
  const [masterEls, setMasterEls] = useState([]); // cost master, for the add-element picker
  const [pushing, setPushing] = useState(false); // Push-to-Books dialog (CR-143)
  const [uomList, setUomList] = useState(['Nos']); // org units (SKU Settings → Units of measure, CR-216)

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/recipe/recipes/${id}`);
      setBundle(data);
      axios.get('/api/recipe/recipes').then(r => setList(r.data)).catch(() => setList([]));
    } catch { toast.error('Failed to load template'); }
  }, [id]);

  useEffect(() => { setCompIdx(0); load(); }, [load]);
  useEffect(() => { axios.get('/api/recipe/cost-elements').then(r => setMasterEls(r.data)).catch(() => {}); }, []);
  useEffect(() => { axios.get('/api/recipe/uoms').then(r => setUomList(r.data)).catch(() => {}); }, []);

  if (!bundle) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  const { recipe, components, options, materials, costElements } = bundle;
  // Edited in place, no draft / publish (CR-266); only a pre-CR-266 old version is read-only.
  const editable = recipe.status !== 'Superseded';
  const comp = components[Math.min(compIdx, components.length - 1)] || null;
  const optsOf = (c) => options.filter(o => String(o.componentId) === String(c.id));

  const err = (e, fallback) => toast.error(e.response?.data?.error || fallback);

  async function deleteRecipe() {
    try { await axios.delete(`/api/recipe/recipes/${recipe.id}`); toast.success('Deleted'); navigate('/recipe/recipes'); }
    catch (e) { err(e, 'Delete failed'); setConfirmDel(false); }
  }

  async function clone() {
    if (!cloning.code.trim() || !cloning.name.trim()) return toast.error('SKU and name are required');
    try {
      const { data } = await axios.post(`/api/recipe/recipes/${recipe.id}/clone`, { code: cloning.code.trim(), name: cloning.name.trim() });
      toast.success('Cloned'); setCloning(null); navigate(`/recipe/recipes/${data.id}`);
    } catch (e) { err(e, 'Clone failed'); }
  }

  async function setStatus(status) {
    try {
      await axios.put(`/api/recipe/recipes/${recipe.id}/status`, { status });
      toast.success(status === 'Archived' ? 'Marked inactive' : 'Marked active'); load();
    } catch (e) { err(e, 'Failed to change status'); }
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

  async function patchComponent(cid, patch) {
    try { await axios.put(`/api/recipe/components/${cid}`, patch); load(); }
    catch (e) { err(e, 'Failed to save component'); }
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

  const uoms = [...new Set([...uomList, ...materials.map(m => m.uom), ...components.map(c => c.uom)])].filter(Boolean);
  // CR-236: a component is a plain name; its Books reach is the allowed materials.
  const matLabel = (c) => optsOf(c).map(o => o.materialCode).filter(Boolean).join(', ');

  return (
    <RecordPage
      rail={
        <RecordRail
          items={list} selectedId={id} onSelect={r => navigate(`/recipe/recipes/${r.id}`)}
          search={r => `${r.code} ${r.name}`}
          filters={[{ label: 'Statuses', value: r => statusLabel(r.status) }, { label: 'Products', value: r => r.productCode }]}
          card={r => <RailCard title={r.code} chip={<StatusPill status={r.status} />} sub={`${r.name}${r.productCode ? ` · ${r.productCode}` : ''}`} />}
          empty="No designs"
        />
      }
      title={recipe.name}
      chips={<StatusPill status={recipe.status} />}
      actions={
        <>
          {components.length > 0 && <button style={btn} onClick={() => setPushing(true)}>Push to Books</button>}
          {editable && <button style={btnPrimary} onClick={() => navigate(`/recipe/recipes/${recipe.id}/edit`)}>Edit</button>}
          <Menu align="right" trigger="More ▾" triggerStyle={btn} items={[
            { label: 'Clone', onClick: () => setCloning({ code: `${recipe.code}-COPY`, name: `${recipe.name} (copy)` }) },
            ...(recipe.status === 'Published' ? [{ label: 'Mark as Inactive', onClick: () => setStatus('Archived') }] : []),
            ...(recipe.status === 'Archived' ? [{ label: 'Mark as Active', onClick: () => setStatus('Published') }] : []),
            ...(editable ? [{ label: 'Delete', tone: '#dc2626', onClick: () => setConfirmDel(true) }] : []),
          ]} />
          <CloseX onClick={() => navigate('/recipe/recipes')} title="Back to the list" />
        </>
      }
      tabs={TABS} tab={tab} onTab={setTab}
    >
      <datalist id="recipe-uoms">{uoms.map(u => <option key={u} value={u} />)}</datalist>
      {tab === 'history' && <HistoryTab entityType="RecipeTemplate" entityId={recipe.id} />}
      {tab !== 'history' && <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* ===== Overview tab ===== */}
        {tab === 'overview' && (
          <div style={{ ...card, padding: '8px 20px', maxWidth: 720 }}>
            {[
              ['Name', recipe.name],
              ['SKU', <span style={{ fontFamily: 'var(--font-mono)' }}>{recipe.code}</span>],
              ['Main product', recipe.productCode ? `${recipe.productCode}${recipe.productName ? ` — ${recipe.productName}` : ''}` : '—'],
              ['Unit', recipe.uom || '—'],
              ['Effective from', recipe.effectiveFrom || '—'],
              ['Status', <StatusPill status={recipe.status} />],
              ['Books composite', recipe.booksCompositeItemId ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{recipe.booksCompositeItemId}</span> : '—'],
            ].map(([k, v], i, all) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, padding: '9px 0', fontSize: 13, borderBottom: i < all.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                <span>{v}</span>
              </div>
            ))}

            {/* Components (Books composite-item look): one row per component with its materials. */}
            <div style={{ fontSize: 14, fontWeight: 600, margin: '22px 0 8px' }}>Components</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...colHead, textAlign: 'left', padding: '8px 12px' }}>Component</th>
                  <th style={{ ...colHead, textAlign: 'right', padding: '8px 12px', width: 120 }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {components.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--blue)' }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{matLabel(c) || 'no materials'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', verticalAlign: 'top' }}>{c.qty} {c.uom}</td>
                  </tr>
                ))}
                {components.length === 0 && (
                  <tr><td colSpan={2} style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>No components — add them on the Edit page.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Components tab ===== */}
        {tab === 'components' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 20, alignItems: 'start' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Components</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{editable ? 'Drag ☰ to reorder · click a row to edit' : 'Read-only'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {components.map((c, i) => (
                  <div key={c.id}
                    draggable={editable}
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => { if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                    onClick={() => setCompIdx(i)}
                    style={{
                      background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '12px 14px',
                      border: `1.5px solid ${i === compIdx ? 'var(--blue)' : 'var(--border)'}`,
                      display: 'grid', gridTemplateColumns: '20px 1.5fr 1fr 1fr 1.2fr auto', gap: 12, alignItems: 'center', cursor: 'pointer',
                    }}>
                    <span style={{ color: 'var(--text-muted)', cursor: editable ? 'grab' : 'default', fontSize: 15 }}>☰</span>
                    <span>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{matLabel(c) || c.code}</div>
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
                {components.length === 0 && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No components — add them on the Edit page.</div>
                )}
              </div>
            </div>

            {/* Component drawer */}
            {comp ? (
              <ComponentDrawer key={comp.id} comp={comp} editable={editable}
                onSave={patch => patchComponent(comp.id, patch)}
                onMaterials={() => setTab('materials')} />
            ) : (
              <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>No components — add them on the Edit page.</div>
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
                    {editable && costElements.length > 0 && <button style={btn} onClick={() => setAddingEl({ label: '', calcType: 'FIXED' })}>+ Add cost element</button>}
                  </div>
                  {costElements.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '32px 1.1fr 1.2fr 1.1fr 1.5fr 92px', gap: 10, ...colHead }}>
                      <span>#</span><span>Element</span><span>Display label</span><span>Calculation</span><span>Default value</span><span />
                    </div>
                  )}
                  {costElements.map((e, i) => (
                    <ElementRow key={e.id || e.code} el={e} idx={i} count={costElements.length} editable={editable}
                      onPatch={patch => patchElement(e.id, patch)}
                      onMove={dir => moveElement(i, dir)}
                      onDelete={() => setConfirmDelEl(e)} />
                  ))}
                  {costElements.length === 0 && (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No cost elements yet — define the costing columns that fit this product (e.g. Assembly, Testing).
                      {editable && (
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
                    {editable && <button style={btn} onClick={() => setAddingMat(true)}>+ Add material</button>}
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
                          {editable && <th style={{ ...colHead, width: 40 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {optsOf(comp).map(o => (
                          <OptionRow key={o.id} option={o} costElements={costElements} editable={editable}
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
                ) : <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>No components — add them on the Edit page.</div>}
            </div>
          </div>
        )}

        {/* ===== Versions tab ===== */}
      </div>}

      {/* Modals */}
      {cloning && (
        <Modal title="Clone" onClose={() => setCloning(null)} onSubmit={clone} width={440}>
          <div><label style={labelStyle}>New SKU</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} value={cloning.code} onChange={e => setCloning(v => ({ ...v, code: e.target.value }))} autoFocus /></div>
          <div><label style={labelStyle}>Name</label>
            <input style={inputStyle} value={cloning.name} onChange={e => setCloning(v => ({ ...v, name: e.target.value }))} /></div>
          <ModalFooter>
            <ModalBtn onClick={() => setCloning(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={clone}>Clone</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal title={`Delete "${recipe.name}"?`} confirmLabel="Delete"
          onConfirm={deleteRecipe} onClose={() => setConfirmDel(false)}>
          Components, materials and cost elements of this design are removed. Quotations already made keep their own copy. This cannot be undone.
        </ConfirmModal>
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

      {addingEl && (
        <Modal title="New" onClose={() => setAddingEl(null)} onSubmit={addElement} width={420}>
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
            <ModalBtn variant="primary" onClick={addElement}>Create</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDelEl && (
        <ConfirmModal title={`Delete cost element "${confirmDelEl.label}"?`} confirmLabel="Delete element"
          onConfirm={() => deleteElement(confirmDelEl)} onClose={() => setConfirmDelEl(null)}>
          Its column disappears from the material grid. Values already entered under it are ignored.
        </ConfirmModal>
      )}

      {pushing && <PushBooksDialog bundle={bundle} onClose={() => setPushing(false)} onDone={() => { setPushing(false); load(); }} />}
    </RecordPage>
  );
}

// Push-to-Books dialog (CR-143): preview the default BOM (first enabled
// material per component), link to an existing Books composite on first push
// (or create new), then POST push-books — which fully replaces mapped_items.
function PushBooksDialog({ bundle, onClose, onDone }) {
  const { recipe, components, options, materials } = bundle;
  const [composites, setComposites] = useState(null); // null = loading
  const [target, setTarget] = useState(''); // '' = create new
  const [busy, setBusy] = useState(false);
  const [errUnlinked, setErrUnlinked] = useState(null);

  const linked = !!recipe.booksCompositeItemId;
  useEffect(() => {
    if (linked) return;
    axios.get('/api/recipe/books-composites').then(r => setComposites(r.data)).catch(() => setComposites([]));
  }, [linked]);

  // Mirror of server-side bomLines: preview only, the server recomputes.
  const matById = new Map(materials.map(m => [String(m.id), m]));
  const preview = [...components].sort((a, b) => (a.sequence || 0) - (b.sequence || 0)).map(c => {
    const opt = options.find(o => String(o.componentId) === String(c.id) && o.enabled !== false) || null;
    const castWeight = opt ? Number(opt.castWeight) || 0 : 0;
    const qty = Math.round((Number(c.qty) || 1) * castWeight * 100) / 100;
    const material = opt ? matById.get(String(opt.materialId)) : null;
    return { comp: c, material, castWeight, qty, skipped: !opt || qty <= 0 };
  });
  const unlinkedMats = [...new Map(preview.filter(p => !p.skipped && (!p.material || !p.material.zohoItemId))
    .map(p => [String(p.material?.id || p.comp.id), p.material || { code: '?' }])).values()];
  const pushable = preview.some(p => !p.skipped) && unlinkedMats.length === 0;

  async function push() {
    setBusy(true); setErrUnlinked(null);
    try {
      const { data } = await axios.post(`/api/recipe/recipes/${recipe.id}/push-books`, target ? { compositeItemId: target } : {});
      toast.success(`Pushed to Books composite "${data.name}"${data.created ? ' (created)' : ''}`);
      onDone();
    } catch (e) {
      const d = e.response?.data;
      if (d?.error === 'reauth_required') toast.error('Reconnect Zoho from Settings to push');
      else if (d?.unlinked) setErrUnlinked(d.unlinked);
      else toast.error(d?.error || 'Push failed');
      if (e.response?.status === 409 && d?.error !== 'reauth_required') onDone(); // stale link cleared server-side
    } finally { setBusy(false); }
  }

  return (
    <Modal title={`Push "${recipe.name}" to Books`} onClose={onClose} onSubmit={pushable && !busy ? push : undefined} width={560}>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>
            {['Component', 'Material', 'Qty per unit', 'Books item'].map(h => (
              <th key={h} style={{ ...colHead, padding: '6px 10px', textAlign: 'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {preview.map(p => (
              <tr key={p.comp.id} style={{ borderTop: '1px solid var(--border)', color: p.skipped ? 'var(--text-muted)' : 'inherit' }}>
                <td style={{ padding: '6px 10px' }}>{p.comp.name}</td>
                <td style={{ padding: '6px 10px' }}>{p.skipped ? '— skipped (no material / zero qty)' : (p.material?.code || '?')}</td>
                <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  {p.skipped ? '—' : `${Number(p.comp.qty) || 1} × ${p.castWeight} = ${p.qty} ${p.material?.uom || ''}`}
                </td>
                <td style={{ padding: '6px 10px' }}>
                  {p.skipped ? '—' : p.material?.zohoItemId
                    ? <span>{p.material.zohoItemName || p.material.zohoItemId}</span>
                    : <span style={{ color: 'var(--red, #dc2626)', fontWeight: 500 }}>not linked</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(unlinkedMats.length > 0 || errUnlinked) && (
        <div style={{ fontSize: 12.5, color: 'var(--red, #dc2626)' }}>
          Link these materials to a Books item first:{' '}
          {(errUnlinked || unlinkedMats).map(m => m.code).join(', ')} — <Link to="/recipe/materials" style={{ color: 'var(--blue)' }}>open Materials</Link>
        </div>
      )}
      {linked ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          Linked to Books composite <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{recipe.booksCompositeItemId}</span> — pushing replaces its component lines with the table above.
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Books composite item</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">— Create new composite item ({recipe.name} / {recipe.productCode || recipe.code}) —</option>
            {(composites || []).map(c => <option key={c.id} value={c.id}>{c.name}{c.sku ? ` (${c.sku})` : ''}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
            {composites === null ? 'Loading Books composites…' : 'Picking an existing item overwrites its component lines (dummy lines are replaced). The link is remembered for future pushes.'}
          </div>
        </div>
      )}
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" disabled={!pushable || busy} onClick={push}>{busy ? 'Pushing…' : 'Proceed Push'}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}

// One cost-element row: label save-on-blur, calcType select, default value
// (live from the cost master unless overridden here), ↑↓ reorder, delete.
// Code is immutable (it keys fixedCosts on options).
function ElementRow({ el, idx, count, editable, onPatch, onMove, onDelete }) {
  const [label, setLabel] = useState(el.label || '');
  const [rate, setRate] = useState(el.rate ?? '');
  const [bg, fg] = CALC_COLORS[el.calcType] || CALC_COLORS.FIXED;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '32px 1.1fr 1.2fr 1.1fr 1.5fr 92px', gap: 10, alignItems: 'center', padding: '9px 16px', fontSize: 12.5, borderBottom: '1px solid var(--border)' }}
      title={CALC_RULES[el.calcType] || ''}>
      <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{idx + 1}</span>
      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.code}</span>
      {editable ? (
        <input style={{ ...inputStyle, height: 28, fontSize: 12.5 }} value={label} onChange={e => setLabel(e.target.value)}
          onBlur={() => label !== el.label && onPatch({ label })} />
      ) : <span>{el.label}</span>}
      {editable ? (
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
      ) : editable ? (
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
        {editable && (
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
function ComponentDrawer({ comp, editable, onSave, onMaterials }) {
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
          <input style={inputStyle} disabled={!editable} value={v.name} onChange={e => set({ name: e.target.value })} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Quantity</label>
            <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" disabled={!editable} value={v.qty} onChange={e => set({ qty: e.target.value })} /></div>
          <div><label style={labelStyle}>UOM</label>
            <input style={inputStyle} list="recipe-uoms" disabled={!editable} value={v.uom} onChange={e => set({ uom: e.target.value })} placeholder="Nos, KG, TB…" /></div>
        </div>
        <div><label style={labelStyle}>Question shown to sales</label>
          <input style={inputStyle} disabled={!editable} value={v.question} onChange={e => set({ question: e.target.value })} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {flags.map(([k, label]) => (
            <label key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '5px 0', cursor: editable ? 'pointer' : 'default' }}>
              <span>{label}</span>
              <input type="checkbox" disabled={!editable} checked={v[k]} onChange={e => set({ [k]: e.target.checked })} style={{ width: 15, height: 15, accentColor: 'var(--blue)' }} />
            </label>
          ))}
        </div>
        {editable && <button style={btnPrimary} onClick={() => onSave(v)}>Save component</button>}
        <button style={btn} onClick={onMaterials}>Edit materials & costing →</button>
      </div>
    </div>
  );
}

// One allowed-material row: enable toggle, editable castWeight + fixed element
// values (save on blur), server-computed RATE_QTY element + total.
function OptionRow({ option, costElements, editable, onPatch, onRemove }) {
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
        <input type="checkbox" checked={on} disabled={!editable} onChange={e => onPatch({ enabled: e.target.checked })} style={{ width: 15, height: 15, accentColor: 'var(--blue)' }} />
      </td>
      <td style={{ padding: '7px 16px', fontWeight: 600 }}>{option.materialCode}</td>
      <td style={{ ...cellNum, color: 'var(--text-muted)' }}>{option.materialRate ?? '—'}</td>
      <td style={{ ...cellNum }}>
        {editable ? (
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
            {editable ? (
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
      {editable && (
        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
          <button title="Remove material" onClick={onRemove} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}>×</button>
        </td>
      )}
    </tr>
  );
}
