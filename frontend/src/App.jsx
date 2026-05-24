import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import IndustriesPage from './pages/IndustriesPage.jsx';
import PropertyManagerPage from './pages/PropertyManagerPage.jsx';
import SKUGeneratorPage from './pages/SKUGeneratorPage.jsx';
import SKUItemsPage from './pages/SKUItemsPage.jsx';

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
    width: 32, height: 32,
    background: 'var(--blue)',
    borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 14, fontWeight: 600,
    letterSpacing: '-0.5px', flexShrink: 0,
  },
  nav: { padding: '10px', flex: 1 },
  navLabel: {
    fontSize: 10, fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '10px 10px 5px',
  },
  footer: { padding: '14px 16px', borderTop: '1px solid var(--border)' },
  footerLabel: {
    fontSize: 10, fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.06em', textTransform: 'uppercase',
    marginBottom: 8,
  },
  tagPills: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  tagPill: {
    display: 'inline-flex', alignItems: 'center',
    background: 'var(--blue-light)',
    color: 'var(--blue)',
    border: '1px solid var(--blue-border)',
    borderRadius: 20, fontSize: 10, fontWeight: 500,
    padding: '2px 8px', fontFamily: 'var(--font-mono)',
  },
  main: {
    flex: 1, display: 'flex', flexDirection: 'column',
    overflow: 'hidden', minWidth: 0,
  },
};

function navItemStyle({ isActive }) {
  return {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer', fontSize: 13,
    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
    background: isActive ? 'var(--blue-light)' : 'transparent',
    fontWeight: isActive ? 500 : 400,
    marginBottom: 1, textDecoration: 'none',
    transition: 'background 0.12s, color 0.12s',
  };
}

function Sidebar() {
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
        <div style={S.footerLabel}>SKU Field Tags</div>
        <div style={S.tagPills}>
          <span style={S.tagPill}>##Property##</span>
          <span style={S.tagPill}>##Caption##</span>
          <span style={S.tagPill}>##Unit##</span>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Sidebar />
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
    </BrowserRouter>
  );
}
