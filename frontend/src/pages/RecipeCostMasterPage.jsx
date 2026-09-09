import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';

/**
 * Cost master (CR-106): org-wide cost elements with a default rate/value.
 * Recipes with an element of the same code fetch the rate live on every
 * calculation; per-material and per-quotation values override it.
 */

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
const CALC_COLORS = { RATE_QTY: ['#dcfce7', '#15803d'], FIXED: ['#dbeafe', '#1d4ed8'], PERCENTAGE: ['#fef3c7', '#92400e'] };
const CALC_HELP = {
  RATE_QTY: 'material rate × cast weight (default value unused)',
  FIXED: 'default ₹ value per material row',
  PERCENTAGE: 'default % of the running subtotal',
};

const EMPTY = { label: '', calcType: 'FIXED', rate: '' };

export default function RecipeCostMasterPage() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // null | {…row} | EMPTY (new)
  const [confirmDel, setConfirmDel] = useState(null);
  const [sortCol, setSortCol] = useState('sequence');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/recipe/cost-elements');
      setRows(data);
    } catch { toast.error('Failed to load cost master'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sorted = [...rows].sort((a, b) => {
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
    if (!editing.label) return toast.error('Label is required');
    try {
      if (editing.id) await axios.put(`/api/recipe/cost-elements/${editing.id}`, editing);
      else await axios.post('/api/recipe/cost-elements', editing);
      toast.success('Cost element saved'); setEditing(null); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save cost element'); }
  }

  async function handleDelete(el) {
    try {
      await axios.delete(`/api/recipe/cost-elements/${el.id}`);
      toast.success('Cost element deleted'); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete cost element'); }
    finally { setConfirmDel(null); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Cost Master</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Default cost values, fetched live by recipes with matching elements — never changes past quotations</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar onAdd={() => setEditing({ ...EMPTY })} onRefresh={load} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('code')}>Code <SortArrow col="code" /></th>
                <th style={thStyle} onClick={() => toggleSort('label')}>Label <SortArrow col="label" /></th>
                <th style={thStyle} onClick={() => toggleSort('calcType')}>Calculation <SortArrow col="calcType" /></th>
                <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => toggleSort('rate')}>Default value <SortArrow col="rate" /></th>
                <th style={{ ...thStyle, width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No cost elements yet. Add the costs you quote with (e.g. Machining, Assembly, Overhead %).</td></tr>
              )}
              {pageRows.map(el => {
                const [bg, fg] = CALC_COLORS[el.calcType] || CALC_COLORS.FIXED;
                return (
                  <tr key={el.id}
                    onClick={() => setEditing({ ...el, rate: el.rate ?? '' })}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ ...tdStyle, fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{el.code}</td>
                    <td style={tdStyle}>{el.label}</td>
                    <td style={tdStyle}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg, fontFamily: 'var(--font-mono)' }}>
                        {el.calcType === 'RATE_QTY' ? 'RATE × QTY' : el.calcType}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                      {el.calcType === 'RATE_QTY' ? '—' : el.calcType === 'PERCENTAGE' ? `${Number(el.rate || 0)}%` : `₹${Number(el.rate || 0).toLocaleString('en-IN')}`}
                    </td>
                    <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <RowMenu onEdit={() => setEditing({ ...el, rate: el.rate ?? '' })} onDelete={() => setConfirmDel(el)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />

      {editing && (
        <Modal title={editing.id ? `Edit cost element ${editing.code}` : 'Add cost element'} onClose={() => setEditing(null)} onSubmit={save} width={440}>
          <div><label style={labelStyle}>Label</label>
            <input style={inputStyle} value={editing.label} onChange={e => setEditing(v => ({ ...v, label: e.target.value }))} placeholder="e.g. Machining" autoFocus /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={labelStyle}>Calculation</label>
              <select style={{ ...inputStyle, background: 'var(--bg-card)' }} value={editing.calcType} onChange={e => setEditing(v => ({ ...v, calcType: e.target.value }))}>
                <option value="FIXED">Fixed value</option>
                <option value="RATE_QTY">Rate × qty</option>
                <option value="PERCENTAGE">Percentage</option>
              </select></div>
            <div><label style={labelStyle}>Default value</label>
              <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="number" step="0.01" disabled={editing.calcType === 'RATE_QTY'}
                value={editing.calcType === 'RATE_QTY' ? '' : editing.rate}
                onChange={e => setEditing(v => ({ ...v, rate: e.target.value }))}
                placeholder={editing.calcType === 'RATE_QTY' ? 'from material rate' : ''} /></div>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {CALC_HELP[editing.calcType]}. Recipes with this element pick the default up automatically; material rows and quotations can override it. Past quotations stay frozen.
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save changes' : 'Add cost element'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete cost element "${confirmDel.label}"?`}
          confirmLabel="Delete element"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          Recipes using code {confirmDel.code} keep their column but lose this default value.
        </ConfirmModal>
      )}
    </div>
  );
}
