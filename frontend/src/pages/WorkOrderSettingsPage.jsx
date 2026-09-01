import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Empty, Banner } from '../components/MaterialsGrid.jsx';
import { AccessNotice } from '../components/woCommon.jsx';

/**
 * Work Order settings. The three warehouses are the one thing that must be set
 * before any material can move, so they lead and the page says so plainly.
 */
export default function WorkOrderSettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);

  function load() {
    axios.get('/api/wo/settings')
      .then(({ data }) => { setCfg(data); setDraft(data.values); })
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load settings');
      });
  }
  useEffect(load, []);

  async function save() {
    setBusy(true);
    try {
      await axios.put('/api/wo/settings', draft);
      toast.success('Settings saved');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save');
    } finally { setBusy(false); }
  }

  if (blocked) return <AccessNotice kind={blocked} />;
  if (!cfg) return <Empty>Loading settings…</Empty>;

  const missingWarehouse = ['mainWarehouseId', 'reserveWarehouseId', 'issueWarehouseId'].filter(k => !draft[k]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg.values);

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px 20px 32px', maxWidth: 720 }}>
      {missingWarehouse.length > 0 && (
        <Banner tone="warn">
          Material cannot be reserved, issued or returned until all three warehouses are set below.
        </Banner>
      )}
      {cfg.warehouseError && (
        <Banner tone="warn">Could not read warehouses from Zoho: {cfg.warehouseError}</Banner>
      )}

      <div style={{ marginTop: 14, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
        {cfg.keys.map(k => (
          <div key={k.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 230 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{k.label}</div>
              {k.hint && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{k.hint}</div>}
            </div>
            {k.type === 'warehouse' ? (
              <select
                value={draft[k.key] || ''}
                onChange={e => setDraft(d => ({ ...d, [k.key]: e.target.value }))}
                style={{ ...input, borderColor: draft[k.key] ? 'var(--border)' : '#fca5a5' }}
              >
                <option value="">Not set</option>
                {cfg.warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}{w.isPrimary ? ' (primary)' : ''}</option>
                ))}
              </select>
            ) : k.type === 'select' ? (
              <select
                value={draft[k.key] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [k.key]: e.target.value }))}
                style={input}
              >
                {k.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={k.type === 'number' ? 'number' : k.type === 'email' ? 'email' : 'text'}
                value={draft[k.key] ?? ''}
                onChange={e => setDraft(d => ({ ...d, [k.key]: e.target.value }))}
                style={input}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
        <button
          onClick={save} disabled={busy || !dirty}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--radius-md)',
            border: '1px solid var(--blue)', cursor: dirty ? 'pointer' : 'not-allowed',
            background: dirty ? 'var(--blue)' : 'var(--bg-card)', color: dirty ? '#fff' : 'var(--text-muted)',
          }}
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unsaved changes</span>}
      </div>

      <div style={{ marginTop: 26, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b style={{ color: 'var(--text-secondary)' }}>How material moves</b><br />
        Reserve: Main → Reserve · De-reserve: Reserve → Main · Issue: Reserve → Issue · Return: Issue → Main.<br />
        Each confirmed action writes one Zoho Transfer Order between those two warehouses.
      </div>
    </div>
  );
}

const input = {
  flex: 1, maxWidth: 320, padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
};
