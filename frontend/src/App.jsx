import { HashRouter, Routes, Route, Navigate, NavLink, useLocation, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import GlobalSearch from './components/GlobalSearch.jsx';
import IndustriesPage from './pages/IndustriesPage.jsx';
import PropertyManagerPage from './pages/PropertyManagerPage.jsx';
import PropertiesPage from './pages/PropertiesPage.jsx';
import SKUGeneratorPage from './pages/SKUGeneratorPage.jsx';
import SKUItemsPage from './pages/SKUItemsPage.jsx';
import ZohoConnectPage from './pages/ZohoConnectPage.jsx';
import OrgSelectPage from './pages/OrgSelectPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AddonAdminPage from './pages/AddonAdminPage.jsx';
import ReservePage from './pages/ReservePage.jsx';
import WorkOrderListPage from './pages/WorkOrderListPage.jsx';
import WorkOrderPage from './pages/WorkOrderPage.jsx';
import WorkOrderSettingsPage from './pages/WorkOrderSettingsPage.jsx';
import WorkOrderReportsPage from './pages/WorkOrderReportsPage.jsx';

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
  // Same 44px as GridFooter so the two bottom bars share one line across the app.
  footer: { height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', borderTop: '1px solid var(--border)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
  header: {
    height: 52, flexShrink: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'flex-end', gap: 8, padding: '0 20px',
    background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
  },
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

// Account menu (top-right): org avatar + name + chevron → dropdown with org
// details, switch-org and logout.
function HeaderBar({ zoho, onLogout, onSwitchOrg }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const orgName = zoho.orgName || 'Zoho Books';
  const initials = orgName.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  async function handleLogout() {
    setLoggingOut(true);
    await fetch(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    onLogout();
  }

  const menuItem = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '8px 12px', background: 'transparent', border: 'none',
    borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13,
    color: 'var(--text-secondary)', textAlign: 'left',
  };

  return (
    <header style={S.header}>
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
            background: open ? 'var(--bg-secondary)' : 'transparent', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
          onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: '50%', background: 'var(--blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.02em', flexShrink: 0,
          }}>{initials}</span>
          <span style={{
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', maxWidth: 200,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{orgName}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 248, zIndex: 100,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 6,
            }}>
              <div style={{ padding: '10px 12px 8px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {orgName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Zoho Books · <span style={{ fontFamily: 'var(--font-mono)' }}>{zoho.orgId}</span>
                  </span>
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px 6px' }} />
              <button
                style={menuItem}
                onClick={() => { setOpen(false); toast.success('Submitted to helpdesk'); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
                Submit to helpdesk
              </button>
              <button
                style={menuItem}
                onClick={() => { setOpen(false); onSwitchOrg(); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Switch organization
              </button>
              <button
                style={{ ...menuItem, cursor: loggingOut ? 'wait' : 'pointer' }}
                disabled={loggingOut}
                onClick={handleLogout}
                onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                </svg>
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// Left nav = one entry per add-on. Future add-ons (reserve, cheque-printing,
// label-printing) are new entries here; visibility is filtered by the org's
// enabled addons from /auth/me.
const NAV_LINKS = [
  { section: 'Add-ons' },
  { to: '/sku/industries', match: '/sku', addon: 'sku-generator', label: 'SKU Generator', icon:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/></> },
  { to: '/wo', match: '/wo', addon: 'work-order', label: 'Work Order', icon: <><path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/><path d="M9 7V5h6v2"/><path d="M8 13h8M8 17h5"/></> },
  { to: '/reserve', addon: 'reserve', label: 'Reserve / De-reserve', icon: <><path d="M21 8V21H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></> },
  // OCTFIS super-admin only (user.isAdmin)
  { section: 'Admin', adminOnly: true },
  { to: '/admin/addons', adminOnly: true, label: 'Customer add-ons', icon: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></> },
];

// Tab order follows the setup flow: create Industries → their Properties →
// generate SKUs. "SKU Generator" is the combined items-list + generator page
// (/sku/generator is its "New" sub-page, kept as a route for permalinks).
const SKU_TABS = [
  { to: '/sku/industries', label: 'Industries', end: true },
  { to: '/sku/properties', label: 'Properties' },
  { to: '/sku/items', label: 'SKU Generator' },
];

function TabBar({ tabs }) {
  return (
    <div style={{
      display: 'flex', gap: 2, padding: '0 20px', flexShrink: 0,
      background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
    }}>
      {tabs.map(t => (
        <NavLink key={t.to} to={t.to} end={t.end} style={({ isActive }) => ({
          padding: '10px 14px', fontSize: 13, textDecoration: 'none',
          color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
          fontWeight: isActive ? 500 : 400,
          borderBottom: isActive ? '2px solid var(--blue)' : '2px solid transparent',
        })}>
          {t.label}
        </NavLink>
      ))}
      <GlobalSearch />
    </div>
  );
}

const WO_TABS = [
  { to: '/wo', label: 'Work Orders', end: true },
  { to: '/wo/reports', label: 'Reports' },
  { to: '/wo/settings', label: 'Settings' },
];

// One nav entry for the whole Work Order module; the tab bar is its only header.
function WorkOrderLayout() {
  return (
    <>
      <TabBar tabs={WO_TABS} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route index element={<WorkOrderListPage />} />
          <Route path="reports" element={<WorkOrderReportsPage />} />
          <Route path="settings" element={<WorkOrderSettingsPage />} />
          <Route path=":id" element={<WorkOrderPage />} />
          <Route path="*" element={<Navigate to="/wo" replace />} />
        </Routes>
      </div>
    </>
  );
}

function SkuLayout() {
  return (
    <>
      <TabBar tabs={SKU_TABS} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="generator" element={<SKUGeneratorPage />} />
          <Route path="items" element={<SKUItemsPage />} />
          <Route path="industries" element={<IndustriesPage />} />
          <Route path="industries/:id/properties" element={<PropertyManagerPage />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="*" element={<Navigate to="industries" replace />} />
        </Routes>
      </div>
    </>
  );
}

function Sidebar({ addons, isAdmin }) {
  const { pathname } = useLocation();
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
        {NAV_LINKS
          .filter(l => (!l.adminOnly || isAdmin) && (l.section || !l.addon || addons.includes(l.addon)))
          .map((l, i) => l.section ? (
            !collapsed && <div key={i} style={{ ...S.navLabel, marginTop: i ? 8 : 0 }}>{l.section}</div>
          ) : (
            // Active on the whole add-on's path prefix (tabs live below it)
            <NavLink key={l.to} to={l.to} title={l.label}
              style={() => navItemStyle({ isActive: pathname.startsWith(l.match || l.to) }, collapsed)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>{l.icon}</svg>
              {!collapsed && l.label}
            </NavLink>
          ))}
      </nav>
      {!collapsed && <div style={S.footer}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
  const [switchOrg, setSwitchOrg] = useState(false);

  // After the OAuth redirect (?zoho=connected|select_org) re-pull the user so
  // zohoConnected / orgId reflect the just-linked account.
  useEffect(() => {
    if (zohoParam) refreshUser();
  }, [zohoParam]);

  if (!user.zohoConnected) {
    return <ZohoConnectPage error={errorParam} />;
  }

  // Org picker: forced on first login (no org yet), or on demand via "Switch
  // organization". Cancel is only offered once an org is already selected.
  if (!user.orgId || switchOrg) {
    return (
      <OrgSelectPage
        onSelected={() => { setSwitchOrg(false); refreshUser(); }}
        onCancel={user.orgId ? () => setSwitchOrg(false) : null}
      />
    );
  }

  const zoho = { connected: true, orgId: user.orgId, orgName: user.orgName };
  const addons = user.addons ?? ['sku-generator']; // until /auth/me sends addons
  return (
    <>
      <Sidebar addons={addons} isAdmin={user.isAdmin} />
      {/* key on orgId: switching org remounts the pages so they refetch the new
          org's catalog instead of showing the previous org's data. */}
      <div style={S.main} key={user.orgId}>
        <HeaderBar zoho={zoho} onLogout={onLogout} onSwitchOrg={() => setSwitchOrg(true)} />
        <Routes>
          <Route path="/" element={<Navigate to="/sku/industries" replace />} />
          <Route path="/sku/*" element={<SkuLayout />} />
          {/* Deep link from Zoho Books custom button: /app/#/reserve?soId=… ;
              backend 403s if the addon is off — the page shows a clear notice. */}
          <Route path="/wo/*" element={<WorkOrderLayout />} />
          <Route path="/reserve" element={<ReservePage />} />
          {user.isAdmin && <Route path="/admin/addons" element={<AddonAdminPage />} />}
          {/* legacy paths (old bookmarks, OAuth redirects) */}
          <Route path="/sku-generator" element={<LegacyGeneratorRedirect />} />
          <Route path="/sku-items" element={<Navigate to="/sku/items" replace />} />
          <Route path="/admin/industries" element={<Navigate to="/sku/industries" replace />} />
          <Route path="/admin/properties" element={<Navigate to="/sku/properties" replace />} />
          <Route path="/admin/industries/:id/properties" element={<LegacyPropertiesRedirect />} />
          <Route path="*" element={<Navigate to="/sku/industries" replace />} />
        </Routes>
      </div>
    </>
  );
}

function LegacyPropertiesRedirect() {
  const { id } = useParams();
  return <Navigate to={`/sku/industries/${id}/properties`} replace />;
}

// Keeps ?industry=…&p<id>=… from old copied permalinks
function LegacyGeneratorRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/sku/generator${search}`} replace />;
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
    const cbParams = new URLSearchParams(window.location.search);
    const code = cbParams.get('code');
    if (code) {
      fetch(`${API}/auth/zoho/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // location = the Zoho DC that issued the code (multi-DC); the backend
        // must exchange it against that DC's accounts server.
        body: JSON.stringify({ code, location: cbParams.get('location') }),
      })
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { setAuthError(data.error || 'Zoho sign-in failed.'); return false; }
          if (data.needsConsent) {
            // Zoho didn't issue a refresh token (grant exists but we have no
            // stored token) — re-run OAuth with the consent screen forced.
            window.location.replace(`${API}/auth/zoho?consent=1`);
            return true; // navigating away; skip the reload below
          }
          return false;
        })
        .catch(() => { setAuthError('Network error during Zoho sign-in.'); return false; })
        .then(navigating => {
          if (navigating) return;
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
