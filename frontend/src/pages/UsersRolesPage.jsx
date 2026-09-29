import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { ConfirmModal } from '../components/Modal.jsx';

// Users & Roles (org-level): Roles = per-module permission matrix (View /
// Create / Edit / Delete / Export) + WO action grants; Users = role
// assignment. Backed by /api/access (users.manage). The Admin role is
// reserved and locked server-side (full access); the org always keeps ≥1
// Admin holder. Modelled on BOFFO Granito's Roles screen (CR-239).

const MODULES = [
  { key: 'wo.orders', label: 'Work Orders' },
  { key: 'wo.purchase', label: 'Purchase' },
  { key: 'wo.bom', label: 'BOM' },
  { key: 'wo.defects', label: 'Store issues' },
  { key: 'wo.reports', label: 'WO Reports' },
  { key: 'wo.settings', label: 'WO Settings' },
  { key: 'sku', label: 'SKU Generator' },
  { key: 'reserve', label: 'Reserve / De-reserve' },
  { key: 'estimate', label: 'Estimates' },
  { key: 'recipe.recipes', label: 'Product Designs' },
  { key: 'recipe.materials', label: 'Materials' },
  { key: 'recipe.costs', label: 'Cost Master' },
  { key: 'recipe.sizing', label: 'Sizing Models' },
  { key: 'recipe.configure', label: 'Configure & Quote' },
  { key: 'recipe.quotations', label: 'Quotations' },
  { key: 'users.manage', label: 'Users & Roles' },
];
// view = the bare module key (page access); other verbs are `<mod>.<verb>`.
const VERBS = [
  { key: 'view', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'edit', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
  { key: 'export', label: 'Export' },
];
const verbKey = (mod, verb) => (verb === 'view' ? mod : `${mod}.${verb}`);
// WO action-level grants (CR-125) — which users may perform each action.
const ACTIONS = [
  { key: 'wo.action.reserve', label: 'Reserve material' },
  { key: 'wo.action.dereserve', label: 'De-reserve material' },
  { key: 'wo.action.issue', label: 'Issue material' },
  { key: 'wo.action.return', label: 'Return material' },
  { key: 'wo.action.assemble', label: 'Create assembly' },
  { key: 'wo.action.approve', label: 'Approve' },
  { key: 'wo.action.close', label: 'Close' },
  { key: 'wo.action.po.create', label: 'Raise purchase requests / POs' },
  { key: 'wo.action.po.modify', label: 'Edit / cancel POs' },
];

const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: '10px 16px', fontSize: 13 };
const center = { textAlign: 'center', width: 64 };
const tabBtn = (active) => ({
  padding: '10px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
  color: active ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400,
  borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
});
const btn = { padding: '6px 12px', fontSize: 13, fontWeight: 500, background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer' };
const primary = { ...btn, background: 'var(--blue)', color: '#fff', border: 'none' };
const lbl = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

// One-line grid summary, e.g. "Work Orders (all), Purchase (view, edit)".
function summarize(r) {
  if (r.locked) return 'Full access';
  const parts = MODULES.filter(m => r.perms.includes(m.key)).map(m => {
    const verbs = VERBS.filter(v => r.perms.includes(verbKey(m.key, v.key))).map(v => v.key);
    return verbs.length === VERBS.length ? `${m.label} (all)` : `${m.label} (${verbs.join(', ')})`;
  });
  return parts.length ? parts.join(', ') : 'No access';
}

export default function UsersRolesPage() {
  const [tab, setTab] = useState('users');
  const [roles, setRoles] = useState(null);
  const [users, setUsers] = useState(null);
  const [draft, setDraft] = useState(null); // { id?, name, locked, users, perms:Set }
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busyUser, setBusyUser] = useState(null);

  function load() {
    axios.get('/api/access/roles').then(r => setRoles(r.data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load roles'));
    axios.get('/api/access/users').then(r => setUsers(r.data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load users'));
  }
  useEffect(load, []);

  const openRole = (r) => setDraft(r ? { ...r, perms: new Set(r.perms) } : { name: '', locked: false, users: 0, perms: new Set() });

  const setKey = (key, on) => setDraft(d => {
    const perms = new Set(d.perms);
    if (on) perms.add(key); else perms.delete(key);
    return { ...d, perms };
  });
  // Any verb implies View; no View = no access to the module at all.
  const setCell = (mod, verb, on) => setDraft(d => {
    const perms = new Set(d.perms);
    if (on) { perms.add(verbKey(mod, verb)); perms.add(mod); }
    else if (verb === 'view') VERBS.forEach(v => perms.delete(verbKey(mod, v.key)));
    else perms.delete(verbKey(mod, verb));
    return { ...d, perms };
  });
  const setRow = (mod, on) => setDraft(d => {
    const perms = new Set(d.perms);
    VERBS.forEach(v => (on ? perms.add(verbKey(mod, v.key)) : perms.delete(verbKey(mod, v.key))));
    return { ...d, perms };
  });

  async function saveRole() {
    const name = draft.name.trim();
    if (!name) return toast.error('Role name is required');
    const body = { name, perms: [...draft.perms] };
    setBusy(true);
    try {
      if (draft.id) {
        await axios.put(`/api/access/roles/${draft.id}`, body);
        toast.success('Role updated — users get it on next reload');
      } else {
        await axios.post('/api/access/roles', body);
        toast.success('Role created — assign it under Users');
      }
      setDraft(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save role'); }
    finally { setBusy(false); }
  }

  async function deleteRole() {
    setBusy(true);
    try {
      await axios.delete(`/api/access/roles/${draft.id}`);
      toast.success(`Role "${draft.name}" deleted`);
      setDraft(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not delete role'); }
    finally { setBusy(false); setConfirmDel(false); }
  }

  async function toggleUserRole(user, roleId) {
    const next = user.roleIds.includes(roleId)
      ? user.roleIds.filter(id => id !== roleId)
      : [...user.roleIds, roleId];
    setBusyUser(user.id);
    try {
      await axios.put(`/api/access/users/${user.id}/roles`, { roleIds: next });
      setUsers(us => us.map(u => (u.id === user.id ? { ...u, roleIds: next } : u)));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update roles');
    } finally { setBusyUser(null); }
  }

  const adminId = roles?.find(r => r.locked)?.id;
  const adminHolders = users ? users.filter(u => u.roleIds.includes(adminId)).length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex' }}>
          <button style={tabBtn(tab === 'users')} onClick={() => setTab('users')}>Users</button>
          <button style={tabBtn(tab === 'roles')} onClick={() => setTab('roles')}>Roles</button>
        </div>
        {tab === 'roles' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn} onClick={load}>Refresh</button>
            <button style={primary} onClick={() => openRole(null)}>+ New role</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {tab === 'roles' && draft && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--blue)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 14 }}>
              {draft.locked ? `${draft.name} (locked)` : draft.id ? `Edit ${draft.name}` : 'New role'}
            </div>

            {draft.locked ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                The Admin role always has full access to everything and cannot be edited or deleted.
              </div>
            ) : (
              <>
                <label style={lbl}>Role name <span style={{ color: 'var(--red, #c62828)' }}>*</span></label>
                <input
                  autoFocus value={draft.name}
                  onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Manager"
                  style={{ height: 36, width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 10px', fontSize: 13, marginBottom: 14 }}
                />

                <div style={{ overflow: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, minWidth: 220 }}>Module</th>
                        {VERBS.map(v => <th key={v.key} style={{ ...th, ...center }}>{v.label}</th>)}
                        <th style={{ ...th, ...center }}>All</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map(m => {
                        const all = VERBS.every(v => draft.perms.has(verbKey(m.key, v.key)));
                        return (
                          <tr key={m.key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={td}>{m.label}</td>
                            {VERBS.map(v => (
                              <td key={v.key} style={{ ...td, ...center }}>
                                <input type="checkbox" aria-label={`${m.label}: ${v.label}`}
                                  checked={draft.perms.has(verbKey(m.key, v.key))}
                                  onChange={e => setCell(m.key, v.key, e.target.checked)} />
                              </td>
                            ))}
                            <td style={{ ...td, ...center }}>
                              <input type="checkbox" aria-label={`${m.label}: all`} checked={all} onChange={e => setRow(m.key, e.target.checked)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={lbl}>Work order actions</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
                    {ACTIONS.map(a => (
                      <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox" checked={draft.perms.has(a.key)} onChange={e => setKey(a.key, e.target.checked)} />
                        {a.label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              {!draft.locked && <span style={{ fontSize: 12, color: 'var(--red, #c62828)' }}>* Indicates a mandatory field</span>}
              <div style={{ flex: 1 }} />
              {draft.id && !draft.locked && (
                <button style={{ ...btn, color: 'var(--red, #c62828)' }} disabled={busy || draft.users > 0}
                  title={draft.users > 0 ? 'Unassign its users first' : 'Delete role'}
                  onClick={() => setConfirmDel(true)}>Delete</button>
              )}
              <button style={btn} onClick={() => setDraft(null)}>{draft.locked ? 'Close' : 'Cancel'}</button>
              {!draft.locked && (
                <button style={{ ...primary, opacity: !draft.name.trim() || busy ? 0.5 : 1 }} disabled={!draft.name.trim() || busy} onClick={saveRole}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'roles' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
            {!roles ? <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Role</th>
                    <th style={{ ...th, ...center }}>Users</th>
                    <th style={th}>WO actions</th>
                    <th style={th}>Permissions</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map(r => (
                    <tr key={r.id} className="list-row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => openRole(r)} title={r.locked ? 'View role' : 'Edit role'}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}{r.locked && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>locked</span>}</td>
                      <td style={{ ...td, ...center }}>{r.users}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>
                        {r.locked ? 'All' : ACTIONS.filter(a => r.perms.includes(a.key)).map(a => a.label).join(', ') || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>{summarize(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'users' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
            {!users || !roles ? <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>User</th>
                    {roles.map(r => <th key={r.id} style={{ ...th, textAlign: 'center' }}>{r.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: busyUser === u.id ? 0.6 : 1 }}>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{u.name || u.email}</div>
                        {u.name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>}
                      </td>
                      {roles.map(r => {
                        const lastAdmin = r.id === adminId && u.roleIds.includes(adminId) && adminHolders <= 1;
                        return (
                          <td key={r.id} style={{ ...td, textAlign: 'center' }} title={lastAdmin ? 'Last Admin — make someone else Admin first' : undefined}>
                            <input
                              type="checkbox"
                              checked={u.roleIds.includes(r.id)}
                              disabled={busyUser === u.id || lastAdmin}
                              onChange={() => toggleUserRole(u, r.id)}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={1 + roles.length} style={{ ...td, color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>No users yet — users appear after they select this organization.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {confirmDel && (
        <ConfirmModal
          title={`Delete role "${draft.name}"?`}
          confirmLabel="Delete role"
          onConfirm={deleteRole}
          onClose={() => setConfirmDel(false)}
        >
          This role has no users assigned. Deleting it cannot be undone.
        </ConfirmModal>
      )}
    </div>
  );
}
