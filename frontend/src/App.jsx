import { HashRouter, Routes, Route, Navigate, NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import toast from 'react-hot-toast';
import GlobalSearch from './components/GlobalSearch.jsx';
import TabBar from './components/TabBar.jsx';
import Popover from './components/Popover.jsx';
import Modal from './components/Modal.jsx';
import { useTheme } from './theme.js';
// Auth-flow pages stay eager — they render before anything else and are tiny.
import ZohoConnectPage from './pages/ZohoConnectPage.jsx';
import OrgSelectPage from './pages/OrgSelectPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
// Everything behind the shell is code-split per route.
const BooksLinkedValuesPage = lazy(() => import('./pages/BooksLinkedValuesPage.jsx'));
const SKUGeneratorPage = lazy(() => import('./pages/SKUGeneratorPage.jsx'));
const SKUItemsPage = lazy(() => import('./pages/SKUItemsPage.jsx'));
const SKUItemPage = lazy(() => import('./pages/SKUItemPage.jsx'));
const ImportItemsPage = lazy(() => import('./pages/ImportItemsPage.jsx'));
const ReservePage = lazy(() => import('./pages/ReservePage.jsx'));
const EstimatePage = lazy(() => import('./pages/EstimatePage.jsx'));
const WorkOrderListPage = lazy(() => import('./pages/WorkOrderListPage.jsx'));
const WorkOrderNewPage = lazy(() => import('./pages/WorkOrderNewPage.jsx'));
const WorkOrderPage = lazy(() => import('./pages/WorkOrderPage.jsx'));
const WorkOrderReportsPage = lazy(() => import('./pages/WorkOrderReportsPage.jsx'));
const WoDefectsPage = lazy(() => import('./pages/WoDefectsPage.jsx'));
const CompositeBomPage = lazy(() => import('./pages/CompositeBomPage.jsx'));
const WorkOrderPurchasePage = lazy(() => import('./pages/WorkOrderPurchasePage.jsx'));
const RecipeWizardPage = lazy(() => import('./pages/RecipeWizardPage.jsx'));
const RecipeQuotationsPage = lazy(() => import('./pages/RecipeQuotationsPage.jsx'));
const RecipeSnapshotPage = lazy(() => import('./pages/RecipeSnapshotPage.jsx'));
const RecipeMfgPage = lazy(() => import('./pages/RecipeMfgPage.jsx'));
const RecipeV2ListPage = lazy(() => import('./pages/RecipeV2ListPage.jsx'));
const RecipeV2NewPage = lazy(() => import('./pages/RecipeV2NewPage.jsx'));
const RecipeMaterialsPage = lazy(() => import('./pages/RecipeMaterialsPage.jsx'));
const RecipeCostMasterPage = lazy(() => import('./pages/RecipeCostMasterPage.jsx'));
const RecipeSizingModelsPage = lazy(() => import('./pages/RecipeSizingModelsPage.jsx'));
const RecipeSizingMaterialsPage = lazy(() => import('./pages/RecipeSizingMaterialsPage.jsx')); // CR-281
const RecipeGearedMotorsPage = lazy(() => import('./pages/RecipeGearedMotorsPage.jsx')); // CR-284
const RecipeComponentMapPage = lazy(() => import('./pages/RecipeComponentMapPage.jsx'));
// Master details pages (CR-233): each master file also exports its Detail page.
const MaterialDetail = lazy(() => import('./pages/RecipeMaterialsPage.jsx').then(m => ({ default: m.Detail })));
const CostElementDetail = lazy(() => import('./pages/RecipeCostMasterPage.jsx').then(m => ({ default: m.Detail })));
const SizingModelDetail = lazy(() => import('./pages/RecipeSizingModelsPage.jsx').then(m => ({ default: m.Detail })));
const SizingMaterialDetail = lazy(() => import('./pages/RecipeSizingMaterialsPage.jsx').then(m => ({ default: m.Detail })));
const GearedMotorDetail = lazy(() => import('./pages/RecipeGearedMotorsPage.jsx').then(m => ({ default: m.Detail })));
const ComponentMapDetail = lazy(() => import('./pages/RecipeComponentMapPage.jsx').then(m => ({ default: m.Detail })));
const ComponentEditPage = lazy(() => import('./pages/ComponentEditPage.jsx'));
// Settings hub: one chunk holding all settings pages (see SettingsLayout.jsx).
const SettingsLayout = lazy(() => import('./pages/SettingsLayout.jsx'));

// ---- per-user module permissions (Users & Roles) ----
// perms comes from /auth/me: ["*"] = super-admin or org with no roles yet.
const makeHasPerm = (perms) => (p) => perms.includes('*') || perms.includes(p);

export function NoAccess() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No access to this module</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Your roles don't include this module. Ask your administrator to grant it under Users &amp; Roles.
        </div>
      </div>
    </div>
  );
}

