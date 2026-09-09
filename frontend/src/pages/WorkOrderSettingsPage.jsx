import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Empty, Banner } from '../components/MaterialsGrid.jsx';
import { AccessNotice } from '../components/woCommon.jsx';

/**
 * Work Order settings, Zoho-Books style (Haresh item 3.3): a left sidebar of
 * setting groups and a content pane for the active group. Groups come from the
 * server (`group` on each SETTING_KEYS entry), so a new setting lands in the
 * right section with no frontend change. Save writes the whole draft — the PUT
 * endpoint takes any subset of keys.
 */
export default function WorkOrderSettingsPage() {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [group, setGroup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(null);

  function load() {
    axios.get('/api/wo/settings')
      .then(({ data }) => {
        setCfg(data);
        setDraft(data.values);
        setGroup(g => g || data.keys[0]?.group || 'General');
      })
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

  const groups = [...new Set(cfg.keys.map(k => k.group || 'General'))];
  const activeKeys = cfg.keys.filter(k => (k.group || 'General') === group);
  const missingWarehouse = ['mainWarehouseId', 'reserveWarehouseId', 'issueWarehouseId'].filter(k => !draft[k]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(cfg.values);
  // A group with unsaved edits gets a dot so nothing gets lost while browsing.
  const dirtyGroups = new Set(cfg.keys
    .filter(k => (draft[k.key] ?? '') !== (cfg.values[k.key] ?? ''))
    .map(k => k.group || 'General'));

  return (
    <div style={{ height: '100%', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* group sidebar */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)', padding: '12px 0' }}>
        <div style={{ padding: '0 16px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Module settings
        </div>
        {groups.map(g => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '9px 16px', fontSize: 13, border: 'none', cursor: 'pointer',
              background: g === group ? 'var(--blue-light, #eef2ff)' : 'transparent',
              color: g === group ? 'var(--blue)' : 'var(--text-secondary)',
              fontWeight: g === group ? 600 : 400,
              borderLeft: g === group ? '3px solid var(--blue)' : '3px solid transparent',
            }}
          >
            <span style={{ flex: 1 }}>{g}</span>
            {dirtyGroups.has(g) && <span title="Unsaved changes" style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />}
            {g === 'Warehouses' && missingWarehouse.length > 0 && (
              <span title="Warehouses not configured" style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
            )}
          </button>
        ))}
      </div>

      {/* content pane */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px', maxWidth: 760 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>{group}</h2>

          {group === 'Warehouses' && missingWarehouse.length > 0 && (
            <Banner tone="warn">
              Material cannot be reserved, issued or returned until all three warehouses are set below.
            </Banner>
          )}
          {group === 'Warehouses' && cfg.warehouseError && (
            <Banner tone="warn">Could not read warehouses from Zoho: {cfg.warehouseError}</Banner>
          )}

          <div style={{ marginTop: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {activeKeys.map(k => (
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

          {group === 'Warehouses' && (
            <div style={{ marginTop: 22, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--text-secondary)' }}>How material moves</b><br />
              Reserve: Main → Reserve · De-reserve: Reserve → Main · Issue: Reserve → Issue · Return: Issue → Main.<br />
              Each confirmed action writes one Zoho Transfer Order between those two warehouses.
              With "Allow warehouse selection" on, store users can override the pair per action.
            </div>
          )}
        </div>

        {/* pinned save bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          <button
            onClick={save} disabled={busy || !dirty}
            style={{
              padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--blue)', cursor: dirty ? 'pointer' : 'not-allowed',
              background: dirty ? 'var(--blue)' : 'var(--bg-card)', color: dirty ? '#fff' : 'var(--text-muted)',
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          {dirty && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Unsaved changes — saving applies every section</span>}
        </div>
      </div>
    </div>
  );
}

const input = {
  flex: 1, maxWidth: 320, padding: '6px 10px', fontSize: 13,
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
};
