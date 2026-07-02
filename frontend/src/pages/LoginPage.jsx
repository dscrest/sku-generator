import React, { useState } from 'react';

const API = '/server/skuapi';

export default function LoginPage({ onAuthed, error }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const body = mode === 'register' ? { email, password, name } : { email, password };
      const r = await fetch(`${API}/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) onAuthed();
      else setMsg(data.error || 'Something went wrong.');
    } catch {
      setMsg('Network error.');
    }
    setBusy(false);
  }

  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)',
        padding: '44px 48px', width: 420, maxWidth: '90vw',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: 48, height: 48, background: 'var(--blue)', borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 18,
        }}>SK</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>SKU Studio</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
          {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
        </div>

        {(error || msg) && (
          <div style={{
            width: '100%', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: 12, color: '#dc2626',
          }}>
            {msg || safeDecode(error)}
          </div>
        )}

        <form onSubmit={submit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {mode === 'register' && (
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" style={inp} />
          )}
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" required style={inp} />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password"
            placeholder={mode === 'register' ? 'Password (min 8 chars)' : 'Password'} required style={inp} />
          <button type="submit" disabled={busy} style={{
            padding: '11px 0', borderRadius: 'var(--radius-md)', background: 'var(--blue)', color: '#fff',
            border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14,
            opacity: busy ? 0.7 : 1, marginTop: 2,
          }}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setMsg(''); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>
          {mode === 'login' ? "No account? Register" : 'Have an account? Sign in'}
        </button>

        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <a href={`${API}/auth/zoho`} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '12px 20px', background: '#e84c3d', color: '#fff', borderRadius: 'var(--radius-md)',
          fontWeight: 600, fontSize: 14, textDecoration: 'none', boxShadow: '0 2px 8px rgba(232,76,61,0.30)',
        }}>
          <svg width="18" height="18" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="rgba(255,255,255,0.18)"/>
            <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" fontSize="16" fontWeight="bold" fill="white">Z</text></svg>
          Sign in with Zoho
        </a>
      </div>
    </div>
  );
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

const inp = {
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '10px 12px', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};
