import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, SearchInput, matches, distinct } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import MasterDetailPage from './MasterDetailPage.jsx';

const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { industryId: '', groupValue: '', series: '', modelCode: '', capacity: '', recipeCode: '', status: 'Active', skuItemId: '' };

// Lookups the form and the grid share: products (industries), design codes, SKU-master items.
export function useSizingLookups() {
  const [lk, setLk] = useState({ industries: [], designs: [], items: [] });
  const reload = useCallback(async () => {
    const [i, r, p] = await Promise.all([
      axios.get('/api/industries').catch(() => ({ data: [] })),
      axios.get('/api/recipe/recipes').catch(() => ({ data: [] })),
      axios.get('/api/recipe/products').catch(() => ({ data: [] })),
    ]);
    setLk({
      industries: i.data,
      designs: [...new Set(r.data.map(x => x.code))].sort(),
      items: [...p.data].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...lk, reload };
}

// Raw rows + lookups → what the grid, rail and details show.
export const viewRows = (rows, lk) => {
  const nameById = new Map(lk.industries.map(x => [String(x.id), x.name]));
  const itemById = new Map(lk.items.map(x => [String(x.id), x.name]));
  return rows.map(x => ({ ...x, product: nameById.get(String(x.industryId)) || '', itemName: itemById.get(String(x.skuItemId)) || '' }));
};

// Modal body, shared by the grid's New/Edit and the details page (CR-233).
export function SizingForm({ editing, setEditing, rows, lk }) {
  const { industries, designs, items } = lk;
  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Product</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.industryId} onChange={set('industryId')}>
            <option value="">—</option>
            {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>Group (type question value)</label>
          <input style={inputStyle} value={editing.groupValue} onChange={set('groupValue')} placeholder="e.g. Drop through" list="sizing-groups" />
          <datalist id="sizing-groups">{distinct(rows, 'groupValue').map(g => <option key={g} value={g} />)}</datalist></div>
        <div><label style={labelStyle}>Series</label>
          <input style={inputStyle} value={editing.series} onChange={set('series')} placeholder="e.g. Square" list="sizing-series" />
          <datalist id="sizing-series">{distinct(rows, 'series').map(s => <option key={s} value={s} />)}</datalist></div>
        <div><label style={labelStyle}>Model</label>
          <input style={inputStyle} value={editing.modelCode} onChange={set('modelCode')} placeholder="e.g. RAVH 150" autoFocus /></div>
        <div><label style={labelStyle}>Capacity (ltr/rev)</label>
          <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" value={editing.capacity} onChange={set('capacity')} /></div>
        <div><label style={labelStyle}>Status</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.status || 'Active'} onChange={set('status')}>
            <option>Active</option><option>Inactive</option>
          </select></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Product design</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.recipeCode || ''} onChange={set('recipeCode')}>
            <option value="">— none yet —</option>
            {designs.map(c => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Books item</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.skuItemId || ''} onChange={set('skuItemId')}>
            <option value="">— none —</option>
            {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.sku && it.sku !== it.name ? ` · ${it.sku}` : ''}</option>)}
          </select></div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        Group, Series and Model must match the values of the product&apos;s type, series and model questions — that is how the widget fills those answers in.
        Books item: the valve the widget quotes for this model. Blank = the Product of the linked Product Design, if any; otherwise the widget generates a new SKU.
      </div>
    </>
  );
}

const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
const FIELDS = [
  { key: 'modelCode', label: 'Model', sortKey: 'modelCode', render: m => <span style={{ fontWeight: 600 }}>{m.modelCode}</span> },
  { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
  { key: 'groupValue', label: 'Group', sortKey: 'groupValue', render: m => m.groupValue || muted() },
  { key: 'series', label: 'Series', sortKey: 'series', render: m => m.series },
  { key: 'capacity', label: 'Capacity (ltr/rev)', align: 'right', sortKey: 'capacity', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{Number(m.capacity || 0).toFixed(2)}</span> },
  { key: 'recipeCode', label: 'Product Design', sortKey: 'recipeCode', render: m => m.recipeCode || muted() },
  { key: 'itemName', label: 'Books item', sortKey: 'itemName', render: m => m.itemName || muted() },
  {
    key: 'status', label: 'Status', sortKey: 'status', render: m => (
      <span style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: m.status === 'Inactive' ? 'var(--bg-secondary)' : '#dcfce7',
        color: m.status === 'Inactive' ? 'var(--text-muted)' : '#15803d',
      }}>{m.status || 'Active'}</span>
    ),
  },
];
const validate = e => !e.industryId ? 'Product is required'
  : (!e.series || !e.modelCode) ? 'Series and model are required'
  : !(Number(e.capacity) > 0) ? 'Capacity must be above zero' : null;
