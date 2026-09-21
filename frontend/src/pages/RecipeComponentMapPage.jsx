import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const selectStyle = { ...inputStyle, background: 'var(--bg-card)' };
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { industryId: '', component: '', conditions: [], skuItemId: '', qty: 1, qtyPropertyId: '', required: false, status: 'Active' };

// Component Map for the Product Configurator: "when these answers hold,
// component X is item Y × qty". The CRM widget lists the matched items under
// the valve, and they become the Books composite BOM on push. Per component the
// row with the most conditions wins (recipe/componentMap.js).
export default function RecipeComponentMapPage() {
  const [rows, setRows] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [items, setItems] = useState([]);
  const [questions, setQuestions] = useState({}); // industryId -> { props, values }
  const [fProduct, setFProduct] = useState('');
  const [fComponent, setFComponent] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [sortCol, setSortCol] = useState('component');
  const [sortDir, setSortDir] = useState('asc');

  // Questions of one product, fetched once per product (on action, never on a timer).
  const loadQuestions = useCallback(async (industryId) => {
    if (!industryId) return null;
    const [p, v] = await Promise.all([
      axios.get(`/api/industries/${industryId}/properties`),
      axios.get(`/api/industries/${industryId}/property-values`),
    ]);
    const q = { props: p.data, values: v.data };
    setQuestions(prev => ({ ...prev, [industryId]: q }));
    return q;
  }, []);

  const load = useCallback(async () => {
    try {
      const [m, i, it] = await Promise.all([
        axios.get('/api/recipe/component-map'),
        axios.get('/api/industries').catch(() => ({ data: [] })),
        axios.get('/api/recipe/products').catch(() => ({ data: [] })),
      ]);
      setRows(m.data); setIndustries(i.data); setItems(it.data);
      // The "When" column needs captions — one fetch per product that has rows.
      for (const id of new Set(m.data.map(r => String(r.industryId)))) await loadQuestions(id).catch(() => null);
    } catch { toast.error('Failed to load the component map'); }
  }, [loadQuestions]);

  useEffect(() => { load(); }, [load]);

  const productName = new Map(industries.map(x => [String(x.id), x.name]));
  const itemById = new Map(items.map(x => [String(x.id), x]));
  const whenText = (r) => {
    const q = questions[String(r.industryId)];
    if (!r.conditions.length) return 'Always';
    return r.conditions.map(c => {
      const p = q?.props.find(x => String(x.id) === String(c.propertyId));
      const v = (q?.values[c.propertyId] || []).find(x => String(x.id) === String(c.valueId));
      return `${p?.caption || '?'} = ${v?.displayValue || '?'}`;
    }).join(', ');
  };
  const view = rows.map(r => {
    const it = itemById.get(String(r.skuItemId));
    const qp = r.qtyPropertyId && questions[String(r.industryId)]?.props.find(x => String(x.id) === String(r.qtyPropertyId));
    return {
      ...r, product: productName.get(String(r.industryId)) || '', when: whenText(r),
      item: it ? `${it.sku} — ${it.name}` : '', qtyText: r.qtyPropertyId ? `= ${qp?.caption || 'answer'}` : String(r.qty ?? 1),
    };
  });

  const filtered = view.filter(r => (!fProduct || r.product === fProduct) && (!fComponent || r.component === fComponent));
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : a.conditions.length - b.conditions.length;
    return sortDir === 'asc' ? v : -v;
  });
  const { pageRows, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function open(row) {
    setEditing({ ...EMPTY, ...row, conditions: (row.conditions || []).map(c => ({ ...c })) });
    if (row.industryId && !questions[String(row.industryId)]) loadQuestions(row.industryId).catch(() => toast.error('Failed to load questions'));
  }
  const duplicate = (row) => { const { id, ...rest } = row; open(rest); };

  const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
  const COLUMNS = [
    { key: 'component', label: 'Component', lock: true, sortKey: 'component', render: m => <span style={{ fontWeight: 600 }}>{m.component}</span> },
    { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
    { key: 'when', label: 'When', sortKey: 'when', render: m => m.conditions.length ? m.when : muted('Always') },
    { key: 'item', label: 'Item', sortKey: 'item', render: m => m.item || <span style={{ color: '#dc2626' }}>item deleted</span> },
    { key: 'qtyText', label: 'Qty', align: 'right', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{m.qtyText}</span> },
    { key: 'required', label: 'Required', sortKey: 'required', render: m => m.required ? 'Yes' : muted('No') },
    {
      key: 'status', label: 'Status', sortKey: 'status', render: m => (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
          background: m.status === 'Inactive' ? 'var(--bg-secondary)' : '#dcfce7',
          color: m.status === 'Inactive' ? 'var(--text-muted)' : '#15803d',
        }}>{m.status || 'Active'}</span>
      ),
    },
    {
      key: 'actions', label: 'Actions', lock: true, width: 60, render: m => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu onEdit={() => open(m)} onDuplicate={() => duplicate(m)} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.componentMap', COLUMNS);

  async function save() {
    if (!editing.industryId) return toast.error('Product is required');
    if (!editing.component.trim()) return toast.error('Component is required');
    if (!editing.skuItemId) return toast.error('Pick the item');
    const conditions = editing.conditions.filter(c => c.propertyId && c.valueId);
    if (conditions.length !== editing.conditions.length) return toast.error('Finish or remove the empty condition');
    if (!editing.qtyPropertyId && !(Number(editing.qty) > 0)) return toast.error('Qty must be above zero');
    const body = { ...editing, conditions, qty: editing.qtyPropertyId ? 1 : Number(editing.qty) };
    try {
      if (editing.id) await axios.put(`/api/recipe/component-map/${editing.id}`, body);
      else await axios.post('/api/recipe/component-map', body);
      toast.success('Row saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
  }

  async function handleDelete(m) {
    try {
      await axios.delete(`/api/recipe/component-map/${m.id}`);
      toast.success('Row deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
    finally { setConfirmDel(null); }
  }

  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));
  const setCond = (i, patch) => setEditing(v => ({ ...v, conditions: v.conditions.map((c, j) => j === i ? { ...c, ...patch } : c) }));
  const q = editing ? questions[String(editing.industryId)] : null;
  // Only SKU-active List questions: duty answers are not stored on the item, so
  // the Books BOM could never evaluate a condition on them.
  const condProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType !== 'Range');
  const qtyProps = (q?.props || []).filter(p => p.activeInSku !== false && p.valueType === 'Range');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => open({ industryId: industries.find(i => i.name === fProduct)?.id || industries[0]?.id || '' })}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(view, 'product')} />
                <FilterSelect label="components" value={fComponent} onChange={setFComponent} options={distinct(view, 'component')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              No component rows.
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={open} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.component}` : 'Add component row'} onClose={() => setEditing(null)} onSubmit={save} width={560}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Product</label>
              <select style={selectStyle} value={editing.industryId}
                onChange={e => { const id = e.target.value; setEditing(v => ({ ...v, industryId: id, conditions: [], qtyPropertyId: '' })); if (id && !questions[id]) loadQuestions(id).catch(() => toast.error('Failed to load questions')); }}>
                <option value="">—</option>
                {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select></div>
            <div><label style={labelStyle}>Component</label>
              <input style={inputStyle} value={editing.component} onChange={set('component')} placeholder="e.g. Body casting" list="cmap-components" autoFocus />
              <datalist id="cmap-components">{distinct(rows, 'component').map(c => <option key={c} value={c} />)}</datalist></div>
          </div>

          <div>
            <label style={labelStyle}>When (all must hold — none = always)</label>
            {editing.conditions.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 32px', gap: 8, marginBottom: 6 }}>
                <select style={selectStyle} value={c.propertyId} onChange={e => setCond(i, { propertyId: e.target.value, valueId: '' })}>
                  <option value="">Question…</option>
                  {condProps.map(p => <option key={p.id} value={p.id}>{p.caption}</option>)}
                </select>
                <select style={selectStyle} value={c.valueId} onChange={e => setCond(i, { valueId: e.target.value })}>
                  <option value="">Answer…</option>
                  {(q?.values[c.propertyId] || []).map(v => <option key={v.id} value={v.id}>{v.displayValue}</option>)}
                </select>
                <button type="button" title="Remove" onClick={() => setEditing(v => ({ ...v, conditions: v.conditions.filter((_, j) => j !== i) }))}
                  style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-secondary)' }}>×</button>
              </div>
            ))}
            <button type="button" onClick={() => setEditing(v => ({ ...v, conditions: [...v.conditions, { propertyId: '', valueId: '' }] }))}
              style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>+ Add condition</button>
          </div>

          <div><label style={labelStyle}>Item</label>
            <input style={inputStyle} list="cmap-items" placeholder="Type a SKU or name…"
              defaultValue={itemById.get(String(editing.skuItemId))?.sku || ''}
              onChange={e => { const hit = items.find(x => x.sku === e.target.value); setEditing(v => ({ ...v, skuItemId: hit ? hit.id : '' })); }} />
            {/* ponytail: native datalist over the full item list; swap for a server typeahead past a few thousand items */}
            <datalist id="cmap-items">{items.map(x => <option key={x.id} value={x.sku}>{x.name}</option>)}</datalist>
            <div style={{ fontSize: 11.5, color: editing.skuItemId ? 'var(--text-muted)' : '#dc2626', marginTop: 4 }}>
              {editing.skuItemId ? itemById.get(String(editing.skuItemId))?.name : 'No item picked'}
            </div></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Qty from</label>
              <select style={selectStyle} value={editing.qtyPropertyId || ''} onChange={set('qtyPropertyId')}>
                <option value="">Fixed qty</option>
                {qtyProps.map(p => <option key={p.id} value={p.id}>Answer: {p.caption}</option>)}
              </select></div>
            <div><label style={labelStyle}>Qty per unit</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" min="0" disabled={Boolean(editing.qtyPropertyId)}
                value={editing.qtyPropertyId ? '' : editing.qty} onChange={set('qty')} /></div>
            <div><label style={labelStyle}>Required</label>
              <select style={selectStyle} value={editing.required ? 'yes' : 'no'} onChange={e => setEditing(v => ({ ...v, required: e.target.value === 'yes' }))}>
                <option value="no">No — optional / accessory</option>
                <option value="yes">Yes — flag when nothing matches</option>
              </select></div>
            <div><label style={labelStyle}>Status</label>
              <select style={selectStyle} value={editing.status || 'Active'} onChange={set('status')}>
                <option>Active</option><option>Inactive</option>
              </select></div>
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save changes' : 'Add row'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete "${confirmDel.component}" row?`}
          confirmLabel="Delete row"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          The widget and the Books BOM stop using it. Set it Inactive instead to keep the row.
        </ConfirmModal>
      )}
    </div>
  );
}
