import { useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom';
// Dynamic import from App.jsx breaks the static cycle (App lazy-loads this file).
import { NoAccess } from '../App.jsx';
import OrgSettingsPage from './OrgSettingsPage.jsx';
import UsersRolesPage from './UsersRolesPage.jsx';
import SkuSettingsPage from './SkuSettingsPage.jsx';
import IndustriesPage from './IndustriesPage.jsx';
import PropertiesPage from './PropertiesPage.jsx';
import PropertyManagerPage from './PropertyManagerPage.jsx';
import WorkOrderSettingsPage from './WorkOrderSettingsPage.jsx';

// Settings hub (Zoho-style): left sidebar of sections + content pane.
// Sections filter by the same addon/perm rules as the main Sidebar; card
// sub-pages (SKU Settings) are searchable alongside sections.
const SECTIONS = [
  {
    to: '/settings/org', label: 'Org Settings',
    icon: <><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" /><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" /></>,
  },
  {
    to: '/settings/users', label: 'Users & Roles', perm: 'users.manage',
    icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>,
  },
  {
    to: '/settings/sku', label: 'SKU Settings', addon: 'sku-generator', perm: 'sku',
    icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17h7M17 14v7" /></>,
    cards: [
      { to: '/settings/sku/series', title: 'SKU Series & Defaults', desc: 'Numerical series, default item type (Trading / Manufacturing), Books auto-push' },
      { to: '/settings/sku/industries', title: 'Industries', desc: 'Industries and their property sets' },
      { to: '/settings/sku/properties', title: 'Properties', desc: 'All properties across industries' },
    ],
  },
  {
    to: '/settings/wo', label: 'Work Order', addon: 'work-order', perm: 'wo.settings',
    icon: <><path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z" /><path d="M9 7V5h6v2" /><path d="M8 13h8M8 17h5" /></>,
  },
];

function SkuSettingsHub() {
  const cards = SECTIONS.find(s => s.to === '/settings/sku').cards;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SKU Generator</div>
      <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 4px' }}>SKU Settings</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>Series numbering, item defaults, industries and their properties.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, maxWidth: 960 }}>
        {cards.map(c => (
          <Link key={c.to} to={c.to} className="settings-card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '16px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', textDecoration: 'none',
          }}>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>{c.desc}</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SettingsLayout({ user, addons, hasPerm, onSwitchOrg }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  const visible = SECTIONS.filter(s =>
    (!s.addon || addons.includes(s.addon)) && (!s.perm || hasPerm(s.perm)));

  // Search matches section labels and card titles into one flat link list.
  const query = q.trim().toLowerCase();
  const matches = query
    ? visible.flatMap(s => [
        ...(s.label.toLowerCase().includes(query) ? [{ to: s.to, label: s.label }] : []),
        ...(s.cards || []).filter(c => c.title.toLowerCase().includes(query))
          .map(c => ({ to: c.to, label: c.title, sub: s.label })),
      ])
    : null;

  const allowed = (s) => visible.some(v => v.to === s);
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
            onClick={() => navigate('/sku/items')} title="Back to app"
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
          visible.map(s => (
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
          <Route index element={<Navigate to={(visible[0]?.to || '/settings/org').replace('/settings/', '')} replace />} />
          <Route path="org" element={<OrgSettingsPage user={user} onSwitchOrg={onSwitchOrg} />} />
          <Route path="users" element={gate('/settings/users', <UsersRolesPage />)} />
          <Route path="sku" element={gate('/settings/sku', <SkuSettingsHub />)} />
          <Route path="sku/series" element={gate('/settings/sku', <SkuSettingsPage />)} />
          <Route path="sku/industries" element={gate('/settings/sku', <IndustriesPage />)} />
          <Route path="sku/industries/:id/properties" element={gate('/settings/sku', <PropertyManagerPage />)} />
          <Route path="sku/properties" element={gate('/settings/sku', <PropertiesPage />)} />
          <Route path="wo" element={gate('/settings/wo', <WorkOrderSettingsPage />)} />
          <Route path="*" element={<Navigate to="." replace />} />
        </Routes>
      </div>
    </div>
  );
}
