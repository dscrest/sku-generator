import AddonAdminPage from './AddonAdminPage.jsx';

// Org Settings (settings hub): org profile + switch, Zoho Books connection,
// and (OCTFIS super-admin only) the add-on entitlement matrix. Everything
// comes from the /auth/me payload already held by the shell — no fetches.
const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)', marginBottom: 20,
};
const cardHead = {
  padding: '12px 16px', borderBottom: '1px solid var(--border)',
  fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
};
const row = { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px', borderBottom: '1px solid var(--border)' };
const rowLabel = { width: 160, fontSize: 13, color: 'var(--text-secondary)', flexShrink: 0 };
const rowValue = { fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const btn = {
  padding: '7px 14px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
  cursor: 'pointer',
};

export default function OrgSettingsPage({ user, onSwitchOrg }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 760 }}>
        <div style={card}>
          <div style={cardHead}>Organization</div>
          <div style={row}>
            <span style={rowLabel}>Organization</span>
            <span style={{ ...rowValue, fontWeight: 600 }}>{user.orgName || '—'}</span>
          </div>
          <div style={row}>
            <span style={rowLabel}>Organization ID</span>
            <span style={{ ...rowValue, fontFamily: 'var(--font-mono)' }}>{user.orgId || '—'}</span>
          </div>
          <div style={{ ...row, borderBottom: 'none' }}>
            <span style={rowLabel}>Signed in as</span>
            <span style={rowValue}>{user.name ? `${user.name} · ${user.email}` : user.email}</span>
            <button style={{ ...btn, marginLeft: 'auto' }} onClick={onSwitchOrg}>Switch Organization</button>
          </div>
        </div>

        <div style={card}>
          <div style={cardHead}>Zoho Books connection</div>
          <div style={{ ...row, borderBottom: 'none' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: user.zohoConnected ? '#16a34a' : '#dc2626',
            }} />
            <span style={rowValue}>
              {user.zohoConnected ? `Connected · ${user.orgName || 'Zoho Books'}` : 'Not connected'}
            </span>
            <button
              style={{ ...btn, marginLeft: 'auto' }}
              onClick={() => { window.location.href = '/server/skuapi/auth/zoho?consent=1'; }}
            >
              {user.zohoConnected ? 'Reconnect' : 'Connect'}
            </button>
          </div>
        </div>

        {user.isAdmin && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <AddonAdminPage />
          </div>
        )}
      </div>
    </div>
  );
}
