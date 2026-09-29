import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import RecordPage, { RecordRail, RailCard } from '../components/RecordPage.jsx';
import HistoryTab from '../components/HistoryTab.jsx';
import Menu from '../components/Menu.jsx';
import Modal, { ModalFooter, ModalBtn, CloseX } from '../components/Modal.jsx';
import PushZohoDialog, { isStale } from '../components/PushZohoDialog.jsx';
import PickList from '../components/PickList.jsx';
import { cleanFieldValue, itemFieldError } from '../components/itemFieldRules.js';
import { btn } from '../components/woCommon.jsx';
import { fmtDate } from '../format.js';

/**
 * One SKU item (CR-233): rail of items · header (name · sku · Books state ·
 * Edit · More ▾ · ✕) · Details / History tabs. Details is read-only until Edit;
 * Save = PUT /api/sku-items/:id. Replaces the in-page master–detail the grid
 * used to open (`?item=` deep links redirect here).
 */
const inputStyle = {
  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', padding: '9px 12px',
  fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box',
};
const labelStyle = {
  fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5,
};
const TABS = [['details', 'Details'], ['history', 'History']];
// SKUItem.booksData holds the org-enabled extra item fields (HSN, Manufacturer… CR-209).
const parseBooksData = (s) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const formOf = (item) => ({ name: item.name, description: item.description || '', type: item.type, fields: parseBooksData(item.booksData) });
const Z = <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', flexShrink: 0 }}>Z</span>;

// The SKU items rail — shared with the generator page (New / Open in Generator)
// so create, edit and details all sit in the same shell.
export function SkuRail({ items, selectedId, onSelect }) {
  return (
    <RecordRail
      items={items} selectedId={selectedId} onSelect={onSelect} width={300}
      search={i => `${i.sku} ${i.name}`}
      filters={[{ label: 'Industries', value: i => i.industry?.name || '' }, { label: 'Books', value: i => (i.zohoItemId ? 'In Books' : 'Not in Books') }]}
      card={i => <RailCard title={i.name} chip={i.zohoItemId ? Z : null} sub={<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>{i.sku}</span>} />}
      empty="No items"
    />
  );
}

