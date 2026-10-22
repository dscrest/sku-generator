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
const mono = { ...inputStyle, fontFamily: 'var(--font-mono)' };
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { industryId: '', brand: '', driveConfig: '', tphMin: '', tphMax: '', rpmMin: '', rpmMax: '', hp: '', model: '', skuItemId: '', status: 'Active' };
const DRIVES = ['Chain Drive Only', 'Chain Drive + Coupling (Low RPM)', 'Direct Drive'];

// Lookups the form and the grid share: products (industries) and SKU-master items.
function useLookups() {
  const [lk, setLk] = useState({ industries: [], items: [] });
  const reload = useCallback(async () => {
    const [i, p] = await Promise.all([
      axios.get('/api/industries').catch(() => ({ data: [] })),
      axios.get('/api/recipe/products').catch(() => ({ data: [] })),
    ]);
    setLk({ industries: i.data, items: p.data });
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { ...lk, reload };
}

const band = (lo, hi) => (Number(lo) === Number(hi) ? `${Number(lo)}` : `${Number(lo)}–${Number(hi)}`);
const viewRows = (rows, lk) => {
  const nameById = new Map(lk.industries.map(x => [String(x.id), x.name]));
  const itemById = new Map(lk.items.map(x => [String(x.id), x.name]));
  return rows.map(x => ({
    ...x, product: nameById.get(String(x.industryId)) || '', itemName: itemById.get(String(x.skuItemId)) || '',
    tph: band(x.tphMin, x.tphMax), rpm: band(x.rpmMin, x.rpmMax),
  }));
};

// Modal body, shared by the grid's New and the details page's Edit.
export function MotorForm({ editing, setEditing, lk }) {
  const set = (k) => (e) => setEditing(v => ({ ...v, [k]: e.target.value }));
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={labelStyle}>Product</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.industryId} onChange={set('industryId')}>
            <option value="">—</option>
            {lk.industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div><label style={labelStyle}>Brand</label>
          <input style={inputStyle} value={editing.brand} onChange={set('brand')} placeholder="e.g. SEW" autoFocus /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Drive configuration</label>
          <input style={inputStyle} value={editing.driveConfig} onChange={set('driveConfig')} placeholder="e.g. Chain Drive Only" list="motor-drives" />
          <datalist id="motor-drives">{DRIVES.map(d => <option key={d} value={d} />)}</datalist></div>
        <div><label style={labelStyle}>TPH from</label>
          <input style={mono} type="number" step="any" min="0" value={editing.tphMin} onChange={set('tphMin')} /></div>
        <div><label style={labelStyle}>TPH to</label>
          <input style={mono} type="number" step="any" min="0" value={editing.tphMax} onChange={set('tphMax')} /></div>
        <div><label style={labelStyle}>RPM from</label>
          <input style={mono} type="number" step="any" min="0" value={editing.rpmMin} onChange={set('rpmMin')} /></div>
        <div><label style={labelStyle}>RPM to</label>
          <input style={mono} type="number" step="any" min="0" value={editing.rpmMax} onChange={set('rpmMax')} /></div>
        <div><label style={labelStyle}>Motor HP</label>
          <input style={mono} value={editing.hp} onChange={set('hp')} placeholder="e.g. 1.5" /></div>
        <div><label style={labelStyle}>Model</label>
          <input style={inputStyle} value={editing.model} onChange={set('model')} placeholder="e.g. R47DIBE90S4" /></div>
        <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Books item</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.skuItemId || ''} onChange={set('skuItemId')}>
            <option value="">— none —</option>
            {lk.items.map(it => <option key={it.id} value={it.id}>{it.name}{it.sku && it.sku !== it.name ? ` · ${it.sku}` : ''}</option>)}
          </select></div>
        <div><label style={labelStyle}>Status</label>
          <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.status || 'Active'} onChange={set('status')}>
            <option>Active</option><option>Inactive</option>
          </select></div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        The CRM configurator offers this model when the valve&apos;s TPH and RPM fall in the bands and sales pick this drive and HP.
        Books item: the motor the work order takes for the pick; blank = the pick is noted on the quote line only.
      </div>
    </>
  );
}

