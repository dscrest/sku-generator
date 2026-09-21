import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn, ConfirmModal } from '../components/Modal.jsx';
import RowMenu from '../components/RowMenu.jsx';

// Users & Roles (org-level): Roles = named permission sets, Users = role
// assignment. Backed by /api/access (requires the users.manage permission).
// An org with zero roles is wide open — the banner says so.

export const PERM_LABELS = {
  'wo.orders': 'Work Orders',
  'wo.purchase': 'Purchase',
  'wo.bom': 'BOM',
  'wo.reports': 'WO Reports',
  'wo.settings': 'WO Settings',
  // WO action-level grants (CR-125) — which users may perform each action.
  'wo.action.reserve': 'WO: Reserve material',
  'wo.action.dereserve': 'WO: De-reserve material',
  'wo.action.issue': 'WO: Issue material',
  'wo.action.return': 'WO: Return material',
  'wo.action.assemble': 'WO: Create assembly',
  'wo.action.approve': 'WO: Approve',
  'wo.action.close': 'WO: Close',
  'wo.action.po.create': 'WO: Raise purchase requests / POs',
  'wo.action.po.modify': 'WO: Edit / cancel POs',
  'sku': 'SKU Generation',
  'reserve': 'Reserve / De-reserve',
  'estimate': 'Estimates',
  'recipe.recipes': 'Product Designs',
  'recipe.materials': 'Materials',
  'recipe.costs': 'Cost Master',
  'recipe.sizing': 'Sizing Models',
  'recipe.configure': 'Configure & Quote',
  'recipe.quotations': 'Quotations',
  'users.manage': 'Manage Users & Roles',
};
const PERM_KEYS = Object.keys(PERM_LABELS);

const th = { padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { padding: '10px 16px', fontSize: 13 };
const tabBtn = (active) => ({
  padding: '10px 14px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer',
  color: active ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: active ? 500 : 400,
  borderBottom: active ? '2px solid var(--blue)' : '2px solid transparent',
});

export default function UsersRolesPage() {
  const [tab, setTab] = useState('users');
  const [roles, setRoles] = useState(null);
  const [users, setUsers] = useState(null);
  const [editRole, setEditRole] = useState(null); // {id?, name, perms:[]}
  const [confirmDel, setConfirmDel] = useState(null);
  const [busyUser, setBusyUser] = useState(null);

  function load() {
    axios.get('/api/access/roles').then(r => setRoles(r.data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load roles'));
    axios.get('/api/access/users').then(r => setUsers(r.data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load users'));
  }
  useEffect(load, []);

  async function saveRole() {
    const { id, name, perms } = editRole;
    if (!name.trim()) return toast.error('Role name is required');
    try {
      if (id) await axios.put(`/api/access/roles/${id}`, { name, perms });
      else await axios.post('/api/access/roles', { name, perms });
      toast.success('Role saved — changes apply on next reload (up to 1 min)');
      setEditRole(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not save role'); }
  }

  async function deleteRole(role) {
    try {
      await axios.delete(`/api/access/roles/${role.id}`);
      toast.success(`Role "${role.name}" deleted`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not delete role'); }
    finally { setConfirmDel(null); }
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Users &amp; Roles</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Only users holding a role's checked modules can open them · changes apply on reload (≤1 min)</div>
        </div>
        <div style={{ display: 'flex' }}>
          <button style={tabBtn(tab === 'users')} onClick={() => setTab('users')}>Users</button>
          <button style={tabBtn(tab === 'roles')} onClick={() => setTab('roles')}>Roles</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {roles && !roles.length && (
          <div style={{ marginBottom: 14, padding: '10px 14px', fontSize: 13, borderRadius: 'var(--radius-md)', background: 'var(--blue-light)', border: '1px solid var(--blue-border)', color: 'var(--text-primary)' }}>
            No roles defined yet — <b>everyone in this organization has full access</b>. Create the first role to start restricting modules.
          </div>
        )}

        {tab === 'roles' && (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setEditRole({ name: '', perms: [] })}
                style={{ padding: '6px 12px', fontSize: 13, fontWeight: 500, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
              >
                + New Role
              </button>
            </div>
            {!roles ? <div style={{ padding: 20, fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Role</th><th style={th}>Modules</th><th style={{ ...th, width: 48 }}></th></tr></thead>
                <tbody>
                  {roles.map(r => (
                    <tr key={r.id} className="list-row" style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setEditRole({ ...r })}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ ...td, color: 'var(--text-secondary)' }}>
                        {r.perms.length ? r.perms.map(p => PERM_LABELS[p] || p).join(', ') : <span style={{ color: 'var(--text-muted)' }}>No modules</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }} onClick={e => e.stopPropagation()}>
                        <RowMenu onEdit={() => setEditRole({ ...r })} onDelete={() => setConfirmDel(r)} />
                      </td>
                    </tr>
                  ))}
                  {!roles.length && <tr><td colSpan={3} style={{ ...td, color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>No roles yet.</td></tr>}
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
                    {!roles.length && <th style={th}>Roles</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)', opacity: busyUser === u.id ? 0.6 : 1 }}>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{u.name || u.email}</div>
                        {u.name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>}
                      </td>
                      {roles.map(r => (
                        <td key={r.id} style={{ ...td, textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={u.roleIds.includes(r.id)}
                            disabled={busyUser === u.id}
                            onChange={() => toggleUserRole(u, r.id)}
                          />
                        </td>
                      ))}
                      {!roles.length && <td style={{ ...td, color: 'var(--text-muted)' }}>Create a role first</td>}
                    </tr>
                  ))}
                  {!users.length && <tr><td colSpan={1 + Math.max(roles.length, 1)} style={{ ...td, color: 'var(--text-muted)', textAlign: 'center', padding: 28 }}>No users yet — users appear after they select this organization.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {editRole && (
        <Modal title={editRole.id ? `Edit role — ${editRole.name}` : 'New role'} onClose={() => setEditRole(null)} onSubmit={saveRole} width={460}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Role name</label>
            <input
              autoFocus value={editRole.name}
              onChange={e => setEditRole(v => ({ ...v, name: e.target.value }))}
              placeholder="e.g. Purchase, Sales, Production"
              style={{ height: 36, width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 10px', fontSize: 13 }}
            />
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Modules this role can access</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            {PERM_KEYS.map(k => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '5px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editRole.perms.includes(k)}
                  onChange={() => setEditRole(v => ({
                    ...v,
                    perms: v.perms.includes(k) ? v.perms.filter(p => p !== k) : [...v.perms, k],
                  }))}
                />
                {PERM_LABELS[k]}
              </label>
            ))}
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setEditRole(null)}>Cancel</ModalBtn>
            <ModalBtn variant="primary" onClick={saveRole}>{editRole.id ? 'Save' : 'Create role'}</ModalBtn>
          </ModalFooter>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmModal
          title={`Delete role "${confirmDel.name}"?`}
          confirmLabel="Delete role"
          onConfirm={() => deleteRole(confirmDel)}
          onClose={() => setConfirmDel(null)}
        >
          Users holding only this role will lose access to its modules.
        </ConfirmModal>
      )}
    </div>
  );
}
