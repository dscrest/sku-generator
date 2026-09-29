import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import RecordPage, { RecordRail, RailCard } from '../components/RecordPage.jsx';
import HistoryTab from '../components/HistoryTab.jsx';
import Menu from '../components/Menu.jsx';
import Modal, { ModalFooter, ModalBtn, ConfirmModal, CloseX } from '../components/Modal.jsx';
import { btn } from '../components/woCommon.jsx';

/**
 * Details page for the four Product Configurator masters (CR-233): Materials,
 * Sizing Models, Component Map, Cost Master. One page, driven by a config the
 * grid page exports:
 *   { entityType, listUrl, backTo, title(r), chip(r)?, sub(r)?, search(r),
 *     filters:[{label, value(r)}], fields:[{key,label,render(r)}], Form,
 *     formProps?, validate(editing)?, toForm(r)?, toBody(editing)?,
 *     view(rows)? (sync decoration with lookups), onRows(rows)? (after load),
 *     statusField?, duplicate?, empty, deleteHint }
 * Form = the grid page's modal body: ({ editing, setEditing, rows, ...formProps }).
 * Edit = the same modal as the grid, Save = PUT listUrl/:id.
 */
const TABS = [['details', 'Details'], ['history', 'History']];
const statusChip = (s) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
    background: s === 'Inactive' ? 'var(--bg-secondary)' : '#dcfce7',
    color: s === 'Inactive' ? 'var(--text-muted)' : '#15803d',
  }}>{s || 'Active'}</span>
);

export default function MasterDetailPage({ cfg }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [raw, setRaw] = useState(null);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  // cfg is rebuilt by the wrapper on every render (lookups live there); only
  // the list URL decides when to refetch.
  const cfgRef = useRef(cfg); cfgRef.current = cfg;

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(cfgRef.current.listUrl);
      setRaw(data);
      cfgRef.current.onRows?.(data);
    } catch { toast.error('Failed to load'); }
  }, [cfg.listUrl]);
  useEffect(() => { load(); }, [load]);

  const rows = raw && (cfg.view ? cfg.view(raw) : raw);
  const row = rows?.find(r => String(r.id) === String(id));
  const err = (e, fallback) => toast.error(e.response?.data?.error || fallback);

  async function save() {
    const msg = cfg.validate ? cfg.validate(editing) : null;
    if (msg) return toast.error(msg);
    try {
      const body = cfg.toBody ? cfg.toBody(editing) : editing;
      if (editing.id) {
        await axios.put(`${cfg.listUrl}/${editing.id}`, body);
        toast.success('Saved'); setEditing(null); load();
      } else {
        const { data } = await axios.post(cfg.listUrl, body);
        toast.success('Created'); setEditing(null); navigate(`${cfg.backTo}/${data.id}`);
      }
    } catch (e) { err(e, 'Failed to save'); }
  }
  async function setStatus(status) {
    try { await axios.put(`${cfg.listUrl}/${id}`, { status }); toast.success(status === 'Inactive' ? 'Marked inactive' : 'Marked active'); load(); }
    catch (e) { err(e, 'Failed to change status'); }
  }
  async function del() {
    try { await axios.delete(`${cfg.listUrl}/${id}`); toast.success('Deleted'); navigate(cfg.backTo); }
    catch (e) { err(e, 'Failed to delete'); setConfirmDel(false); }
  }

  if (rows && !row) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Not found. <button style={btn} onClick={() => navigate(cfg.backTo)}>Back</button></div>;
  if (!row) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  const openEdit = (r) => setEditing(cfg.toForm ? cfg.toForm(r) : { ...r });
  const duplicate = () => { const { id: _id, ...rest } = cfg.toForm ? cfg.toForm(row) : row; setEditing(rest); };

  return (
    <RecordPage
      rail={
        <RecordRail
          items={rows} selectedId={id} onSelect={r => navigate(`${cfg.backTo}/${r.id}`)}
          search={cfg.search} filters={cfg.filters || []}
          card={r => <RailCard title={cfg.title(r)} chip={cfg.statusField ? statusChip(r[cfg.statusField]) : cfg.chip?.(r)} sub={cfg.sub ? cfg.sub(r) : ''} />}
          empty={cfg.empty || 'Nothing here yet'}
        />
      }
      title={cfg.title(row)}
      chips={cfg.statusField ? statusChip(row[cfg.statusField]) : cfg.chip?.(row)}
      actions={
        <>
          <button style={btn} onClick={() => openEdit(row)}>Edit</button>
          <Menu align="right" trigger="More ▾" triggerStyle={btn} items={[
            ...(cfg.duplicate ? [{ label: 'Duplicate', onClick: duplicate }] : []),
            ...(cfg.statusField && row[cfg.statusField] !== 'Inactive' ? [{ label: 'Mark as Inactive', onClick: () => setStatus('Inactive') }] : []),
            ...(cfg.statusField && row[cfg.statusField] === 'Inactive' ? [{ label: 'Mark as Active', onClick: () => setStatus('Active') }] : []),
            { label: 'Delete', tone: '#dc2626', onClick: () => setConfirmDel(true) },
          ]} />
          <CloseX onClick={() => navigate(cfg.backTo)} title="Back to the list" />
        </>
      }
      tabs={TABS} tab={tab} onTab={setTab}
    >
      {tab === 'history' && <HistoryTab entityType={cfg.entityType} entityId={id} />}
      {tab === 'details' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '8px 20px', maxWidth: 760 }}>
            {cfg.fields.map((f, i, all) => (
              <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '9px 0', fontSize: 13, borderBottom: i < all.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
                <span>{f.render ? f.render(row) : (row[f.key] ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit' : 'New'} onClose={() => setEditing(null)} onSubmit={save} width={cfg.formWidth || 460}>
          <cfg.Form editing={editing} setEditing={setEditing} rows={rows || []} {...(cfg.formProps || {})} />
          <ModalFooter>
            <ModalBtn onClick={() => setEditing(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={save}>{editing.id ? 'Save' : 'Create'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
      {confirmDel && (
        <ConfirmModal title={`Delete "${cfg.title(row)}"?`} confirmLabel="Delete" onConfirm={del} onClose={() => setConfirmDel(false)}>
          {cfg.deleteHint || 'This cannot be undone.'}
        </ConfirmModal>
      )}
    </RecordPage>
  );
}
