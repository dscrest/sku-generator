import { HashRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import IndustriesPage from './pages/IndustriesPage.jsx';
import PropertyManagerPage from './pages/PropertyManagerPage.jsx';
import SKUGeneratorPage from './pages/SKUGeneratorPage.jsx';
import SKUItemsPage from './pages/SKUItemsPage.jsx';
import ZohoConnectPage from './pages/ZohoConnectPage.jsx';
import OrgSelectPage from './pages/OrgSelectPage.jsx';
import LoginPage from './pages/LoginPage.jsx';

const API = '/server/skuapi';

const S = {
  sidebar: {
    background: 'var(--bg-card)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    height: '100vh', overflowY: 'auto', overflowX: 'hidden',
    transition: 'width 0.15s ease, min-width 0.15s ease',
    flexShrink: 0,
  },
  logoWrap: {
    padding: '18px 18px 14px',
    borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  logoIcon: {
    width: 32, height: 32, background: 'var(--blue)', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 14, fontWeight: 600,
    letterSpacing: '-0.5px', flexShrink: 0,
  },
  nav: { padding: '10px', flex: 1 },
  navLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 10px 5px',
  },
  footer: { padding: '14px 16px', borderTop: '1px solid var(--border)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
};

function navItemStyle({ isActive }, collapsed) {
  return {
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13,
    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
    background: isActive ? 'var(--blue-light)' : 'transparent',
    fontWeight: isActive ? 500 : 400, marginBottom: 1, textDecoration: 'none',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap',
  };
}

function OrgBadge({ orgName, orgId, onLogout }) {
  const [hover, setHover] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    onLogout();
  }

  return (
    <div>
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ position: 'relative' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          borderRadius: 'var(--radius-md)', background: hover ? 'var(--bg-secondary)' : 'transparent',
          cursor: 'default', transition: 'background 0.12s',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0,
            boxShadow: '0 0 0 2px #dcfce7',
          }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{orgName || 'Zoho Books'}</div>
            <div style={{
              fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{orgId ? `ID: ${orgId}` : 'Connected'}</div>
          </div>
          <div style={{
            width: 22, height: 22, borderRadius: 4, background: '#e84c3d', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>Z</div>
        </div>
        {hover && orgId && (
          <div style={{
            position: 'absolute', bottom: '110%', left: 0, right: 0,
            background: '#0f172a', color: '#fff', borderRadius: 'var(--radius-md)',
            padding: '8px 10px', fontSize: 11, zIndex: 100, boxShadow: 'var(--shadow-lg)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{orgName}</div>
            <div style={{ fontFamily: 'var(--font-mono)', opacity: 0.7, fontSize: 10 }}>Org ID: {orgId}</div>
          </div>
        )}
      </div>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        style={{
          width: '100%', marginTop: 6, padding: '7px 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: 'transparent', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', cursor: loggingOut ? 'not-allowed' : 'pointer',
          fontSize: 12, color: 'var(--text-muted)', transition: 'all 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#e84c3d'; e.currentTarget.style.color = '#e84c3d'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
        {loggingOut ? 'Logging out…' : 'Logout'}
      </button>
    </div>
  );
}

const NAV_LINKS = [
  { section: 'Generate' },
  { to: '/sku-generator', label: 'SKU Generator', icon: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/></> },
  { to: '/sku-items', label: 'SKU Items', icon: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/> },
  { section: 'Admin' },
  { to: '/admin/industries', label: 'Industries', end: true, icon: <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></> },
  { to: '/admin/properties', label: 'Properties', icon: <><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></> },
];

function Sidebar({ zoho, onLogout }) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  // Logo file is dropped by the user at frontend/public/octfis-logo.png; until
  // then (or if it 404s) fall back to the original "SK" mark.
  const [logoOk, setLogoOk] = useState(true);

  function toggle() {
    setCollapsed(c => {
      localStorage.setItem('sidebarCollapsed', c ? '' : '1');
      return !c;
    });
  }

  const width = collapsed ? 64 : 230;
  const toggleBtn = (
    <button
      onClick={toggle}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        width: 24, height: 24, flexShrink: 0, marginLeft: collapsed ? 0 : 'auto',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-muted)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={collapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
      </svg>
    </button>
  );
  return (
    <aside style={{ ...S.sidebar, width, minWidth: width }}>
      <div style={{ ...S.logoWrap, flexDirection: collapsed ? 'column' : 'row', alignItems: 'center', padding: collapsed ? '14px 8px' : S.logoWrap.padding, gap: collapsed ? 8 : 10 }}>
        {logoOk ? (
          <img src="octfis-logo.png" alt="OCTFIS Techno LLP" onError={() => setLogoOk(false)}
            style={{ height: collapsed ? 20 : 28, flexShrink: 0, objectFit: 'contain', maxWidth: collapsed ? 48 : 66 }} />
        ) : (
          <div style={S.logoIcon}>SK</div>
        )}
        {/* no tagline: the logo itself carries "OCTFIS TECHNO LLP"; footer has the powered-by line */}
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            SKU Studio
          </div>
        )}
        {toggleBtn}
      </div>
      <nav style={S.nav}>
        {NAV_LINKS.map((l, i) => l.section ? (
          !collapsed && <div key={i} style={{ ...S.navLabel, marginTop: i ? 8 : 0 }}>{l.section}</div>
        ) : (
          <NavLink key={l.to} to={l.to} end={l.end} title={l.label} style={s => navItemStyle(s, collapsed)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>{l.icon}</svg>
            {!collapsed && l.label}
          </NavLink>
        ))}
      </nav>
      {!collapsed && <div style={S.footer}>
        {(zoho?.connected && zoho?.orgId ? (
          <OrgBadge orgName={zoho.orgName} orgId={zoho.orgId} onLogout={onLogout} />
        ) : (
          <>
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8,
            }}>SKU Field Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {['##Property##', '##Caption##', '##Unit##'].map(tag => (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'var(--blue-light)', color: 'var(--blue)',
                  border: '1px solid var(--blue-border)', borderRadius: 20,
                  fontSize: 10, fontWeight: 500, padding: '2px 8px', fontFamily: 'var(--font-mono)',
                }}>{tag}</span>
              ))}
            </div>
          </>
        ))}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 10, whiteSpace: 'nowrap' }}>
          Powered by OCTFIS Techno LLP
        </div>
      </div>}
    </aside>
  );
}

