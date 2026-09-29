import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, Outlet, useNavigate } from 'react-router-dom';
// Dynamic import from App.jsx breaks the static cycle (App lazy-loads this file).
import { NoAccess } from '../App.jsx';
import TabBar from '../components/TabBar.jsx';
import OrgSettingsPage from './OrgSettingsPage.jsx';
import UsersRolesPage from './UsersRolesPage.jsx';
import SkuSettingsPage from './SkuSettingsPage.jsx';
import ConfiguratorSettingsPage from './ConfiguratorSettingsPage.jsx';
import IndustriesPage from './IndustriesPage.jsx';
import PropertiesPage from './PropertiesPage.jsx';
import PropertyManagerPage from './PropertyManagerPage.jsx';
import WorkOrderSettingsPage from './WorkOrderSettingsPage.jsx';
import EstimateTermsSettingsPage from './EstimateTermsSettingsPage.jsx';

// Settings hub (Zoho Setup style, CR-229): the main sidebar is hidden here;
// this left panel lists the sections in groups, a section opens with tabs
// across the top. Sections filter by the same addon/perm rules as the main
// Sidebar; tabs are searchable alongside sections.
const SECTIONS = [
  { section: 'General' },
  {
    to: '/settings/org', label: 'Org Settings',
    icon: <><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" /></>,
  },
  {
    to: '/settings/users', label: 'Users & Roles', perm: 'users.manage',
    icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
  },
  { section: 'Add-ons' },
  {
    to: '/settings/sku', label: 'SKU Settings', addon: 'sku-generator', perm: 'sku',
    icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17h7M17 14v7" /></>,
    tabs: [
      { to: '/settings/sku/series', label: 'Series' },
      { to: '/settings/sku/items', label: 'Item defaults' },
      { to: '/settings/sku/books', label: 'Zoho Books' },
      { to: '/settings/sku/industries', label: 'Industries' },
      { to: '/settings/sku/properties', label: 'Properties' },
    ],
  },
  {
    // Price ladder + design-rate toggle (CR-229). perm 'sku': the page reads and
    // writes /api/sku-items/settings, which the sku grant gates.
    to: '/settings/configurator', label: 'Product Configurator', addon: 'recipe-engine', perm: 'sku',
    icon: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  },
  {
    to: '/settings/wo', label: 'Work Order', addon: 'work-order', perm: 'wo.settings',
    icon: <><path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" /><path d="M9 7V5h6v2" /><path d="M8 13h8M8 17h5" /></>,
  },
  {
    // Quote-print T&C templates (CR-192). No addon: the estimate page has none either.
    to: '/settings/quote-terms', label: 'Quote T&C', perm: 'estimate',
    icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
  },
];

// SKU Settings section: tab strip + the active tab's page.
function SkuSection() {
  const tabs = SECTIONS.find(s => s.to === '/settings/sku').tabs;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TabBar tabs={tabs} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}

export default function SettingsLayout({ user, addons, hasPerm, onSwitchOrg }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const visible = SECTIONS.filter(s => s.section
    || ((!s.addon || addons.includes(s.addon)) && (!s.perm || hasPerm(s.perm))));
  const pages = visible.filter(s => !s.section);

  // Search matches section labels and tab labels into one flat link list.
  const query = q.trim().toLowerCase();
  const matches = query
    ? pages.flatMap(s => [
        ...(s.label.toLowerCase().includes(query) ? [{ to: s.to, label: s.label }] : []),
        ...(s.tabs || []).filter(t => t.label.toLowerCase().includes(query))
          .map(t => ({ to: t.to, label: t.label, sub: s.label })),
      ])
    : null;

  const allowed = (s) => pages.some(v => v.to === s);
  const gate = (path, el) => (allowed(path) ? el : <NoAccess />);

  const itemStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
    padding: '9px 16px', fontSize: 13, border: 'none', cursor: 'pointer', textDecoration: 'none',
    background: isActive ? 'var(--blue-light, #eef2ff)' : 'transparent',
    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
    fontWeight: isActive ? 600 : 400,
    borderLeft: isActive ? '3px solid var(--blue)' : '3px solid transparent',
  });

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* settings sidebar */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-card)', padding: '14px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 10px' }}>
          <button
            onClick={() => navigate('/')} title="Back to app"
            style={{
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Settings</span>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Search settings…"
            style={{
              width: '100%', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
            }}
          />
        </div>
        {matches ? (
          matches.length ? matches.map(m => (
            <Link key={m.to} to={m.to} onClick={() => setQ('')} style={itemStyle(false)}>
              <span style={{ flex: 1 }}>{m.label}</span>
              {m.sub && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.sub}</span>}
            </Link>
          )) : (
            <div style={{ padding: '8px 16px', fontSize: 12.5, color: 'var(--text-muted)' }}>No matching settings</div>
          )
        ) : (
          visible.map((s, i) => s.section ? (
            // A group header only when it has at least one visible section under it.
            visible[i + 1] && !visible[i + 1].section && (
              <div key={s.section} style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em',
                textTransform: 'uppercase', padding: i ? '14px 16px 5px' : '4px 16px 5px',
              }}>{s.section}</div>
            )
          ) : (
            <NavLink key={s.to} to={s.to} style={({ isActive }) => itemStyle(isActive)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>{s.icon}</svg>
              <span style={{ flex: 1 }}>{s.label}</span>
            </NavLink>
          ))
        )}
      </div>

      {/* content pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Routes>
          <Route index element={<Navigate to={(pages[0]?.to || '/settings/org').replace('/settings/', '')} replace />} />
          <Route path="org" element={<OrgSettingsPage user={user} onSwitchOrg={onSwitchOrg} />} />
          <Route path="users" element={gate('/settings/users', <UsersRolesPage />)} />
          <Route path="sku" element={gate('/settings/sku', <SkuSection />)}>
            <Route index element={<Navigate to="series" replace />} />
            {/* static segments outrank :tab */}
            <Route path="industries" element={<IndustriesPage />} />
            <Route path="industries/:id/properties" element={<PropertyManagerPage />} />
            <Route path="properties" element={<PropertiesPage />} />
            <Route path=":tab" element={<SkuSettingsPage />} />
          </Route>
          <Route path="configurator" element={gate('/settings/configurator', <ConfiguratorSettingsPage />)} />
          <Route path="wo" element={gate('/settings/wo', <WorkOrderSettingsPage />)} />
          <Route path="quote-terms" element={gate('/settings/quote-terms', <EstimateTermsSettingsPage />)} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
    </div>
  );
}
