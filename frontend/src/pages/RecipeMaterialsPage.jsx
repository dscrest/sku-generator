import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';

const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const tdStyle = { padding: '10px 16px' };
const inputStyle = {
  height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%',
};
const labelStyle = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

const EMPTY = { code: '', name: '', rate: '', uom: 'KG', effectiveFrom: '', status: 'Active' };

export default function RecipeMaterialsPage() {
  const [rows, setRows] = useState([]);
  const [fStatus, setFStatus] = useState('');
  const [editing, setEditing] = useState(null); // null | {…row} | EMPTY (new)
  const [confirmDel, setConfirmDel] = useState(null);
  const [sortCol, setSortCol] = useState('code');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/materials');
      setRows(data);
    } catch { toast.error('Failed to load materials'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => !fStatus || r.status === fStatus);
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
  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

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
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Materials</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Central rate master — rate changes affect new calculations only, never past quotations</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => setEditing({ ...EMPTY })}
            onRefresh={load}
            right={<FilterSelect label="statuses" value={fStatus} onChange={setFStatus} options={distinct(rows, 'status')} />}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('code')}>Code <SortArrow col="code" /></th>
                <th style={thStyle} onClick={() => toggleSort('name')}>Name <SortArrow col="name" /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('rate')}>Rate <SortArrow col="rate" /></th>
                <th style={thStyle} onClick={() => toggleSort('uom')}>UOM <SortArrow col="uom" /></th>
                <th style={thStyle} onClick={() => toggleSort('effectiveFrom')}>Effective From <SortArrow col="effectiveFrom" /></th>
                <th style={thStyle} onClick={() => toggleSort('status')}>Status <SortArrow col="status" /></th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No materials yet. Add one, or seed the RAVS150 demo from the Recipes page.</td></tr>
              )}
              {pageRows.map(m => (
                <tr key={m.id}
                  onClick={() => setEditing({ ...m })}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{m.code}</td>
                  <td style={tdStyle}>{m.name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>₹{Number(m.rate || 0).toLocaleString('en-IN')}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{m.uom}</td>
                  <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>{m.effectiveFrom || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      background: m.status === 'Active' ? '#dcfce7' : 'var(--bg-secondary)',
                      color: m.status === 'Active' ? '#15803d' : 'var(--text-muted)',
                    }}>{m.status || 'Active'}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <RowMenu onEdit={() => setEditing({ ...m })} onDelete={() => setConfirmDel(m)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? `Edit material ${editing.code}` : 'Add material'} onClose={() => setEditing(null)} onSubmit={save} width={440}>
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
              <input style={inputStyle} type="date" value={editing.effectiveFrom} onChange={e => setEditing(v => ({ ...v, effectiveFrom: e.target.value }))} /></div>
            <div><label style={labelStyle}>Status</label>
              <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.status} onChange={e => setEditing(v => ({ ...v, status: e.target.value }))}>
                <option>Active</option><option>Inactive</option>
              </select></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Existing quotations keep the rate frozen in their snapshot; only new calculations use the updated rate.
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save changes' : 'Add material'}</ModalBtn>
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
          Fails if any recipe uses it — set it Inactive instead to retire it.
        </ConfirmModal>
      )}
    </div>
  );
}