function AppShell({ user, refreshUser, onLogout }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const zohoParam = params.get('zoho');
  const errorParam = params.get('error');

  // After the OAuth redirect (?zoho=connected|select_org) re-pull the user so
  // zohoConnected / orgId reflect the just-linked account.
  useEffect(() => {
    if (zohoParam) refreshUser();
  }, [zohoParam]);

  if (!user.zohoConnected) {
    return <ZohoConnectPage error={errorParam} />;
  }

  if (!user.orgId) {
    return <OrgSelectPage onSelected={refreshUser} />;
  }

  const zoho = { connected: true, orgId: user.orgId, orgName: user.orgName };
  return (
    <>
      <Sidebar zoho={zoho} onLogout={onLogout} />
      <div style={S.main}>
        <Routes>
          <Route path="/" element={<Navigate to="/sku-generator" replace />} />
          <Route path="/admin/industries" element={<IndustriesPage />} />
          <Route path="/admin/industries/:id/properties" element={<PropertyManagerPage />} />
          <Route path="/admin/properties" element={<IndustriesPage />} />
          <Route path="/sku-generator" element={<SKUGeneratorPage />} />
          <Route path="/sku-items" element={<SKUItemsPage />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null); // null = not authenticated
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  function loadUser() {
    return fetch(`${API}/auth/me`)
      .then(r => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }

  useEffect(() => {
    // Zoho redirects back to /app/?code=… (the registered redirect URI is the
    // SPA). Hand the code to the backend for the secure exchange, then scrub it
    // from the URL and load the now-authenticated user.
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      fetch(`${API}/auth/zoho/exchange`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
      })
        .then(async r => { if (!r.ok) setAuthError((await r.json().catch(() => ({}))).error || 'Zoho sign-in failed.'); })
        .catch(() => setAuthError('Network error during Zoho sign-in.'))
        .finally(() => {
          window.history.replaceState({}, '', window.location.pathname + window.location.hash);
          loadUser().finally(() => setLoading(false));
        });
    } else {
      loadUser().finally(() => setLoading(false));
    }
  }, []);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', width: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
      </div>
    );
  }

  const errorParam = authError || new URLSearchParams(window.location.hash.split('?')[1] || '').get('error');
  if (!user) return <LoginPage onAuthed={loadUser} error={errorParam} />;

  return (
    // HashRouter: Catalyst web hosting has no SPA fallback, so a hard refresh on
    // a BrowserRouter path (/app/sku-items) 404s. Hash paths never hit the server.
    <HashRouter>
      <AppShell user={user} refreshUser={loadUser} onLogout={() => setUser(null)} />
    </HashRouter>
  );
}
