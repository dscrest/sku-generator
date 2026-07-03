import { useState, useEffect } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import RowDeleteButton from '../components/RowDeleteButton.jsx';

const ADDON_LABELS = {
  'sku-generator': 'SKU Generator',
  'reserve': 'Reserve / De-reserve',
  'cheque-printing': 'Cheque Printing',
  'label-printing': 'QR / Label Printing',
};

function Toggle({ on, busy, onChange }) {
  return (
    <button
      onClick={onChange}
      disabled={busy}
      style={{
        width: 34, height: 19, borderRadius: 10, border: 'none', padding: 2, margin: '0 auto',
        cursor: busy ? 'wait' : 'pointer', flexShrink: 0,
        background: on ? 'var(--blue)' : 'var(--border)', transition: 'background 0.15s',
        display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center',
      }}
    >
      <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)' }} />
    </button>
  );
}

export default function AddonAdminPage() {
  const [orgs, setOrgs] = useState(null);
  const [busy, setBusy] = useState(null); // `${orgId}:${key}` while saving

  function load() {
    axios.get('/admin/orgs')
      .then(({ data }) => setOrgs(data))
      .catch(err => toast.error(err.response?.data?.error || 'Failed to load organizations'));
  }
  useEffect(load, []);

  async function toggle(org, key) {
    const next = !org.addons[key];
    setBusy(`${org.orgId}:${key}`);
    try {
      await axios.post('/admin/org-addons', { orgId: org.orgId, addonKey: key, enabled: next });
      setOrgs(os => os.map(o => (o.orgId === org.orgId ? { ...o, addons: { ...o.addons, [key]: next } } : o)));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setBusy(null);
    }
  }

  async function deleteOrg(org) {
    const typed = prompt(
      `This permanently deletes ALL data for "${org.orgName || org.orgId}" — industries, properties, SKU items, reservations, entitlements — and disconnects its users from Zoho. It cannot be undone.\n\nType the org ID (${org.orgId}) to confirm:`,
    );
    if (typed === null) return;
    if (typed.trim() !== org.orgId) return toast.error('Org ID did not match — nothing was deleted');
    try {
      await axios.delete(`/admin/orgs/${org.orgId}`);
      toast.success(`Organization ${org.orgName || org.orgId} deleted`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete organization');
    }
  }

  const keys = orgs?.length ? Object.keys(orgs[0].addons) : Object.keys(ADDON_LABELS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Add-on entitlements</span>
        <button onClick={load} title="Refresh" style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12,
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
          cursor: 'pointer', color: 'var(--text-muted)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Refresh
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {!orgs ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
        ) : !orgs.length ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No customer organizations yet — orgs appear here after a user connects Zoho.</div>
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>Organization</th>
                  {keys.map(k => (
                    <th key={k} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {ADDON_LABELS[k] || k}
                    </th>
                  ))}
                  <th style={{ width: 48, background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {orgs.map(org => (
                  <tr key={org.orgId} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{org.orgName || '(unnamed)'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{org.orgId}</div>
                    </td>
                    {keys.map(k => (
                      <td key={k} style={{ padding: '10px 16px', textAlign: 'center' }}>
                        <Toggle on={org.addons[k]} busy={busy === `${org.orgId}:${k}`} onChange={() => toggle(org, k)} />
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px' }}>
                      <RowDeleteButton onDelete={() => deleteOrg(org)} title={`Delete ${org.orgName || org.orgId} and all its data`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
