import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

/**
 * Cost master (CR-106): org-wide cost elements with a default rate/value.
 * Recipes with an element of the same code fetch the rate live on every
 * calculation; per-material and per-quotation values override it.
 */

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

  // COLUMNS lives in the component: the actions column needs setEditing/setConfirmDel.
  const COLUMNS = [
    { key: 'code', label: 'Code', lock: true, sortKey: 'code', render: el => <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{el.code}</span> },
    { key: 'label', label: 'Label', sortKey: 'label', render: el => el.label },
    {
      key: 'calcType', label: 'Calculation', sortKey: 'calcType', render: el => {
        const [bg, fg] = CALC_COLORS[el.calcType] || CALC_COLORS.FIXED;
        return (
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: bg, color: fg, fontFamily: 'var(--font-mono)' }}>
            {el.calcType === 'RATE_QTY' ? 'RATE × QTY' : el.calcType}
          </span>
        );
      },
    },
    {
      key: 'rate', label: 'Default value', align: 'right', sortKey: 'rate', render: el => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
          {el.calcType === 'RATE_QTY' ? '—' : el.calcType === 'PERCENTAGE' ? `${Number(el.rate || 0)}%` : `₹${Number(el.rate || 0).toLocaleString('en-IN')}`}
        </span>
      ),
    },
    {
      key: 'actions', label: 'Actions', lock: true, width: 60, render: el => (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <RowMenu onEdit={() => setEditing({ ...el, rate: el.rate ?? '' })} onDelete={() => setConfirmDel(el)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('recipe.costs', COLUMNS);

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
          <Toolbar onAdd={() => setEditing({ ...EMPTY })} onRefresh={load} right={<ColumnChooser chooser={chooser} />} />
        </div>
        <div style={{ marginTop: 12 }}>
          {pageRows.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
              No cost elements yet. Add the costs you quote with (e.g. Machining, Assembly, Overhead %).
            </div>
          ) : (
            <DataTable cols={cols} rows={pageRows} onRowClick={el => setEditing({ ...el, rate: el.rate ?? '' })} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
          )}
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