export default function SKUItemPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('details');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settings, setSettings] = useState(null); // org SKU settings: push defaults (CR-166), type labels (CR-180), extra fields (CR-209)
  const [fieldOptions, setFieldOptions] = useState({});

  useEffect(() => { axios.get('/api/sku-items/settings').then(r => setSettings(r.data)).catch(() => {}); }, []);
  const typeLabel = (t) => settings?.typeLabels?.[t] || t;
  const extraFields = (settings?.itemFieldCatalog || []).filter(f => (settings?.itemFields || []).includes(f.key));
  // Dropdown values for fields backed by a Books master (Manufacturer, CR-210).
  useEffect(() => {
    extraFields.filter(f => f.source).forEach(f =>
      axios.get(f.source).then(r => setFieldOptions(o => ({ ...o, [f.key]: r.data })))
        .catch(() => toast.error(`${f.label} list could not be loaded from Zoho Books`)));
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadList = useCallback(() => axios.post('/api/sku-items/search', {}).then(r => setList(r.data)).catch(() => setList([])), []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { setEditing(false); }, [id]);
  // The item comes from the list (it carries the industry name); a deep link
  // renders from the values route until the list lands. Cancel = re-seed.
  useEffect(() => {
    if (editing) return;
    const fromList = list?.find(i => String(i.id) === String(id));
    if (fromList) { setItem(fromList); setForm(formOf(fromList)); return; }
    if (list === null) {
      axios.get(`/api/sku-items/${id}/values`).then(r => { setItem(r.data.item); setForm(formOf(r.data.item)); })
        .catch(() => toast.error('Failed to load the item'));
    }
  }, [id, list, editing]);

  if (!item || !form) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;
  if (list && !list.some(i => String(i.id) === String(id))) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Item not found. <button style={btn} onClick={() => navigate('/sku/items')}>Back</button></div>;
  }
  const stale = isStale(item);
  const setF = (patch) => setForm(f => ({ ...f, ...patch }));
  const setField = (f, v) => setForm(fm => ({ ...fm, fields: { ...(fm.fields || {}), [f.key]: cleanFieldValue(f, v) } }));

  async function save() {
    if (!form.name.trim()) return toast.error('Name is required');
    const fieldErr = itemFieldError(extraFields, form.fields);
    if (fieldErr) return toast.error(fieldErr);
    setSaving(true);
    try {
      // SKU code is derived from Name on the server (CR-237).
      await axios.put(`/api/sku-items/${id}`, { name: form.name, description: form.description, type: form.type, fields: form.fields });
      toast.success('SKU updated'); setEditing(false); loadList();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update'); }
    finally { setSaving(false); }
  }

  async function push(cfg) {
    setPushOpen(false); setPushing(true);
    const tid = toast.loading(`${item.zohoItemId ? 'Re-pushing' : 'Pushing'} "${item.sku}" to Zoho Books…`);
    try {
      const { data } = await axios.post(`/api/sku-items/${id}/push-zoho`, { tracking: cfg.tracking, inventoryAccountId: cfg.accountId || undefined });
      toast.success(`Synced to Zoho Books · ID ${data.zohoItemId}`, { id: tid }); loadList();
    } catch (err) { toast.error(err.response?.data?.error || 'Push failed', { id: tid }); }
    finally { setPushing(false); }
  }

  async function del() {
    try {
      const { data } = await axios.delete(`/api/sku-items/${id}`);
      toast.success(data?.zohoDeleted ? 'Item deleted here and in Zoho Books' : 'Item deleted');
      navigate('/sku/items');
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete item'); setConfirmDelete(false); }
  }

  const ro = !editing;
  return (
    <RecordPage
      rail={<SkuRail items={list} selectedId={id} onSelect={i => navigate(`/sku/items/${i.id}`)} />}
      title={item.name}
      chips={
        <>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{item.sku}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
            background: stale ? '#fefce8' : item.zohoItemId ? '#f0fdf4' : '#fff7ed',
            color: stale ? '#a16207' : item.zohoItemId ? '#16a34a' : '#ea580c',
          }} title={item.zohoItemId ? `Zoho ID ${item.zohoItemId}` : undefined}>
            Z {stale ? 'Edited since last push' : item.zohoItemId ? 'Synced' : 'Not in Books'}
          </span>
        </>
      }
      actions={
        <>
          {ro && <button style={btn} onClick={() => setEditing(true)}>Edit</button>}
          <Menu align="right" trigger="More ▾" triggerStyle={btn} items={[
            { label: 'Open in Generator', title: 'Change its parameter values — SKU/name/description regenerate', onClick: () => navigate(`/sku/generator?item=${id}`) },
            { label: item.zohoItemId ? 'Re-push to Zoho Books' : 'Push to Zoho Books', disabled: pushing, onClick: () => setPushOpen(true) },
            { label: 'Delete', tone: '#dc2626', onClick: () => setConfirmDelete(true) },
          ]} />
          <CloseX onClick={() => navigate('/sku/items')} title="Back to the list" />
        </>
      }
      tabs={TABS} tab={tab} onTab={setTab}
    >
      {tab === 'history' && <HistoryTab entityType="SKUItem" entityId={id} />}
      {tab === 'details' && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 24px' }}>
          <div style={{ maxWidth: 760, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div><label style={labelStyle}>Name {!ro && <span style={{ color: '#e11d48' }}>*</span>}</label>
                <input style={inputStyle} disabled={ro} value={form.name} onChange={e => setF({ name: e.target.value })} /></div>
              <div><label style={labelStyle}>Description</label>
                <textarea rows={8} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} disabled={ro} value={form.description} onChange={e => setF({ description: e.target.value })} /></div>
              {/* Extra item fields (CR-209) — only the ones this org enabled */}
              {extraFields.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {extraFields.map(f => (
                    <div key={f.key}><label style={labelStyle}>{f.label}</label>
                      {!ro && fieldOptions[f.key]?.length ? (
                        <PickList value={form.fields?.[f.key] ?? ''} options={fieldOptions[f.key]} placeholder="Select or type"
                          inputProps={{ maxLength: f.maxLen }} onChange={v => setField(f, v)} style={inputStyle} />
                      ) : (
                        <input style={inputStyle} disabled={ro} value={form.fields?.[f.key] ?? ''} maxLength={f.maxLen}
                          inputMode={f.digits ? 'numeric' : undefined} pattern={f.digits ? '\\d*' : undefined}
                          onChange={e => setField(f, e.target.value)} />
                      )}</div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div><label style={labelStyle}>Type</label>
                  <select style={{ ...inputStyle, cursor: ro || item.zohoItemId ? 'default' : 'pointer' }} disabled={ro || Boolean(item.zohoItemId)}
                    title={item.zohoItemId ? `Type is locked after pushing to Zoho Books — ${typeLabel('Trading')} and ${typeLabel('Manufacturing')} map to different Books item kinds` : undefined}
                    value={form.type} onChange={e => setF({ type: e.target.value })}>
                    <option value="Trading">{typeLabel('Trading')}</option>
                    <option value="Manufacturing">{typeLabel('Manufacturing')}</option>
                  </select></div>
                <div><label style={labelStyle}>Industry</label>
                  <div style={{ ...inputStyle, background: 'transparent', border: '1px solid transparent', padding: '9px 0' }}>{item.industry?.name || '—'}</div></div>
                <div><label style={labelStyle}>Created</label>
                  <div style={{ ...inputStyle, background: 'transparent', border: '1px solid transparent', padding: '9px 0' }}>{fmtDate(item.createdAt)}</div></div>
              </div>
            </div>
            {editing && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <ModalBtn onClick={() => setEditing(false)}>Cancel</ModalBtn>
                <ModalBtn onClick={save} variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</ModalBtn>
              </div>
            )}
          </div>
        </div>
      )}

      {pushOpen && <PushZohoDialog target={item} defaults={settings} onClose={() => setPushOpen(false)} onPush={push} />}
      {confirmDelete && (
        <Modal title={`Delete SKU "${item.sku}"?`} onClose={() => setConfirmDelete(false)} width={420}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            The SKU and its stored property values are removed. This cannot be undone.
            {item.zohoItemId ? ' The linked item in Zoho Books is deleted too — Books refuses if it has transactions.' : ''}
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setConfirmDelete(false)}>Keep it</ModalBtn>
            <ModalBtn variant="primary" onClick={del}>Delete SKU</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </RecordPage>
  );
}