const PageLoading = () => (
  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
);

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
    color: 'var(--on-accent)', fontSize: 14, fontWeight: 600,
    letterSpacing: '-0.5px', flexShrink: 0,
  },
  nav: { padding: '10px', flex: 1 },
  navLabel: {
    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
    letterSpacing: '0.08em', textTransform: 'uppercase', padding: '10px 10px 5px',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
};

function navItemStyle({ isActive }, collapsed) {
  return {
    display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13,
    color: isActive ? 'var(--blue)' : 'var(--text-secondary)',
    background: isActive ? 'var(--blue-mid)' : 'transparent',
    fontWeight: isActive ? 500 : 400, marginBottom: 1, textDecoration: 'none',
    transition: 'background 0.12s, color 0.12s',
    whiteSpace: 'nowrap',
  };
}

const SHORTCUTS = [
  ['⌘K', 'Search items & properties (SKU pages)'],
  ['⌘,', 'Open Settings'],
  ['Esc', 'Close dialog or menu'],
];

function ShortcutsModal({ onClose }) {
  return (
    <Modal glass title="Keyboard shortcuts" width={380} onClose={onClose}>
      {SHORTCUTS.map(([k, label]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', minWidth: 36, textAlign: 'center' }}>{k}</kbd>
          {label}
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>On Windows and Linux use Ctrl in place of ⌘.</div>
    </Modal>
  );
}

const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']];

// Sidebar user card (CR-294, replaces the header account menu): avatar
// initials + name + role, opens a glass popover with Settings, shortcuts, the
// theme radio, helpdesk, switch-org and logout. ⌘, opens Settings from anywhere.
function UserCard({ user, collapsed, onLogout, onSwitchOrg }) {
  const [open, setOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [pref, setPref] = useTheme();
  const navigate = useNavigate();
  const ref = useRef(null);

  const name = user.name || user.email;
  const initials = (user.name || user.email.split('@')[0]).split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  // ponytail: role names aren't on /auth/me and /api/access is admin-gated; ["*"] = Admin role or unconfigured org
  const role = user.isAdmin || (user.perms ?? []).includes('*') ? 'Admin' : 'Member';

  useEffect(() => {
    const onKey = e => { if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); navigate('/settings'); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function logout() {
    setLoggingOut(true);
    await fetch(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    onLogout();
  }
  const go = fn => () => { setOpen(false); fn(); };
  const icon = d => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{d}</svg>;

  return (
    <>
      <button ref={ref} className="user-card" aria-expanded={open} aria-haspopup="menu" title={name}
        onClick={() => setOpen(o => !o)}
        style={collapsed ? { justifyContent: 'center', padding: 0 } : undefined}>
        <span className="avatar">{initials}</span>
        {!collapsed && (
          <>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{role}</span>
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </>
        )}
      </button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} width={collapsed ? 240 : undefined}>
        <button className="pop-item" role="menuitem" onClick={go(() => navigate('/settings'))}>
          {icon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h0a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>)}
          Settings <kbd>⌘,</kbd>
        </button>
        <button className="pop-item" role="menuitem" onClick={go(() => setShortcuts(true))}>
          {icon(<><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></>)}
          Keyboard shortcuts
        </button>
        <div className="pop-sep" />
        {THEMES.map(([v, label]) => (
          <button key={v} className="pop-item" role="menuitemradio" aria-checked={pref === v} onClick={() => setPref(v)}>
            {label}
            {pref === v && <svg className="check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
          </button>
        ))}
        <div className="pop-sep" />
        <button className="pop-item" role="menuitem" onClick={go(() => { window.location.href = 'mailto:dhiraj.s@octfis.com?subject=SKU%20Generator%20support'; })}>
          {icon(<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>)}
          Submit to Helpdesk
        </button>
        <button className="pop-item" role="menuitem" onClick={go(onSwitchOrg)}>
          {icon(<path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>)}
          Switch Organization
        </button>
        <button className="pop-item danger" role="menuitem" disabled={loggingOut} onClick={logout}>
          {icon(<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>)}
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </button>
      </Popover>
      {shortcuts && <ShortcutsModal onClose={() => setShortcuts(false)} />}
    </>
  );
}

// Left nav = one entry per add-on. Future add-ons (reserve, cheque-printing,
// label-printing) are new entries here; visibility is filtered by the org's
// enabled addons from /auth/me.
const NAV_LINKS = [
  { section: 'Add-ons' },
  { to: '/sku/items', match: '/sku', addon: 'sku-generator', perm: 'sku', label: 'SKU Generator', icon:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/></> },
  { to: '/wo', match: '/wo', addon: 'work-order', label: 'Order Management', icon: <><path d="M20 7h-3V4a1 1 0 00-1-1H8a1 1 0 00-1 1v3H4a1 1 0 00-1 1v11a1 1 0 001 1h16a1 1 0 001-1V8a1 1 0 00-1-1z"/><path d="M9 7V5h6v2"/><path d="M8 13h8M8 17h5"/></>,
    children: [
      { to: '/wo', label: 'Work Orders', perm: 'wo.orders' },
      { to: '/wo/purchase', label: 'Purchase Request', perm: 'wo.purchase' },
      { to: '/wo/defects', label: 'Store issues', perm: 'wo.defects' },
      { to: '/wo/reports', label: 'Reports', perm: 'wo.reports' },
    ] },
  { to: '/reserve', addon: 'reserve', perm: 'reserve', label: 'Reserve / De-reserve', icon: <><path d="M21 8V21H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></> },
  // Product-first order: build the recipe, then configure & quote it.
  { to: '/recipe/recipes', match: '/recipe', addon: 'recipe-engine', label: 'Product Configurator', icon: <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    children: [
      { to: '/recipe/recipes', label: 'Product Designs', perm: 'recipe.recipes' }, // the v2 form took over (v1 builder retired)
      { to: '/recipe/materials', label: 'Materials', perm: 'recipe.materials' },
      { to: '/recipe/costs', label: 'Cost Master', perm: 'recipe.costs' },
      { to: '/recipe/sizing', label: 'Sizing Models', perm: 'recipe.sizing' },
      { to: '/recipe/sizing-materials', label: 'Material Efficiency', perm: 'recipe.sizing' }, // CR-281
      { to: '/recipe/geared-motors', label: 'Geared Motors', perm: 'recipe.sizing' }, // CR-284
      { to: '/recipe/component-map', label: 'Components', perm: 'recipe.sizing' },
      // Configure & Quote (/recipe/configure) and Quotations (/recipe/quotations)
      // are deep-link only (CR-229): quoting happens in the CRM widgets.
    ] },
  // Users & Roles, org settings and add-on admin live in the Settings hub
  // (sidebar user card → Settings, or ⌘,).
];

// Industries, Properties and SKU Settings live in the Settings hub
// (/settings/sku/*); old /sku/* paths redirect there. "SKU Generator" is the
// combined items-list + generator page (/sku/generator is its "New" sub-page,
// kept as a route for permalinks).
const SKU_TABS = [
  { to: '/sku/items', label: 'SKU Generator' },
  { to: '/sku/books-items', label: 'Books Items' },
  { to: '/sku/bom', label: 'BOM' }, // moved from the Order Management submenu (CR-127 follow-up)
  { to: '/sku/import', label: 'Import' },
];

// The Order Management module: second-level nav lives in the sidebar submenu
// (Work Orders / Reports); Settings live in the hub (/settings/wo).
function WorkOrderLayout({ user, hasPerm }) {
  const g = (perm, el) => (hasPerm(perm) ? el : <NoAccess />);
  return (
    <>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route index element={g('wo.orders', <WorkOrderListPage />)} />
          <Route path="new" element={g('wo.orders', <WorkOrderNewPage />)} />
          <Route path=":id/edit" element={g('wo.orders', <WorkOrderNewPage />)} />
          <Route path="bom" element={<Navigate to="/sku/bom" replace />} />
          <Route path="purchase" element={g('wo.purchase', <WorkOrderPurchasePage />)} />
          <Route path="defects" element={g('wo.defects', <WoDefectsPage />)} />
          <Route path="reports" element={g('wo.reports', <WorkOrderReportsPage />)} />
          <Route path=":id" element={g('wo.orders', <WorkOrderPage user={user} />)} />
          <Route path="*" element={<Navigate to="/wo" replace />} />
        </Routes>
      </div>
    </>
  );
}

// Recipe Engine (CR-104): sales wizard + quotations + admin recipes/materials.
function RecipeLayout({ hasPerm }) {
  const g = (perm, el) => (hasPerm(perm) ? el : <NoAccess />);
  return (
    <div style={{ flex: 1, minHeight: 0 }}>
      <Routes>
        <Route path="configure" element={g('recipe.configure', <RecipeWizardPage />)} />
        <Route path="quotations" element={g('recipe.quotations', <RecipeQuotationsPage />)} />
        <Route path="quotations/:id" element={g('recipe.quotations', <RecipeSnapshotPage />)} />
        <Route path="quotations/:id/mfg" element={g('recipe.quotations', <RecipeMfgPage />)} />
        <Route path="recipes" element={g('recipe.recipes', <RecipeV2ListPage />)} />
        <Route path="recipes/new" element={g('recipe.recipes', <RecipeV2NewPage />)} />
        <Route path="recipes/:id/edit" element={g('recipe.recipes', <RecipeV2NewPage />)} />
        <Route path="recipes/:id" element={<Navigate to="edit" replace />} />
        <Route path="materials" element={g('recipe.materials', <RecipeMaterialsPage />)} />
        <Route path="materials/:id" element={g('recipe.materials', <MaterialDetail />)} />
        <Route path="costs" element={g('recipe.costs', <RecipeCostMasterPage />)} />
        <Route path="costs/:id" element={g('recipe.costs', <CostElementDetail />)} />
        <Route path="sizing" element={g('recipe.sizing', <RecipeSizingModelsPage />)} />
        <Route path="sizing/:id" element={g('recipe.sizing', <SizingModelDetail />)} />
        <Route path="sizing-materials" element={g('recipe.sizing', <RecipeSizingMaterialsPage />)} />
        <Route path="sizing-materials/:id" element={g('recipe.sizing', <SizingMaterialDetail />)} />
        <Route path="geared-motors" element={g('recipe.sizing', <RecipeGearedMotorsPage />)} />
        <Route path="geared-motors/:id" element={g('recipe.sizing', <GearedMotorDetail />)} />
        <Route path="component-map" element={g('recipe.sizing', <RecipeComponentMapPage />)} />
        <Route path="component-map/new" element={g('recipe.sizing', <ComponentEditPage />)} />
        <Route path="component-map/edit" element={g('recipe.sizing', <ComponentEditPage />)} />
        <Route path="component-map/:id" element={g('recipe.sizing', <ComponentMapDetail />)} />
        <Route path="*" element={<Navigate to="recipes" replace />} />
      </Routes>
    </div>
  );
}

function SkuLayout() {
  return (
    <>
      <TabBar tabs={SKU_TABS} right={<GlobalSearch />} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Routes>
          <Route path="generator" element={<SKUGeneratorPage />} />
          <Route path="items" element={<SKUItemsPage />} />
          <Route path="items/:id" element={<SKUItemPage />} />
          <Route path="import" element={<ImportItemsPage />} />
          <Route path="books-items" element={<BooksLinkedValuesPage />} />
          <Route path="bom" element={<CompositeBomPage />} />
          <Route path="*" element={<Navigate to="items" replace />} />
        </Routes>
      </div>
    </>
  );
}

function Sidebar({ user, addons, isAdmin, hasPerm, badges = {}, onLogout, onSwitchOrg }) {
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
          .filter(l => (!l.adminOnly || isAdmin)
            && (l.section || !l.addon || addons.includes(l.addon))
            // Per-user grants: a parent shows if any child passes; leaf entries
            // need their own perm (entries without one are always visible).
            && (l.section || (l.children
              ? l.children.some(c => !c.perm || hasPerm(c.perm))
              : !l.perm || hasPerm(l.perm))))
          .map((l, i) => {
            if (l.section) {
              return !collapsed && <div key={i} style={{ ...S.navLabel, marginTop: i ? 8 : 0 }}>{l.section}</div>;
            }
            const visibleChildren = l.children?.filter(c => !c.perm || hasPerm(c.perm));
            // Longest matching child wins the highlight (so /wo/reports lights
            // Reports, not Work Orders); collapsed sidebar shows the parent only.
            const activeChild = !collapsed && visibleChildren
              ? visibleChildren.filter(c => pathname.startsWith(c.to)).sort((a, b) => b.to.length - a.to.length)[0]
              : null;
            return (
              <div key={l.to}>
                {/* Active on the whole add-on's path prefix (submenu/pages live below it).
                    Parent lands on its first visible child so a partial grant
                    (e.g. Purchase only) never opens a denied page. */}
                <NavLink to={visibleChildren?.length ? visibleChildren[0].to : l.to} title={l.label}
                  style={() => navItemStyle({ isActive: pathname.startsWith(l.match || l.to) }, collapsed)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>{l.icon}</svg>
                  {!collapsed && l.label}
                </NavLink>
                {!collapsed && visibleChildren?.map(c => (
                  <NavLink key={c.to} to={c.to}
                    style={() => ({ ...navItemStyle({ isActive: c === activeChild }, false), padding: '6px 10px 6px 36px', fontSize: 12.5 })}>
                    {c.label}
                    {/* CR-203: pending store issues, fetched on navigation (no timer) */}
                    {badges[c.to] > 0 && (
                      <span style={{ marginLeft: 'auto', minWidth: 18, padding: '0 6px', borderRadius: 9, fontSize: 10.5, fontWeight: 700, textAlign: 'center', background: 'var(--danger)', color: 'var(--on-accent)' }}>
                        {badges[c.to]}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
      </nav>
      <UserCard user={user} collapsed={collapsed} onLogout={onLogout} onSwitchOrg={onSwitchOrg} />
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

  // Sidebar badges (CR-203): pending store issues for the Store Issue Manager.
  // Re-read on every navigation — no timer (see memory: no unnecessary polling).
  const [badges, setBadges] = useState({});
  useEffect(() => {
    const perms = user.perms ?? ['*'];
    const may = user.orgId && user.zohoConnected && (user.addons ?? []).includes('work-order')
      && (perms.includes('*') || perms.includes('wo.defects'));
    if (!may) return;
    // open = disposition pending or replacement still awaiting the manager (CR-244)
    fetch(`${API}/api/wo/defects?status=open`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : []))
      .then(list => setBadges({ '/wo/defects': Array.isArray(list) ? list.length : 0 }))
      .catch(() => {});
  }, [location.pathname, user.orgId]);

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

  const addons = user.addons ?? ['sku-generator']; // until /auth/me sends addons
  const hasPerm = makeHasPerm(user.perms ?? ['*']); // until /auth/me sends perms
  // Settings hub replaces the module nav with its own section panel (Zoho
  // Setup style, CR-229). No header bar (CR-294): the account menu is the
  // sidebar user card.
  const inSettings = location.pathname.startsWith('/settings');
  return (
    <>
      {!inSettings && <Sidebar user={user} addons={addons} isAdmin={user.isAdmin} hasPerm={hasPerm} badges={badges} onLogout={onLogout} onSwitchOrg={() => setSwitchOrg(true)} />}
      {/* key on orgId: switching org remounts the pages so they refetch the new
          org's catalog instead of showing the previous org's data. */}
      <div style={S.main} key={user.orgId}>
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<Navigate to="/sku/items" replace />} />
          <Route path="/sku/*" element={hasPerm('sku') ? <SkuLayout /> : <NoAccess />} />
          {/* Deep link from Zoho Books custom button: /app/#/reserve?soId=… ;
              backend 403s if the addon is off — the page shows a clear notice. */}
          <Route path="/wo/*" element={<WorkOrderLayout user={user} hasPerm={hasPerm} />} />
          <Route path="/recipe/*" element={<RecipeLayout hasPerm={hasPerm} />} />
          <Route path="/reserve" element={hasPerm('reserve') ? <ReservePage /> : <NoAccess />} />
          {/* Deep link from a CRM deal: /#/estimate?dealId=… — no sidebar entry */}
          <Route path="/estimate" element={hasPerm('estimate') ? <EstimatePage /> : <NoAccess />} />
          {/* Settings hub (user card / ⌘,): org, users & roles, SKU, work order. */}
          <Route path="/settings/*" element={<SettingsLayout user={user} addons={addons} hasPerm={hasPerm} onSwitchOrg={() => setSwitchOrg(true)} />} />
          {/* moved into the settings hub — static segments outrank /sku/* */}
          <Route path="/sku/industries" element={<Navigate to="/settings/sku/industries" replace />} />
          <Route path="/sku/industries/:id/properties" element={<MovedPropertiesRedirect />} />
          <Route path="/sku/properties" element={<Navigate to="/settings/sku/properties" replace />} />
          <Route path="/sku/settings" element={<Navigate to="/settings/sku/series" replace />} />
          <Route path="/wo/settings" element={<Navigate to="/settings/wo" replace />} />
          <Route path="/access/users" element={<Navigate to="/settings/users" replace />} />
          <Route path="/admin/addons" element={<Navigate to="/settings/org" replace />} />
          {/* legacy paths (old bookmarks, OAuth redirects) */}
          <Route path="/sku-generator" element={<LegacyGeneratorRedirect />} />
          <Route path="/sku-items" element={<Navigate to="/sku/items" replace />} />
          <Route path="/admin/industries" element={<Navigate to="/settings/sku/industries" replace />} />
          <Route path="/admin/properties" element={<Navigate to="/settings/sku/properties" replace />} />
          <Route path="/admin/industries/:id/properties" element={<MovedPropertiesRedirect />} />
          <Route path="*" element={<Navigate to="/sku/items" replace />} />
        </Routes>
        </Suspense>
      </div>
    </>
  );
}

function MovedPropertiesRedirect() {
  const { id } = useParams();
  return <Navigate to={`/settings/sku/industries/${id}/properties`} replace />;
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
      .then(u => {
        // Successful login re-arms the CRM deep-link auto-redirect for the
        // next session expiry.
        if (u) sessionStorage.removeItem('autoAuthTried');
        setUser(u);
      })
      .catch(() => setUser(null));
  }

  useEffect(() => {
    // Zoho redirects back to /app/?code=… (the registered redirect URI is the
    // SPA). Hand the code to the backend for the secure exchange, then scrub it
    // from the URL and load the now-authenticated user.
    const cbParams = new URLSearchParams(window.location.search);
    const code = cbParams.get('code');
    if (code) {
      let widgetToken = null; // session token for the CRM widget handoff
      let widgetErr = null; // why there is no token, forwarded so the widget can show it
      fetch(`${API}/auth/zoho/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // location = the Zoho DC that issued the code (multi-DC); the backend
        // must exchange it against that DC's accounts server.
        body: JSON.stringify({ code, location: cbParams.get('location') }),
      })
        .then(async r => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            widgetErr = data.error || `exchange failed (${r.status})`;
            setAuthError(data.error || 'Zoho sign-in failed.');
            return false;
          }
          if (data.token) widgetToken = data.token;
          else widgetErr = 'exchange ok but no session token in response';
          if (data.needsConsent) {
            // Zoho didn't issue a refresh token (grant exists but we have no
            // stored token) — re-run OAuth with the consent screen forced.
            window.location.replace(`${API}/auth/zoho?consent=1`);
            return true; // navigating away; skip the reload below
          }
          return false;
        })
        .catch(() => {
          widgetErr = 'network error during exchange';
          setAuthError('Network error during Zoho sign-in.');
          return false;
        })
        .then(navigating => {
          if (navigating) return;
          // CRM widget auth: the widget opens this OAuth flow in an iframe or
          // popup named 'sku-auth' (window.name survives cross-origin
          // redirects). Third-party cookies never reach the widget, so hand it
          // the session token — but only after an origin-verified handshake:
          // announce readiness, wait for the widget's hello, and send the
          // token solely to a trusted Zoho-hosted origin. Never broadcast it.
          if (window.name === 'sku-auth') {
            const TRUSTED = /(\.zappsusercontent\.(com|in|eu)|\.zohousercontent\.(com|in|eu)|\.zohopublic\.(com|in|eu)|\.zoho\.(com|in|eu|com\.au|jp)|\.catalystserverless\.com)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
            window.addEventListener('message', (e) => {
              if (!e.data || e.data.type !== 'sku-auth-hello' || !TRUSTED.test(e.origin)) return;
              e.source.postMessage({ type: 'sku-auth-token', token: widgetToken, error: widgetErr }, e.origin);
              setTimeout(() => window.close(), 100); // no-op inside the silent iframe
            });
            (window.opener || window.parent).postMessage({ type: 'sku-auth-ready' }, '*');
            return;
          }
          // The OAuth roundtrip loses the hash (redirect_uri is the SPA root);
          // restore the deep link stashed before the auto-redirect.
          const returnTo = sessionStorage.getItem('returnTo');
          if (returnTo) { sessionStorage.removeItem('returnTo'); window.location.hash = returnTo; }
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

  // Seamless login for CRM deep links (deal/quote buttons): skip the login page
  // and bounce silently through Zoho OAuth — no password when the user is
  // already signed into Zoho (they just came from CRM). Once-per-tab guard so a
  // cancelled/failed OAuth falls back to the login page instead of looping.
  if (!user) {
    const hashQ = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const preQ = new URLSearchParams(window.location.search);
    const crmDeepLink = ['dealId', 'quoteId'].some(k => hashQ.get(k) || preQ.get(k));
    // Top-level only: inside a Books Web Tab the redirect would load
    // accounts.zoho in the frame, which Zoho refuses (CR-152).
    if (crmDeepLink && window.self === window.top && !sessionStorage.getItem('autoAuthTried')) {
      sessionStorage.setItem('autoAuthTried', '1');
      sessionStorage.setItem('returnTo', window.location.hash || `#/estimate?${preQ}`);
      window.location.replace(`${API}/auth/zoho`);
      return null;
    }
    return <LoginPage onAuthed={loadUser} error={errorParam} />;
  }

  return (
    // HashRouter: Catalyst web hosting has no SPA fallback, so a hard refresh on
    // a BrowserRouter path (/app/sku-items) 404s. Hash paths never hit the server.
    <HashRouter>
      <AppShell user={user} refreshUser={loadUser} onLogout={() => setUser(null)} />
    </HashRouter>
  );
}
