import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import IndustriesPage from './pages/IndustriesPage.jsx';
import PropertyManagerPage from './pages/PropertyManagerPage.jsx';
import SKUGeneratorPage from './pages/SKUGeneratorPage.jsx';
import SKUItemsPage from './pages/SKUItemsPage.jsx';
import ZohoConnectPage from './pages/ZohoConnectPage.jsx';
import OrgSelectPage from './pages/OrgSelectPage.jsx';

const API = '/server/skuapi';

const S = {
  sidebar: {
    width: 230, minWidth: 230,
    background: 'var(--bg-card)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    height: '100vh', overflowY: 'auto',
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

function navItemStyle({ isActive }) {
  return {
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
    borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13,
    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
    background: isActive ? 'var(--blue-light)' : 'transparent',
    fontWeight: isActive ? 500 : 400, marginBottom: 1, textDecoration: 'none',
    transition: 'background 0.12s, color 0.12s',
  };
}

function OrgBadge({ orgName, orgId, onLogout }) {
  const [hover, setHover] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch(`${API}/auth/zoho/disconnect`, { method: 'POST' }).catch(() => {});
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
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Connected</div>
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

function Sidebar({ zoho, onLogout }) {
  return (
    <aside style={S.sidebar}>
      <div style={S.logoWrap}>
        <div style={S.logoIcon}>SK</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2 }}>SKU Studio</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Industry Co.</div>
        </div>
      </div>
      <nav style={S.nav}>
        <div style={S.navLabel}>Generate</div>
        <NavLink to="/sku-generator" style={navItemStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/>
          </svg>
          SKU Generator
        </NavLink>
        <NavLink to="/sku-items" style={navItemStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          SKU Items
        </NavLink>
        <div style={{ ...S.navLabel, marginTop: 8 }}>Admin</div>
        <NavLink to="/admin/industries" style={navItemStyle} end>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
            <polyline points="9,22 9,12 15,12 15,22"/>
          </svg>
          Industries
        </NavLink>
        <NavLink to="/admin/properties" style={navItemStyle}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>
          </svg>
          Properties
        </NavLink>
      </nav>
      <div style={S.footer}>
        {zoho?.connected && zoho?.orgId ? (
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
        )}
      </div>
    </aside>
  );
}

function AppShell({ zoho, setZoho }) {
  function handleLogout() {
    setZoho({ connected: false, orgId: null, orgName: null });
  }
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const zohoParam = params.get('zoho');
  const errorParam = params.get('error');

  useEffect(() => {
    if (zohoParam) {
      fetch(`${API}/auth/zoho/status`)
        .then(r => r.json())
        .then(setZoho)
        .catch(() => {});
    }
  }, [zohoParam]);

  if (!zoho.connected) {
    return <ZohoConnectPage error={errorParam} />;
  }

  if (!zoho.orgId) {
    return <OrgSelectPage onSelected={({ orgId, orgName }) => setZoho(z => ({ ...z, orgId, orgName }))} />;
  }

  return (
    <>
      <Sidebar zoho={zoho} onLogout={handleLogout} />
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
  const [zoho, setZoho] = useState({ connected: false, orgId: null, orgName: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/auth/zoho/status`)
      .then(r => r.json())
      .then(data => { setZoho(data); setLoading(false); })
      .catch(() => setLoading(false));
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

  return (
    <BrowserRouter basename={import.meta.env.PROD ? '/app' : undefined}>
      <AppShell zoho={zoho} setZoho={setZoho} />
    </BrowserRouter>
  );
}
