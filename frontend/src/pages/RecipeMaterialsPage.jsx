import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, SearchInput, matches, distinct } from '../components/GridFooter.jsx';
import DateInput from '../components/DateInput.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import MasterDetailPage from './MasterDetailPage.jsx';

const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { code: '', name: '', rate: '', uom: 'KG', effectiveFrom: '', status: 'Active', zohoItemId: '', zohoItemName: '' };

// Typeahead against the Books catalog (CR-143): links a material to the raw
// -material Books item used as a mapped line when recipes push composites.
function BooksItemPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState(null); // null = closed
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const t = setTimeout(async () => {
      try { setHits((await axios.get('/api/recipe/books-items', { params: { q } })).data); }
      catch { setHits([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-secondary)' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.name || value.id}</span>
        <button type="button" onClick={() => onChange(null)} title="Unlink"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: '0 2px' }}>×</button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input style={inputStyle} value={q} onChange={e => setQ(e.target.value)} placeholder="Search Books items…" />
      {hits !== null && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 180, overflow: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,.1))',
        }}>
          {hits.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--text-muted)' }}>No matches</div>}
          {hits.map(it => (
            <button key={it.id} type="button" onClick={() => { onChange(it); setQ(''); setHits(null); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5 }}>
              {it.name}{it.sku ? <span style={{ color: 'var(--text-muted)' }}> ({it.sku})</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// Modal body, shared by the grid's New/Edit and the details page (CR-233).
export function MaterialForm({ editing, setEditing }) {
  return (
    <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Code</label>
              <input style={inputStyle} value={editing.code} onChange={e => setEditing(v => ({ ...v, code: e.target.value }))} placeholder="e.g. WCB" autoFocus /></div>
            <div><label style={labelStyle}>Name</label>
              <input style={inputStyle} value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} placeholder="defaults to code" /></div>
            <div><label style={labelStyle}>Rate (₹ per UOM)</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" value={editing.rate} onChange={e => setEditing(v => ({ ...v, rate: e.target.value }))} /></div>
            <div><label style={labelStyle}>UOM</label>
              <input style={inputStyle} value={editing.uom} onChange={e => setEditing(v => ({ ...v, uom: e.target.value }))} /></div>
            <div><label style={labelStyle}>Effective from</label>
              <DateInput style={inputStyle} value={editing.effectiveFrom} onChange={e => setEditing(v => ({ ...v, effectiveFrom: e.target.value }))} /></div>
            <div><label style={labelStyle}>Status</label>
              <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.status} onChange={e => setEditing(v => ({ ...v, status: e.target.value }))}>
                <option>Active</option><option>Inactive</option>
              </select></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={labelStyle}>Books item (for template BOM push)</label>
              <BooksItemPicker
                value={editing.zohoItemId ? { id: editing.zohoItemId, name: editing.zohoItemName } : null}
                onChange={it => setEditing(v => ({ ...v, zohoItemId: it ? it.id : '', zohoItemName: it ? it.name : '' }))}
              /></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Existing quotations keep the rate frozen in their snapshot; only new calculations use the updated rate.
          </div>
    </>
  );
}

const statusChip = (s) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
    background: s === 'Active' ? '#dcfce7' : 'var(--bg-secondary)',
    color: s === 'Active' ? '#15803d' : 'var(--text-muted)',
  }}>{s || 'Active'}</span>
);
const FIELDS = [
  { key: 'code', label: 'Code', sortKey: 'code', render: m => <span style={{ fontWeight: 600 }}>{m.code}</span> },
  { key: 'name', label: 'Name', sortKey: 'name', render: m => m.name },
  { key: 'rate', label: 'Rate', align: 'right', sortKey: 'rate', render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>₹{Number(m.rate || 0).toLocaleString('en-IN')}</span> },
  { key: 'uom', label: 'UOM', sortKey: 'uom', render: m => <span style={{ color: 'var(--text-muted)' }}>{m.uom}</span> },
  { key: 'effectiveFrom', label: 'Effective From', sortKey: 'effectiveFrom', render: m => <span style={{ color: 'var(--text-muted)' }}>{m.effectiveFrom || '—'}</span> },
  { key: 'zohoItem', label: 'Books Item', sortKey: 'zohoItemName', render: m => m.zohoItemName ? m.zohoItemName : <span style={{ color: 'var(--text-muted)' }}>—</span> },
  { key: 'status', label: 'Status', sortKey: 'status', render: m => statusChip(m.status) },
];
const CFG = {
  entityType: 'MaterialType', listUrl: '/api/recipe/materials', backTo: '/recipe/materials',
  title: m => m.code, sub: m => `${m.name || ''} · ₹${Number(m.rate || 0).toLocaleString('en-IN')}/${m.uom || 'KG'}`, statusField: 'status',
  search: m => `${m.code} ${m.name} ${m.zohoItemName || ''}`, filters: [{ label: 'Statuses', value: m => m.status || 'Active' }],
  fields: FIELDS, Form: MaterialForm, validate: e => (!e.code ? 'Code is required' : null),
  empty: 'No materials', deleteHint: 'Fails if any template uses it — set it Inactive instead to retire it.',
};
export function Detail() { return <MasterDetailPage cfg={CFG} />; }

export default function RecipeMaterialsPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fUom, setFUom] = useState('');
  const [editing, setEditing] = useState(null); // null | {…row} | EMPTY (new)
  const [confirmDel, setConfirmDel] = useState(null);
  const [sortCol, setSortCol] = useState('code');
  const [sortDir, setSortDir] = useState('asc');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/materials');
      setRows(data);
    } catch { toast.error('Failed to load materials'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r =>
    matches(q, r.code, r.name, r.zohoItemName) && (!fStatus || r.status === fStatus) && (!fUom || r.uom === fUom));
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

  // COLUMNS lives in the component: the actions column needs setEditing/setConfirmDel.
  const COLUMNS = [
    { ...FIELDS[0], lock: true }, ...FIELDS.slice(1),
    {
      key: 'actions', label: 'Actions', lock: true, width: 60, render: m => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu onEdit={() => navigate(`/recipe/materials/${m.id}`)} onDelete={() => setConfirmDel(m)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.materials', COLUMNS);

  async function save() {
    if (!editing.code) return toast.error('Code is required');
    try {
      if (editing.id) await axios.put(`/api/recipe/materials/${editing.id}`, editing);
      else await axios.post('/api/recipe/materials', editing);
      toast.success('Material saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save material'); }
  }

  async function handleDelete(m) {
    try {
      await axios.delete(`/api/recipe/materials/${m.id}`);
      toast.success('Material deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete material'); }
    finally { setConfirmDel(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => setEditing({ ...EMPTY })}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <SearchInput value={q} onChange={setQ} placeholder="Search materials…" />
                <FilterSelect label="UOMs" value={fUom} onChange={setFUom} options={distinct(rows, 'uom')} />
                <FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows, 'status')} />
              </div>
            }
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              {rows.length ? 'No matches.' : 'No materials yet. Add one.'}
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={m => navigate(`/recipe/materials/${m.id}`)} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? 'Edit' : 'New'} onClose={() => setEditing(null)} onSubmit={save} width={440}>
          <MaterialForm editing={editing} setEditing={setEditing} />
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save' : 'Create'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete material "${confirmDel.code}"?`}
          confirmLabel="Delete material"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          Fails if any template uses it — set it Inactive instead to retire it.
        </ConfirmModal>
      )}
    </div>
  );
}
