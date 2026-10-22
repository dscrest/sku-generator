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

const EMPTY = { industryId: '', name: '', efficiency: '', status: 'Active' };

function useIndustries() {
  const [industries, setIndustries] = useState([]);
  const reload = useCallback(async () => {
    setIndustries((await axios.get('/api/industries').catch(() => ({ data: [] }))).data);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { industries, reload };
}

const viewRows = (rows, industries) => {
  const nameById = new Map(industries.map(x => [String(x.id), x.name]));
  return rows.map(x => ({ ...x, product: nameById.get(String(x.industryId)) || '' }));
};

// Modal body, shared by the grid's New and the details page's Edit.
export function MaterialForm({ editing, setEditing, lk }) {
  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Product</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.industryId} onChange={set('industryId')}>
            <option value="">—</option>
            {lk.industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Material processed</label>
          <input style={inputStyle} value={editing.name} onChange={set('name')} placeholder="e.g. Boiler Fly Ash" autoFocus /></div>
        <div><label style={labelStyle}>Efficiency (%)</label>
          <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="any" min="1" max="100" value={editing.efficiency} onChange={set('efficiency')} /></div>
        <div><label style={labelStyle}>Status</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.status || 'Active'} onChange={set('status')}>
            <option>Active</option><option>Inactive</option>
          </select></div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        The CRM configurator sizes the valve for Volume × Efficiency ÷ 100 — 80 % of a 100 ltr/min duty picks the valve for 80 ltr/min.
      </div>
    </>
  );
}

const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
const FIELDS = [
  { key: 'name', label: 'Material', sortKey: 'name', render: m => <span style={{ fontWeight: 600 }}>{m.name}</span> },
  { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
  { key: 'efficiency', label: 'Efficiency (%)', align: 'right', sortKey: 'efficiency', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{Number(m.efficiency || 0)}</span> },
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
  : !String(e.name || '').trim() ? 'Material is required'
  : !(Number(e.efficiency) > 0 && Number(e.efficiency) <= 100) ? 'Efficiency must be between 1 and 100' : null;
const CFG = {
  entityType: 'SizingMaterial', listUrl: '/api/recipe/sizing-materials', backTo: '/recipe/sizing-materials',
  title: m => m.name, sub: m => `${m.product ? `${m.product} · ` : ''}${Number(m.efficiency || 0)} %`, statusField: 'status',
  search: m => `${m.name} ${m.product}`,
  filters: [{ label: 'Products', value: m => m.product }],
  fields: FIELDS, Form: MaterialForm, validate,
  empty: 'No materials', deleteHint: 'The widget stops offering it. Set it Inactive instead to keep the row.',
};
export function Detail() {
  const lk = useIndustries();
  return <MasterDetailPage cfg={{ ...CFG, view: rows => viewRows(rows, lk.industries), formProps: { lk } }} />;
}

// Material-efficiency master for the Product Configurator (CR-281): one row per
// material processed with its efficiency %. The CRM widget sizes the valve for
// Volume × efficiency ÷ 100.
export default function RecipeSizingMaterialsPage() {
  const [raw, setRaw] = useState([]);
  const lk = useIndustries();
  const [q, setQ] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setRaw((await axios.get('/api/recipe/sizing-materials')).data); }
    catch { toast.error('Failed to load materials'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = viewRows(raw, lk.industries);
  const filtered = rows.filter(r => matches(q, r.name, r.product) && (!fProduct || r.product === fProduct));
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : 0;
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
          <RowMenu onEdit={() => navigate(`/recipe/sizing-materials/${m.id}`)} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.sizing-materials', COLUMNS);

  async function save() {
    const msg = validate(editing);
    if (msg) return toast.error(msg);
    try {
      if (editing.id) await axios.put(`/api/recipe/sizing-materials/${editing.id}`, editing);
      else await axios.post('/api/recipe/sizing-materials', editing);
      toast.success('Material saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save material'); }
  }

  async function handleDelete(m) {
    try {
      await axios.delete(`/api/recipe/sizing-materials/${m.id}`);
      toast.success('Material deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete material'); }
    finally { setConfirmDel(null); }
  }

  async function seed() {
    setSeeding(true);
    try {
      const { data } = await axios.post('/api/recipe/seed-rav-materials');
      toast.success(data.skipped ? 'RAV already has materials' : `${data.materials} RAV materials loaded`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load RAV materials'); }
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
                <SearchInput value={q} onChange={setQ} placeholder="Search materials…" />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'product')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {rows.length ? 'No matches.' : 'No materials.'}{' '}
              {rows.length === 0 && (
                <button onClick={seed} disabled={seeding} style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>
                  {seeding ? 'Loading…' : 'Load RAV materials →'}
                </button>
              )}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => navigate(`/recipe/sizing-materials/${m.id}`)} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? 'Edit' : 'New'} onClose={() => setEditing(null)} onSubmit={save} width={460}>
          <MaterialForm editing={editing} setEditing={setEditing} lk={lk} />
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save' : 'Create'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete material "${confirmDel.name}"?`}
          confirmLabel="Delete material"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          The widget stops offering it. Set it Inactive instead to keep the row.
        </ConfirmModal>
      )}
    </div>
  );
}