const muted = v => <span style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>;
const num = v => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{v}</span>;
const FIELDS = [
  { key: 'brand', label: 'Brand', sortKey: 'brand', render: m => <span style={{ fontWeight: 600 }}>{m.brand}</span> },
  { key: 'driveConfig', label: 'Drive', sortKey: 'driveConfig', render: m => m.driveConfig || muted() },
  { key: 'tph', label: 'TPH', sortKey: 'tphMin', render: m => num(m.tph) },
  { key: 'rpm', label: 'RPM', sortKey: 'rpmMin', render: m => num(m.rpm) },
  { key: 'hp', label: 'HP', sortKey: 'hp', render: m => num(m.hp || '—') },
  { key: 'model', label: 'Model', sortKey: 'model', render: m => m.model },
  { key: 'itemName', label: 'Books item', sortKey: 'itemName', render: m => m.itemName || muted() },
  { key: 'product', label: 'Product', sortKey: 'product', render: m => muted(m.product) },
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
const numOk = v => v !== '' && Number(v) >= 0;
const validate = e => !e.industryId ? 'Product is required'
  : !String(e.brand || '').trim() ? 'Brand is required'
  : !String(e.driveConfig || '').trim() ? 'Drive configuration is required'
  : !String(e.model || '').trim() ? 'Model is required'
  : !(numOk(e.tphMin) && numOk(e.tphMax) && Number(e.tphMin) <= Number(e.tphMax)) ? 'TPH band must be from ≤ to'
  : !(numOk(e.rpmMin) && numOk(e.rpmMax) && Number(e.rpmMin) <= Number(e.rpmMax)) ? 'RPM band must be from ≤ to' : null;
const CFG = {
  entityType: 'GearedMotor', listUrl: '/api/recipe/geared-motors', backTo: '/recipe/geared-motors',
  title: m => `${m.brand} · ${m.model}`, sub: m => `${m.driveConfig} · ${m.tph} TPH · ${m.rpm} RPM · ${m.hp || '—'} HP`, statusField: 'status',
  search: m => `${m.brand} ${m.model} ${m.hp} ${m.driveConfig} ${m.itemName}`,
  filters: [{ label: 'Brands', value: m => m.brand }, { label: 'Drives', value: m => m.driveConfig }, { label: 'Products', value: m => m.product }],
  fields: FIELDS, Form: MotorForm, validate, formWidth: 560,
  empty: 'No geared motors', deleteHint: 'The widget stops offering it. Set it Inactive instead to keep the row.',
};
export function Detail() {
  const lk = useLookups();
  return <MasterDetailPage cfg={{ ...CFG, view: rows => viewRows(rows, lk), formProps: { lk } }} />;
}

// Geared-motor master for the Product Configurator (CR-284): the brand sheet's
// rows (drive × TPH band × RPM band × HP → model). The CRM widget narrows them
// by the valve's duty and the sales picks; the linked Books item feeds the WO.
export default function RecipeGearedMotorsPage() {
  const [raw, setRaw] = useState([]);
  const lk = useLookups();
  const [q, setQ] = useState('');
  const [fBrand, setFBrand] = useState('');
  const [fDrive, setFDrive] = useState('');
  const [fProduct, setFProduct] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [sortCol, setSortCol] = useState('brand');
  const [sortDir, setSortDir] = useState('asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setRaw((await axios.get('/api/recipe/geared-motors')).data); }
    catch { toast.error('Failed to load geared motors'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = viewRows(raw, lk);
  const filtered = rows.filter(r => matches(q, r.brand, r.model, r.hp, r.driveConfig, r.itemName)
    && (!fBrand || r.brand === fBrand) && (!fDrive || r.driveConfig === fDrive) && (!fProduct || r.product === fProduct));
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? ''; const bv = b[sortCol] ?? '';
    const v = typeof av === 'number' && typeof bv === 'number' ? av - bv : av < bv ? -1 : av > bv ? 1 : 0;
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
          <RowMenu onEdit={() => navigate(`/recipe/geared-motors/${m.id}`)} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.geared-motors', COLUMNS);

  async function save() {
    const msg = validate(editing);
    if (msg) return toast.error(msg);
    try {
      if (editing.id) await axios.put(`/api/recipe/geared-motors/${editing.id}`, editing);
      else await axios.post('/api/recipe/geared-motors', editing);
      toast.success('Geared motor saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save geared motor'); }
  }

  async function handleDelete(m) {
    try {
      await axios.delete(`/api/recipe/geared-motors/${m.id}`);
      toast.success('Geared motor deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete geared motor'); }
    finally { setConfirmDel(null); }
  }

  async function seed() {
    setSeeding(true);
    try {
      const { data } = await axios.post('/api/recipe/seed-rav-motors');
      toast.success(data.skipped ? 'RAV already has geared motors' : `${data.motors} RAV motors loaded, ${data.linked} linked to Books items by name`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to load RAV motors'); }
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
                <SearchInput value={q} onChange={setQ} placeholder="Search motors…" />
                <FilterSelect label="brands" value={fBrand} onChange={setFBrand} options={distinct(rows, 'brand')} />
                <FilterSelect label="drives" value={fDrive} onChange={setFDrive} options={distinct(rows, 'driveConfig')} />
                <FilterSelect label="products" value={fProduct} onChange={setFProduct} options={distinct(rows, 'product')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {rows.length ? 'No matches.' : 'No geared motors.'}{' '}
              {rows.length === 0 && (
                <button onClick={seed} disabled={seeding} style={{ border: 'none', background: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: 13, padding: 0, fontWeight: 600 }}>
                  {seeding ? 'Loading…' : 'Load RAV motors →'}
                </button>
              )}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => navigate(`/recipe/geared-motors/${m.id}`)} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? 'Edit' : 'New'} onClose={() => setEditing(null)} onSubmit={save} width={560}>
          <MotorForm editing={editing} setEditing={setEditing} lk={lk} />
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save' : 'Create'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete ${confirmDel.brand} ${confirmDel.model}?`}
          confirmLabel="Delete geared motor"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          The widget stops offering it. Set it Inactive instead to keep the row.
        </ConfirmModal>
      )}
    </div>
  );
}
