import React, { useState, useEffect } from 'react';

export default function OrgSelectPage({ onSelected }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    fetch('/server/skuapi/auth/zoho/orgs')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        if (list.length === 0) setNeedsUpgrade(true);
        setOrgs(list);
        setLoading(false);
      })
      .catch(() => { setNeedsUpgrade(true); setLoading(false); });
  }, []);

  async function selectOrg(org) {
    setSaving(org.organization_id);
    try {
      const r = await fetch('/server/skuapi/auth/zoho/select-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: org.organization_id, orgName: org.name }),
      });
      if (r.ok) onSelected({ orgId: org.organization_id, orgName: org.name });
    } catch { /**/ }
    setSaving(null);
  }

  async function handleReconnect() {
    setReconnecting(true);
    await fetch('/server/skuapi/auth/zoho/disconnect', { method: 'POST' }).catch(() => {});
    window.location.href = '/server/skuapi/auth/zoho';
  }

  if (loading) {
    return <Centered><p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading organizations…</p></Centered>;
  }

  if (orgs.length > 0) {
    return (
      <Centered>
        <Card>
          <Header />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
            Choose which Zoho Books organization to sync with.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {orgs.map(org => (
              <OrgButton key={org.organization_id} org={org} saving={saving} onSelect={selectOrg} />
            ))}
          </div>
        </Card>
      </Centered>
    );
  }

  // Needs scope upgrade
  return (
    <Centered>
      <Card>
        <Header />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Your app needs updated permissions to auto-detect your organization.
        </p>

        {/* Step-by-step instructions */}
        <div style={{
          background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)',
          padding: '16px 18px', marginBottom: 20,
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            One-time setup (2 minutes)
          </div>
          {[
            { n: 1, text: 'Go to api-console.zoho.com', href: 'https://api-console.zoho.com', linkText: 'Open Zoho API Console →' },
            { n: 2, text: 'Click your app "DhirajSKU" → go to the Client Secret tab' },
            { n: 3, text: 'Under Scopes, add: ZohoBooks.fullaccess.all → Save' },
            { n: 4, text: 'Come back here and click Reconnect below' },
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: 12, marginBottom: step.n < 4 ? 10 : 0 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', background: 'var(--accent)',
                color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{step.n}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', paddingTop: 2 }}>
                {step.text}
                {step.href && (
                  <a href={step.href} target="_blank" rel="noreferrer" style={{
                    display: 'block', color: 'var(--accent)', fontSize: 12, marginTop: 2, fontWeight: 500,
                  }}>{step.linkText}</a>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleReconnect}
          disabled={reconnecting}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 20px', background: reconnecting ? '#999' : '#e84c3d', color: '#fff',
            borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14,
            border: 'none', cursor: reconnecting ? 'not-allowed' : 'pointer',
            boxShadow: reconnecting ? 'none' : '0 2px 8px rgba(232,76,61,0.25)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          {reconnecting ? 'Redirecting to Zoho…' : 'Reconnect with Zoho Books'}
        </button>
      </Card>
    </Centered>
  );
}

function OrgButton({ org, saving, onSelect }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => onSelect(org)}
      disabled={!!saving}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        border: `1px solid ${hover && !saving ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-md)',
        background: hover && !saving ? 'var(--accent-soft)' : 'var(--bg)',
        cursor: saving ? 'not-allowed' : 'pointer', textAlign: 'left',
        transition: 'all 0.12s',
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{org.name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {org.country || ''}
        </div>
      </div>
      <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
        {saving === org.organization_id ? 'Selecting…' : 'Select →'}
      </div>
    </button>
  );
}

function Header() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: '#e84c3d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 13, fontWeight: 700,
      }}>Z</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Select Organization</div>
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
      padding: '40px 44px', width: 480, maxWidth: '90vw',
    }}>{children}</div>
  );
}

function Centered({ children }) {
  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</div>
  );
}
