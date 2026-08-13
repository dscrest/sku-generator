import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';

// Read-only tracking grid for property values that were also created as standalone
// Zoho Books items (CR-026). Managed on the property manager; this is just the
// "where are they" view.
const thStyle = {
  padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
};
const tdStyle = { padding: '10px 16px' };

export default function BooksLinkedValuesPage() {
  const [rows, setRows] = useState([]);
  const [sortCol, setSortCol] = useState('industryName');
  const [sortDir, setSortDir] = useState('asc');
  const [fIndustry, setFIndustry] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/property-values/linked');
      setRows(data);
    } catch { toast.error('Failed to load Books-linked values'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter(r => !fIndustry || r.industryName === fIndustry);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] ?? '';
    const bv = b[sortCol] ?? '';
    const v = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });
  const { pageRows, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const SortArrow = ({ col }) => (
    <span style={{ marginLeft: 4, opacity: 0.5, fontSize: 10 }}>
      {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Books-linked values</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Property values that also exist as standalone Zoho Books items</div>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onRefresh={load}
            right={<FilterSelect label="industries" value={fIndustry} onChange={setFIndustry} options={distinct(rows, 'industryName')} />}
          />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle} onClick={() => toggleSort('industryName')}>Industry <SortArrow col="industryName" /></th>
                <th style={thStyle} onClick={() => toggleSort('propertyCaption')}>Property <SortArrow col="propertyCaption" /></th>
                <th style={thStyle} onClick={() => toggleSort('displayValue')}>Value <SortArrow col="displayValue" /></th>
                <th style={thStyle} onClick={() => toggleSort('sku')}>Code <SortArrow col="sku" /></th>
                <th style={thStyle} onClick={() => toggleSort('zohoItemId')}>Books item id <SortArrow col="zohoItemId" /></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No values are linked to Books items yet.</td></tr>
              )}
              {pageRows.map(r => (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={tdStyle}>{r.industryName || '—'}</td>
                  <td style={tdStyle}>
                    <a
                      onClick={() => r.propertyId && navigate(`/sku/industries/${r.industryId || ''}/properties`)}
                      style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'none' }}
                      title="Open in property manager"
                    >{r.propertyCaption || '—'} ›</a>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{r.displayValue}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.sku}</td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.zohoItemId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <GridFooter pager={pager} />
    </div>
  );
}
