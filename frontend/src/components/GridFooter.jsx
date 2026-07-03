import { useState } from 'react';

/**
 * The standard record-grid controls (see memory: record-grid-pattern):
 * - usePager: client-side pagination, default 25/page
 * - <GridFooter>: pinned page-level footer — record count, page-size select
 *   (10/25/50/100), First/Prev/Next/Last
 * - <FilterSelect>: column filter fed by the distinct values present in the grid
 */
export function usePager(rows, defaultSize = 25) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultSize);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(curPage * pageSize, (curPage + 1) * pageSize);
  return { pageRows, pager: { total, curPage, pageCount, pageSize, setPage, setPageSize } };
}

function PageBtn({ title, disabled, onClick, path }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', opacity: disabled ? 0.35 : 1,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </button>
  );
}

// Render OUTSIDE the scroll area (page-level) so it never moves or resizes.
export default function GridFooter({ pager }) {
  const { total, curPage, pageCount, pageSize, setPage, setPageSize } = pager;
  return (
    // 44px height matches the sidebar footer so both bottom bars sit on one line
    <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)', flexShrink: 0 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {total === 0 ? 'No records' : `Showing ${curPage * pageSize + 1}–${Math.min((curPage + 1) * pageSize, total)} of ${total} record${total !== 1 ? 's' : ''}`}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          value={pageSize}
          onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          title="Records per page"
          style={{ padding: '4px 8px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}
        >
          {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
        <PageBtn title="First page" disabled={curPage === 0} onClick={() => setPage(0)} path="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
        <PageBtn title="Previous page" disabled={curPage === 0} onClick={() => setPage(p => Math.max(0, p - 1))} path="M15 18l-6-6 6-6" />
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 4px' }}>{curPage + 1} / {pageCount}</span>
        <PageBtn title="Next page" disabled={curPage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} path="M9 18l6-6-6-6" />
        <PageBtn title="Last page" disabled={curPage >= pageCount - 1} onClick={() => setPage(pageCount - 1)} path="M13 17l5-5-5-5M6 17l5-5-5-5" />
      </div>
    </div>
  );
}

// Column filter whose options are the distinct values present in the data.
export function FilterSelect({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      title={`Filter by ${label}`}
      style={{
        padding: '6px 10px', fontSize: 12, border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
        color: value ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', maxWidth: 200,
      }}
    >
      <option value="">All {label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// Distinct non-empty values of a field, sorted — feeds FilterSelect options.
export function distinct(rows, key) {
  return [...new Set(rows.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== ''))].sort();
}
