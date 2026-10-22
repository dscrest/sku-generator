import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import DateInput from '../components/DateInput.jsx';
import { btn } from '../components/woCommon.jsx';
import NewServiceItemModal from '../components/NewServiceItemModal.jsx';

/** Product Designs — the New / Edit form (started as the v2 sandbox, CR-271;
 *  the v1 form and builder are retired). A component row points straight at a
 *  Books item from the synced SKU master (RecipeComponent.skuItemId), or lists
 *  materials — each material sub-line carrying its own Books item
 *  (RecipeComponentOption.skuItemId: Casing → CI = item X, WCF = item Y), so
 *  no Materials-page mapping hop is needed. Create = one POST (template +
 *  components). Edit = PUT meta + PUT components-bulk + DELETE for removed rows. */

// Books layout: one white surface, labels hard left, fields ~720px, table spans the page.
const row = { display: 'grid', gridTemplateColumns: '190px minmax(0, 720px)', gap: 14, alignItems: 'center' };
const wide = { ...row, gridTemplateColumns: '190px minmax(0, 1fr)', alignItems: 'start' };
const label = { fontSize: 13, color: 'var(--text-secondary)' };
const req = { ...label, color: '#dc2626' };
const input = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)',
};
const th = {
  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'left',
  padding: '9px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const td = { padding: '8px 12px', verticalAlign: 'top', borderBottom: '1px solid var(--border)' };
const cellInput = { ...input, height: 32, fontSize: 12.5 };
const link = { border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 };

// One row = one component; its materials are sub-lines, each with its own qty in the
// material's unit (CR-276) and its own Books item: Casing → CI 55 KG item X / WSB 70 KG
// item Y. Saved as component qty 1 with each material qty as RecipeComponentOption.castWeight
// (the WO rule) and the item as RecipeComponentOption.skuItemId. A row with no material
// keeps its own qty and item (RecipeComponent.skuItemId).
const EMPTY_ROW = { id: '', name: '', skuItemId: '', qty: 1, uom: '', materials: [] };
// Associated Services (CR-254): a component with no material, linked to a Books
// service item (RecipeComponent.allowMaterial = false + skuItemId). Qty 1 Nos
// like any other line; never stock, never a WO line. Price (CR-284) = what the
// configurator quotes when sales tick the service — it differs per design.
const EMPTY_SVC = { id: '', name: '', skuItemId: '', qty: 1, uom: '', price: '' };
const isSvc = c => c.allowMaterial === false && Boolean(c.skuItemId);
const today = () => new Date().toISOString().slice(0, 10);

export default function RecipeV2NewPage() {
  const { id } = useParams(); // present = edit an existing design
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [goods, setGoods] = useState(null); // Item (ZB) list from Books (CR-275); null = still reading
  const [composites, setComposites] = useState(null); // null = still reading Books
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState(['Nos']);
  const [f, setF] = useState({ name: '', code: '', productItemId: '', uom: '', effectiveFrom: today() });
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [svcs, setSvcs] = useState([]);
  const [newSvc, setNewSvc] = useState(null); // row index creating a Books service item
  const [loadedIds, setLoadedIds] = useState([]); // component ids on the design when opened — any not saved back is deleted
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  // Runs on open and on ⟳ (a composite just created in Books shows up without a reload)
  function loadProducts() {
    setComposites(null);
    const products$ = axios.get('/api/recipe/products').then(r => { setProducts(r.data); return r.data; }).catch(() => []);
    // Books read failed → the SKU master's assembly items, so the form stays usable
    axios.get('/api/recipe/products/composites').then(r => setComposites(r.data)).catch(async err => {
      toast.error(err.response?.data?.error || 'Could not read composite items from Books');
      setComposites((await products$).filter(p => p.type === 'Manufacturing'));
    });
    // Item (ZB): Books goods that are not composites, same Books read as the composites (CR-275)
    setGoods(null);
    axios.get('/api/recipe/products/goods').then(r => setGoods(r.data)).catch(async err => {
      toast.error(err.response?.data?.error || 'Could not read items from Books');
      setGoods((await products$).filter(p => !p.service && p.inBooks && p.type !== 'Manufacturing'));
    });
  }

  useEffect(() => {
    loadProducts();
    axios.get('/api/recipe/materials').then(r => setMaterials(r.data)).catch(() => {});
    axios.get('/api/recipe/uoms').then(r => { setUoms(r.data); setF(v => ({ ...v, uom: v.uom || r.data[0] || 'Nos' })); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    axios.get(`/api/recipe/recipes/${id}`).then(({ data }) => {
      const r = data.recipe;
      if (r.status === 'Superseded') { toast.error('This is an old copy of the design — edit the current one'); return navigate('/recipe/recipes'); }
      setF({ name: r.name || '', code: r.code || '', productItemId: r.productItemId || '', uom: r.uom || '', effectiveFrom: r.effectiveFrom || today() });
      const comps = [...data.components].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      // Sub-line qty = component qty × cast weight (cast weight 0 = the component qty — the WO rule)
      const items = comps.filter(c => !isSvc(c)).map(c => ({
        id: c.id, name: c.name || '', skuItemId: c.skuItemId ? String(c.skuItemId) : '', qty: c.qty ?? 1, uom: c.uom || '',
        materials: (data.options || []).filter(o => String(o.componentId) === String(c.id))
          .map(o => ({ materialId: String(o.materialId), skuItemId: o.skuItemId ? String(o.skuItemId) : '', qty: (Number(o.castWeight) > 0 ? (c.qty ?? 1) * Number(o.castWeight) : (c.qty ?? 1)) || 1 })),
      }));
      setRows(items.length ? items : [{ ...EMPTY_ROW }]);
      setSvcs(comps.filter(isSvc).map(c => ({ id: c.id, name: c.name || '', skuItemId: String(c.skuItemId), qty: c.qty ?? 1, uom: c.uom || '', price: c.price ?? '' })));
      setLoadedIds(comps.map(c => String(c.id)));
      setLoaded(true);
    }).catch(() => { toast.error('Failed to load the template'); navigate('/recipe/recipes'); });
  }, [id, navigate]);

  const byId = new Map(products.map(p => [String(p.id), p]));
  const matById = new Map(materials.map(m => [String(m.id), m]));
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  // A removed row's component is deleted on Save (loadedIds minus what is saved back)
  const removeRow = (i) => setRows(rs => rs.length === 1 ? [{ ...EMPTY_ROW }] : rs.filter((_, j) => j !== i));
  const setMat = (i, k, patch) => setRow(i, { materials: rows[i].materials.map((m, j) => j === k ? { ...m, ...patch } : m) });
  const dropMat = (i, k) => setRow(i, { materials: rows[i].materials.filter((_, j) => j !== k) });
  const addMat = (i, mid) => mid && setRow(i, { materials: [...rows[i].materials, { materialId: mid, qty: '', skuItemId: '' }] });
  const serviceItems = products.filter(p => p.service);
  // Item column: the synced Books goods (SKU master rows with a Books link); a saved pick outside that list stays listed
  const goodsItems = goods || [];
  const itemOptions = (sel) => (sel && !goodsItems.some(p => String(p.id) === sel) && byId.get(sel) ? [byId.get(sel), ...goodsItems] : goodsItems);
  // Main product = the Books composite items (CR-264); a saved pick outside that list stays listed
  const savedPick = byId.get(String(f.productItemId));
  const mainProducts = composites || [];
  const mainOptions = savedPick && !mainProducts.some(p => String(p.id) === String(savedPick.id)) ? [savedPick, ...mainProducts] : mainProducts;
  const setSvc = (i, patch) => setSvcs(ss => ss.map((s, j) => j === i ? { ...s, ...patch } : s));
  const removeSvc = (i) => setSvcs(ss => ss.filter((_, j) => j !== i));

  async function save() {
    if (!f.productItemId) return toast.error('Pick the Main ERP item');
    if (!f.code.trim()) return toast.error('SKU is required');
    // Component name is optional: a row with only an item or a material is named after it
    const first = (r) => matById.get(r.materials[0]?.materialId);
    const nameOf = (r) => r.name.trim() || byId.get(r.skuItemId)?.name || first(r)?.name || first(r)?.code || '';
    const items = rows.filter(nameOf).map(r => ({
      id: r.id, name: nameOf(r), skuItemId: r.skuItemId, qty: Number(r.qty),
      uom: r.uom || first(r)?.uom || f.uom,
      materials: r.materials.map(m => ({ materialId: m.materialId, castWeight: Number(m.qty), skuItemId: m.skuItemId || '' })),
    }));
    if (!items.length) return toast.error('Add at least one component or material');
    if (items.some(g => !g.materials.length && !(g.qty > 0))) return toast.error('Quantity must be above zero');
    if (items.some(g => g.materials.some(m => !(m.castWeight > 0)))) return toast.error('Enter a quantity on every material');
    const services = svcs.filter(s => s.name.trim() || s.skuItemId);
    if (services.some(s => !s.name.trim() || !s.skuItemId)) return toast.error('Each service needs a name and a service item');
    if (services.some(s => !(Number(s.qty) > 0))) return toast.error('Service quantity must be above zero');
    const prod = mainOptions.find(p => String(p.id) === String(f.productItemId));
    const meta = {
      // Main ERP item is the design (CR-275): its Books name is the design name
      name: (prod && prod.name) || f.name.trim(), productItemId: f.productItemId || '',
      productCode: prod ? prod.sku : '', productName: prod ? prod.name : '',
      effectiveFrom: f.effectiveFrom, uom: f.uom,
    };
    const keptIds = new Set([...items.map(g => String(g.id)), ...services.map(s => String(s.id))].filter(Boolean));
    const removed = loadedIds.filter(cid => !keptIds.has(String(cid)));
    const components = [
      // A component with materials is qty 1 × each material's row qty (castWeight); its items ride the sub-lines
      ...items.map(g => ({ id: g.id || undefined, name: g.name, qty: g.materials.length ? 1 : g.qty, uom: g.uom, materials: g.materials, skuItemId: g.materials.length ? '' : g.skuItemId || '' })),
      ...services.map(s => ({ id: s.id || undefined, name: s.name.trim(), qty: Number(s.qty), uom: s.uom || f.uom, materialIds: [], allowMaterial: false, skuItemId: s.skuItemId, price: Number(s.price) || 0 })),
    ];
    setBusy(true);
    try {
      if (id) {
        await axios.put(`/api/recipe/recipes/${id}`, meta);
        await axios.put(`/api/recipe/recipes/${id}/components-bulk`, { components });
        for (const cid of removed) await axios.delete(`/api/recipe/components/${cid}`); // sequential — Dev concurrency cap
        toast.success('Saved');
        navigate('/recipe/recipes');
      } else {
        await axios.post('/api/recipe/recipes', { code: f.code.trim(), ...meta, components });
        toast.success('Created');
        navigate('/recipe/recipes');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
      setBusy(false);
    }
  }

  const unitOptions = (u) => (u && !uoms.includes(u) ? [...uoms, u] : uoms);

  if (!loaded) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ height: '100%', overflow: 'auto', background: 'var(--bg-card)' }}>
      <div style={{ padding: '24px 28px 40px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name and Main product merged (CR-275): the design IS the Books composite item — its name is the design name, its SKU seeds the design SKU */}
          <div style={row}>
            <span style={req}>Main ERP item*</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={input} value={f.productItemId} autoFocus
                onChange={e => { const p = mainOptions.find(x => String(x.id) === e.target.value); setF(v => ({ ...v, productItemId: e.target.value, name: p ? p.name : v.name, code: v.code || (p ? p.sku : '') })); }}>
                <option value="">{composites ? '— pick the composite item —' : 'Loading composite items…'}</option>
                {mainOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" title="Refresh from Zoho Books" disabled={!composites} onClick={loadProducts}
                style={{ ...btn, padding: '0 12px', fontSize: 15, opacity: composites ? 1 : 0.5 }}>⟳</button>
            </div>
          </div>
          <div style={row}>
            <span style={req}>SKU*</span>
            <input style={{ ...input, fontFamily: 'var(--font-mono)', background: id ? 'var(--bg-secondary)' : input.background }} value={f.code} onChange={set('code')}
              disabled={Boolean(id)} title={id ? 'The SKU cannot change' : 'Filled from the ERP item; change it if you like'} placeholder="filled from the ERP item" />
          </div>
          <div style={row}>
            <span style={label}>Unit</span>
            <select style={input} value={f.uom} onChange={set('uom')}>
              {unitOptions(f.uom).map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div style={row}>
            <span style={label}>Effective from</span>
            <DateInput style={input} value={f.effectiveFrom} onChange={set('effectiveFrom')} />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <div style={wide}>
            <span style={{ ...req, paddingTop: 10 }}>Component*</span>
            <div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, width: '22%' }}>Component</th>
                      <th style={{ ...th, width: '30%' }}>Item (ZB)</th>
                      <th style={th}>Material</th>
                      <th style={{ ...th, width: 110, textAlign: 'right' }}>Quantity</th>
                      <th style={{ ...th, width: 110 }}>Unit</th>
                      <th style={{ ...th, width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const span = Math.max(1, r.materials.length);
                      const free = materials.filter(m => !r.materials.some(x => x.materialId === String(m.id)));
                      const sub = { ...td, borderBottom: 'none' }; // inner sub-line cells; the last sub-line keeps the row border
                      // One material picker, under the row's last sub-line
                      const picker = (
                        <select style={{ ...cellInput, width: 'auto', minWidth: 150, color: free.length ? 'var(--blue)' : 'var(--text-muted)', marginTop: r.materials.length ? 6 : 0 }} value=""
                          disabled={!free.length} onChange={e => addMat(i, e.target.value)}>
                          <option value="">{free.length ? '+ add material' : materials.length ? 'all materials added' : 'no materials in master'}</option>
                          {free.map(m => <option key={m.id} value={m.id}>{m.code}</option>)}
                        </select>
                      );
                      const lines = r.materials.length ? r.materials : [null];
                      return lines.map((m, k) => {
                        const last = k === lines.length - 1;
                        const cell = last ? td : sub;
                        const mat = m ? matById.get(m.materialId) : null;
                        return (
                          <tr key={`r${i}m${k}`}>
                            {k === 0 && (
                              <td style={td} rowSpan={span}>
                                <input style={cellInput} value={r.name} placeholder="optional" onChange={e => setRow(i, { name: e.target.value })} />
                              </td>
                            )}
                            <td style={cell}>
                              {/* Books item: per material sub-line (item per material — the WO takes it × that material's qty),
                                  or the row's own item when it lists no material (CR-271). Blank sub-line = the Materials-page link. */}
                              {m ? (
                                <select style={cellInput} value={m.skuItemId || ''} onChange={e => setMat(i, k, { skuItemId: e.target.value })}>
                                  <option value="">{goods === null ? 'Loading Books items…' : goodsItems.length ? '— from Materials page —' : 'no items in Books'}</option>
                                  {itemOptions(m.skuItemId || '').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              ) : (
                                <select style={cellInput} value={r.skuItemId} onChange={e => setRow(i, { skuItemId: e.target.value })}>
                                  <option value="">{goods === null ? 'Loading Books items…' : goodsItems.length ? '— none (use materials) —' : 'no items in Books'}</option>
                                  {itemOptions(r.skuItemId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              )}
                            </td>
                            <td style={cell}>
                              {m ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32 }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }} title={mat?.name || ''}>{mat?.code || m.materialId}</span>
                                  <button type="button" title="Remove material" onClick={() => dropMat(i, k)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                                </div>
                              ) : null}
                              {last && picker}
                            </td>
                            <td style={cell}>
                              {m ? (
                                <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01"
                                  value={m.qty} placeholder="qty" onChange={e => setMat(i, k, { qty: e.target.value })} />
                              ) : (
                                <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01"
                                  value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
                              )}
                            </td>
                            <td style={cell}>
                              {m ? (
                                <span style={{ fontSize: 12.5, lineHeight: '32px', color: 'var(--text-secondary)' }}>{mat?.uom || ''}</span>
                              ) : (
                                <select style={cellInput} value={r.uom || f.uom} onChange={e => setRow(i, { uom: e.target.value })}>
                                  {unitOptions(r.uom).map(u => <option key={u}>{u}</option>)}
                                </select>
                              )}
                            </td>
                            {k === 0 && (
                              <td style={{ ...td, textAlign: 'center' }} rowSpan={span}>
                                <button type="button" title="Remove row" onClick={() => removeRow(i)}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, marginTop: 6 }}>×</button>
                              </td>
                            )}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" style={{ ...link, marginTop: 10 }} onClick={() => setRows(rs => [...rs, { ...EMPTY_ROW }])}>+ Add New Row</button>
            </div>
          </div>
        </div>

        {/* Associated Services — Books composite-item shape (CR-254) */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <div style={wide}>
            <span style={{ ...label, paddingTop: 10 }}>Services</span>
            <div>
              {svcs.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: '28%' }}>Service</th>
                        <th style={th}>Service item (ZB)</th>
                        <th style={{ ...th, width: 110, textAlign: 'right' }}>Quantity</th>
                        <th style={{ ...th, width: 130, textAlign: 'right' }}>Price</th>
                        <th style={{ ...th, width: 110 }}>Unit</th>
                        <th style={{ ...th, width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {svcs.map((s, i) => (
                        <tr key={s.id || `s${i}`}>
                          <td style={td}><input style={cellInput} value={s.name} placeholder="e.g. Coating, Assembly" onChange={e => setSvc(i, { name: e.target.value })} /></td>
                          <td style={td}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <select style={cellInput} value={s.skuItemId} onChange={e => setSvc(i, { skuItemId: e.target.value })}>
                                <option value="">{serviceItems.length ? '— pick a service item —' : 'no service items yet'}</option>
                                {serviceItems.map(p => <option key={p.id} value={p.id}>{p.name}{p.inBooks ? '' : ' · not in Books'}</option>)}
                              </select>
                              <button type="button" style={{ ...link, fontSize: 12, whiteSpace: 'nowrap' }} title="Create the service item in Zoho Books" onClick={() => setNewSvc(i)}>+ New in Books</button>
                            </div>
                          </td>
                          <td style={td}>
                            <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01"
                              value={s.qty} onChange={e => setSvc(i, { qty: e.target.value })} />
                          </td>
                          <td style={td}>
                            <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01" placeholder="0"
                              value={s.price} onChange={e => setSvc(i, { price: e.target.value })} />
                          </td>
                          <td style={td}>
                            <select style={cellInput} value={s.uom || f.uom} onChange={e => setSvc(i, { uom: e.target.value })}>
                              {unitOptions(s.uom).map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button type="button" title="Remove service" onClick={() => removeSvc(i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, marginTop: 6 }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <button type="button" style={{ ...link, marginTop: svcs.length ? 10 : 0 }} onClick={() => setSvcs(ss => [...ss, { ...EMPTY_SVC }])}>+ Add Service</button>
            </div>
          </div>
        </div>

        {newSvc !== null && (
          <NewServiceItemModal initialName={svcs[newSvc]?.name || ''} onClose={() => setNewSvc(null)}
            onCreated={it => { setProducts(ps => [...ps, it]); setSvc(newSvc, { skuItemId: String(it.id), name: svcs[newSvc]?.name || it.name }); setNewSvc(null); }} />
        )}

        <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button onClick={() => navigate('/recipe/recipes')} disabled={busy} style={{ ...btn, padding: '8px 16px', fontSize: 13, opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ ...btn, padding: '8px 16px', fontSize: 13, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : id ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
