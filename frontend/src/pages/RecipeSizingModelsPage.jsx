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
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { industryId: '', groupValue: '', series: '', modelCode: '', capacity: '', recipeCode: '', status: 'Active' };

// Sizing master for the Product Configurator (CR-181): one row per model with
// its capacity. The CRM widget proposes the smallest model per series whose
// capacity covers the duty.
export default function RecipeSizingModelsPage() {
  const [rows, setRows] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [designs, setDesigns] = useState([]); // distinct recipe lineage codes
  const [fProduct, setFProduct] = useState('');
  const [fGroup, setFGroup] = useState('');
  const [fSeries, setFSeries] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [sortCol, setSortCol] = useState('series');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    try {
      const [m, i, r] = await Promise.all([
        axios.get('/api/recipe/sizing-models'),
        axios.get('/api/industries').catch(() => ({ data: [] })),
        axios.get('/api/recipe/recipes').catch(() => ({ data: [] })),
      ]);
      const nameById = new Map(i.data.map(x => [String(x.id), x.name]));
      setRows(m.data.map(x => ({ ...x, product: nameById.get(String(x.industryId)) || '' })));
      setIndustries(i.data);
      setDesigns([...new Set(r.data.map(x => x.code))].sort());
    } catch { toast.error('Failed to load sizing models'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => (!fProduct || r.product === fProduct) && (!fGroup || r.groupValue === fGroup) && (!fSeries || r.series === fSeries));
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

  const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
  const COLUMNS = [
    { key: 'modelCode', label: 'Model', lock: true, sortKey: 'modelCode', render: m => <span style={{ fontWeight: 600 }}>{m.modelCode}</span> },
    { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
    { key: 'groupValue', label: 'Group', sortKey: 'groupValue', render: m => m.groupValue || muted() },
    { key: 'series', label: 'Series', sortKey: 'series', render: m => m.series },
    { key: 'capacity', label: 'Capacity (ltr/rev)', align: 'right', sortKey: 'capacity', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{Number(m.capacity || 0).toFixed(2)}</span> },
    { key: 'recipeCode', label: 'Product Design', sortKey: 'recipeCode', render: m => m.recipeCode || muted() },
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
          <RowMenu onEdit={() => setEditing({ ...m })} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.sizing', COLUMNS);

  async function save() {
    if (!editing.industryId) return toast.error('Product is required');
    if (!editing.series || !editing.modelCode) return toast.error('Series and model are required');
    if (!(Number(editing.capacity) > 0)) return toast.error('Capacity must be above zero');
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
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load RAV defaults'); }
    finally { setSeeding(false); }
  }

  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => setEditing({ ...EMPTY, industryId: industries[0]?.id || '' })}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
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
              No sizing models.{' '}
              {rows.length === 0 && (
                <button onClick={seed} disabled={seeding} style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>
                  {seeding ? 'Loading…' : 'Load RAV defaults →'}
                </button>
              )}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => setEditing({ ...m })} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? `Edit ${editing.modelCode}` : 'Add sizing model'} onClose={() => setEditing(null)} onSubmit={save} width={460}>
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
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Group, Series and Model must match the values of the product&apos;s type, series and model questions — that is how the widget fills those answers in.
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save changes' : 'Add model'}</ModalBtn>
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
