import React, { useState } from 'react';

export default function ZohoConnectPage({ error }) {
  return (
    <div style={{
      minHeight: '100vh', width: '100%',
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        padding: '48px 52px',
        width: 420, maxWidth: '90vw',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: 48, height: 48, background: 'var(--blue)', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 20,
        }}>SK</div>

        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          SKU Studio
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 36, textAlign: 'center' }}>
          Connect your Zoho Books account to start syncing SKU items.
        </div>

        {error && (
          <div style={{
            width: '100%', marginBottom: 20,
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)', padding: '10px 14px',
            fontSize: 12, color: '#dc2626',
          }}>
            {decodeURIComponent(error)}
          </div>
        )}

        <a
          href="http://localhost:3001/auth/zoho"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '12px 20px', background: '#e84c3d', color: '#fff',
            borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: 14, textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(232,76,61,0.30)', transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#c0392b'}
          onMouseLeave={e => e.currentTarget.style.background = '#e84c3d'}
        >
          <ZohoIcon />
          Login with Zoho Books
        </a>

        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0',
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <ManualConnect />
      </div>
    </div>
  );
}

function ManualConnect() {
  const [open, setOpen] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    if (!orgId.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('http://localhost:3001/auth/zoho/select-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: orgId.trim() }),
      });
      if (r.ok) window.location.href = '/';
      else setMsg('Failed — check Org ID and ensure Zoho OAuth is completed first.');
    } catch {
      setMsg('Network error.');
    }
    setSaving(false);
  }

  return (
    <div style={{ width: '100%' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none',
          cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
          textAlign: 'center', padding: '4px 0',
        }}
      >
        {open ? 'Hide manual setup ▲' : 'Enter credentials manually ▼'}
      </button>

      {open && (
        <form onSubmit={handleSave} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Use this only if OAuth is already completed and you need to set the Org ID manually.
          </div>
          <input
            value={orgId}
            onChange={e => setOrgId(e.target.value)}
            placeholder="Zoho Organization ID"
            style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              padding: '9px 12px', fontSize: 13, outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />
          {msg && <div style={{ fontSize: 12, color: '#dc2626' }}>{msg}</div>}
          <button type="submit" disabled={saving} style={{
            padding: '9px 0', borderRadius: 'var(--radius-md)',
            background: 'var(--accent)', color: '#fff',
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 13, opacity: saving ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Save Org ID'}
          </button>
        </form>
      )}
    </div>
  );
}

function ZohoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.18)"/>
      <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
        fontSize="16" fontWeight="bold" fill="white" fontFamily="Arial,sans-serif">Z</text>
    </svg>
  );
}