const CFG = {
  entityType: 'SizingModel', listUrl: '/api/recipe/sizing-models', backTo: '/recipe/sizing',
  title: m => m.modelCode, sub: m => `${m.series || ''}${m.groupValue ? ` · ${m.groupValue}` : ''} · ${Number(m.capacity || 0).toFixed(2)} ltr/rev`, statusField: 'status',
  search: m => `${m.modelCode} ${m.series} ${m.groupValue} ${m.product} ${m.recipeCode || ''}`,
  filters: [{ label: 'Products', value: m => m.product }, { label: 'Series', value: m => m.series }],
  fields: FIELDS, Form: SizingForm, validate,
  empty: 'No sizing models', deleteHint: 'The widget stops proposing it. Set it Inactive instead to keep the row.',
};
export function Detail() {
  const lk = useSizingLookups();
  return <MasterDetailPage cfg={{ ...CFG, view: rows => viewRows(rows, lk), formProps: { lk } }} />;
}

// Sizing master for the Product Configurator (CR-181): one row per model with
// its capacity. The CRM widget proposes the smallest model per series whose
// capacity covers the duty.
export default function RecipeSizingModelsPage() {
  const [raw, setRaw] = useState([]);
  const lk = useSizingLookups();
  const [q, setQ] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fSeries, setFSeries] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [sortCol, setSortCol] = useState('series');
  const [sortDir, setSortDir] = useState('asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setRaw((await axios.get('/api/recipe/sizing-models')).data); }
    catch { toast.error('Failed to load sizing models'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = viewRows(raw, lk);
  const filtered = rows.filter(r => matches(q, r.modelCode, r.series, r.groupValue, r.product, r.recipeCode) && (!fProduct || r.product === fProduct) && (!fGroup || r.groupValue === fGroup) && (!fSeries || r.series === fSeries));
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : (a.capacity - b.capacity);
    return sortDir === 'asc' ? v : -v;
  });
  const { pageRows, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const COLUMNS = [
    { ...FIELDS[0], lock: true }, ...FIELDS.slice(1),
    {
      key: 'actions', label: 'Actions', lock: true, width: 60, render: m => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu onEdit={() => navigate(`/recipe/sizing/${m.id}`)} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.sizing', COLUMNS);

  async function save() {
    const msg = validate(editing);
    if (msg) return toast.error(msg);
    try {
      if (editing.id) await axios.put(`/api/recipe/sizing-models/${editing.id}`, editing);
      else await axios.post('/api/recipe/sizing-models', editing);
      toast.success('Model saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save model'); }
  }

  async function handleDelete(m) {
    try {
      await axios.delete(`/api/recipe/sizing-models/${m.id}`);
      toast.success('Model deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete model'); }
    finally { setConfirmDel(null); }
  }

  async function seed() {
    setSeeding(true);
    try {
      const { data } = await axios.post('/api/recipe/seed-rav');
      toast.success(data.skipped ? 'RAV product already exists' : `RAV loaded: ${data.properties} questions, ${data.models} models`);
      load(); lk.reload();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load RAV defaults'); }
    finally { setSeeding(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => setEditing({ ...EMPTY, industryId: lk.industries[0]?.id || '' })}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <SearchInput value={q} onChange={setQ} placeholder="Search models…" />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'product')} />
                <FilterSelect label="groups" value={fGroup} onChange={setFGroup} options={distinct(rows, 'groupValue')} />
                <FilterSelect label="series" value={fSeries} onChange={setFSeries} options={distinct(rows, 'series')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {rows.length ? 'No matches.' : 'No sizing models.'}{' '}
              {rows.length === 0 && (
                <button onClick={seed} disabled={seeding} style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>
                  {seeding ? 'Loading…' : 'Load RAV defaults →'}
                </button>
              )}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => navigate(`/recipe/sizing/${m.id}`)} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? 'Edit' : 'New'} onClose={() => setEditing(null)} onSubmit={save} width={460}>
          <SizingForm editing={editing} setEditing={setEditing} rows={rows} lk={lk} />
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save' : 'Create'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete model "${confirmDel.modelCode}"?`}
          confirmLabel="Delete model"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          The widget stops proposing it. Set it Inactive instead to keep the row.
        </ConfirmModal>
      )}
    </div>
  );
}
