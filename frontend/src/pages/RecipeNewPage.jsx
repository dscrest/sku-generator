import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import DateInput from '../components/DateInput.jsx';
import { btn } from '../components/woCommon.jsx';
import NewServiceItemModal from '../components/NewServiceItemModal.jsx';

/** New / edit product design as a full page (CR-221, Books "New Composite Item" look):
 *  label-left header fields, then a Component table — a component is a plain name
 *  (CR-236) with its allowed materials (the Materials master = Zoho Books items).
 *  No price columns. Create = one POST (template + components + materials). Edit
 *  = PUT meta + PUT components-bulk + DELETE for removed rows, then the builder opens. */

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
const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 8px', borderRadius: 5, fontSize: 12,
  background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
};

const EMPTY_ROW = { id: '', name: '', qty: 1, uom: '', materialIds: [] };
// Associated Services (CR-254): a component with no material, linked to a Books
// service item (RecipeComponent.allowMaterial = false + skuItemId). Qty 1 Nos
// like any other line; never stock, never a WO line.
const EMPTY_SVC = { id: '', name: '', skuItemId: '', qty: 1, uom: '' };
const isSvc = c => c.allowMaterial === false && Boolean(c.skuItemId);
const today = () => new Date().toISOString().slice(0, 10);

export default function RecipeNewPage() {
  const { id } = useParams(); // present = edit an existing design
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [composites, setComposites] = useState(null); // null = still reading Books
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState(['Nos']);
  const [f, setF] = useState({ name: '', code: '', productItemId: '', uom: '', effectiveFrom: today() });
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [svcs, setSvcs] = useState([]);
  const [newSvc, setNewSvc] = useState(null); // row index creating a Books service item
  const [removed, setRemoved] = useState([]); // component ids dropped while editing
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
      if (r.status === 'Superseded') { toast.error('This is an old copy of the design — edit the current one'); return navigate(`/recipe/recipes/${id}`); }
      setF({ name: r.name || '', code: r.code || '', productItemId: r.productItemId || '', uom: r.uom || '', effectiveFrom: r.effectiveFrom || today() });
      const comps = [...data.components].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      const matsOf = (c) => (data.options || []).filter(o => String(o.componentId) === String(c.id)).map(o => String(o.materialId));
      const items = comps.filter(c => !isSvc(c));
      setRows(items.length ? items.map(c => ({ id: c.id, name: c.name || '', qty: c.qty ?? 1, uom: c.uom || '', materialIds: matsOf(c) })) : [{ ...EMPTY_ROW }]);
      setSvcs(comps.filter(isSvc).map(c => ({ id: c.id, name: c.name || '', skuItemId: String(c.skuItemId), qty: c.qty ?? 1, uom: c.uom || '' })));
      setLoaded(true);
    }).catch(() => { toast.error('Failed to load the template'); navigate('/recipe/recipes'); });
  }, [id, navigate]);

  const byId = new Map(products.map(p => [String(p.id), p]));
  const matById = new Map(materials.map(m => [String(m.id), m]));
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }));
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const removeRow = (i) => {
    const r = rows[i];
    if (r.id) setRemoved(x => [...x, r.id]);
    setRows(rs => rs.length === 1 ? [{ ...EMPTY_ROW }] : rs.filter((_, j) => j !== i));
  };
  const serviceItems = products.filter(p => p.service);
  // Main product = the Books composite items (CR-264); a saved pick outside that list stays listed
  const savedPick = byId.get(String(f.productItemId));
  const mainProducts = composites || [];
  const mainOptions = savedPick && !mainProducts.some(p => String(p.id) === String(savedPick.id)) ? [savedPick, ...mainProducts] : mainProducts;
  const setSvc = (i, patch) => setSvcs(ss => ss.map((s, j) => j === i ? { ...s, ...patch } : s));
  const removeSvc = (i) => {
    if (svcs[i].id) setRemoved(x => [...x, svcs[i].id]);
    setSvcs(ss => ss.filter((_, j) => j !== i));
  };

  async function save() {
    if (!f.name.trim() || !f.code.trim()) return toast.error('Name and SKU are required');
    // Component name is optional: a row with only a material is named after its first material
    const nameOf = (r) => r.name.trim() || matById.get(r.materialIds[0])?.name || matById.get(r.materialIds[0])?.code || '';
    const items = rows.filter(nameOf);
    if (!items.length) return toast.error('Add at least one component or material');
    if (items.some(r => !(Number(r.qty) > 0))) return toast.error('Quantity must be above zero');
    const services = svcs.filter(s => s.name.trim() || s.skuItemId);
    if (services.some(s => !s.name.trim() || !s.skuItemId)) return toast.error('Each service needs a name and a service item');
    if (services.some(s => !(Number(s.qty) > 0))) return toast.error('Service quantity must be above zero');
    const prod = mainOptions.find(p => String(p.id) === String(f.productItemId));
    const meta = {
      name: f.name.trim(), productItemId: f.productItemId || '',
      productCode: prod ? prod.sku : '', productName: prod ? prod.name : '',
      effectiveFrom: f.effectiveFrom, uom: f.uom,
    };
    const components = [
      ...items.map(r => ({ id: r.id || undefined, name: nameOf(r), qty: Number(r.qty), uom: r.uom || f.uom, materialIds: r.materialIds })),
      ...services.map(s => ({ id: s.id || undefined, name: s.name.trim(), qty: Number(s.qty), uom: s.uom || f.uom, materialIds: [], allowMaterial: false, skuItemId: s.skuItemId })),
    ];
    setBusy(true);
    try {
      if (id) {
        await axios.put(`/api/recipe/recipes/${id}`, meta);
        await axios.put(`/api/recipe/recipes/${id}/components-bulk`, { components });
        for (const cid of removed) await axios.delete(`/api/recipe/components/${cid}`); // sequential — Dev concurrency cap
        toast.success('Saved');
        navigate(`/recipe/recipes/${id}`);
      } else {
        const { data } = await axios.post('/api/recipe/recipes', { code: f.code.trim(), ...meta, components });
        toast.success('Created');
        navigate(`/recipe/recipes/${data.id}`);
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
          <div style={row}>
            <span style={req}>Name*</span>
            <input style={input} value={f.name} onChange={set('name')} autoFocus />
          </div>
          <div style={row}>
            <span style={req}>SKU*</span>
            <input style={{ ...input, fontFamily: 'var(--font-mono)', background: id ? 'var(--bg-secondary)' : input.background }} value={f.code} onChange={set('code')}
              disabled={Boolean(id)} title={id ? 'The SKU cannot change' : ''} placeholder="e.g. RCP-RAVH100-SSQ" />
          </div>
          <div style={row}>
            <span style={label}>Main product (ERP item)</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select style={input} value={f.productItemId} onChange={set('productItemId')}>
                <option value="">{composites ? '— pick later —' : 'Loading composite items…'}</option>
                {mainOptions.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
              <button type="button" title="Refresh from Zoho Books" disabled={!composites} onClick={loadProducts}
                style={{ ...btn, padding: '0 12px', fontSize: 15, opacity: composites ? 1 : 0.5 }}>⟳</button>
            </div>
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
                      <th style={{ ...th, width: '28%' }}>Component</th>
                      <th style={th}>Materials (ZB items)</th>
                      <th style={{ ...th, width: 110, textAlign: 'right' }}>Quantity</th>
                      <th style={{ ...th, width: 110 }}>Unit</th>
                      <th style={{ ...th, width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const free = materials.filter(m => !r.materialIds.includes(String(m.id)));
                      return (
                        <tr key={r.id || `n${i}`}>
                          <td style={td}>
                            <input style={cellInput} value={r.name} placeholder="optional" onChange={e => setRow(i, { name: e.target.value })} />
                          </td>
                          <td style={td}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                              {r.materialIds.map(mid => (
                                <span key={mid} style={chip} title={matById.get(mid)?.name || ''}>
                                  {matById.get(mid)?.code || mid}
                                  <button type="button" title="Remove material" onClick={() => setRow(i, { materialIds: r.materialIds.filter(x => x !== mid) })}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
                                </span>
                              ))}
                              {/* ponytail: native select over the whole materials master; swap for a typeahead past a few hundred materials */}
                              <select style={{ ...cellInput, width: 'auto', minWidth: 150, color: free.length ? 'var(--blue)' : 'var(--text-muted)' }} value=""
                                disabled={!free.length} onChange={e => e.target.value && setRow(i, { materialIds: [...r.materialIds, e.target.value] })}>
                                <option value="">{free.length ? '+ add material' : materials.length ? 'all materials added' : 'no materials in master'}</option>
                                {free.map(m => <option key={m.id} value={m.id}>{m.code} — {m.name}{m.zohoItemId ? ' · Books' : ''}</option>)}
                              </select>
                            </div>
                          </td>
                          <td style={td}>
                            <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01"
                              value={r.qty} onChange={e => setRow(i, { qty: e.target.value })} />
                          </td>
                          <td style={td}>
                            <select style={cellInput} value={r.uom || f.uom} onChange={e => setRow(i, { uom: e.target.value })}>
                              {unitOptions(r.uom).map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <button type="button" title="Remove row" onClick={() => removeRow(i)}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15, marginTop: 6 }}>×</button>
                          </td>
                        </tr>
                      );
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
                                {serviceItems.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}{p.inBooks ? '' : ' · not in Books'}</option>)}
                              </select>
                              <button type="button" style={{ ...link, fontSize: 12, whiteSpace: 'nowrap' }} title="Create the service item in Zoho Books" onClick={() => setNewSvc(i)}>+ New in Books</button>
                            </div>
                          </td>
                          <td style={td}>
                            <input style={{ ...cellInput, fontFamily: 'var(--font-mono)', textAlign: 'right' }} type="number" min="0" step="0.01"
                              value={s.qty} onChange={e => setSvc(i, { qty: e.target.value })} />
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
          <button onClick={() => navigate(id ? `/recipe/recipes/${id}` : '/recipe/recipes')} disabled={busy} style={{ ...btn, padding: '8px 16px', fontSize: 13, opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ ...btn, padding: '8px 16px', fontSize: 13, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : id ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
