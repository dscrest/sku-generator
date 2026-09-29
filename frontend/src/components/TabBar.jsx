import { NavLink } from 'react-router-dom';

// Route-based tab strip (SKU Generator tabs, settings sections). `right` is an
// optional slot at the end of the strip (the SKU tabs put GlobalSearch there).
export default function TabBar({ tabs, right }) {
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
      {right}
    </div>
  );
}
