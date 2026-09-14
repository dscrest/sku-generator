import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import GridFooter, { usePager, FilterSelect, distinct } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';

// Read-only tracking grid for property values that were also created as standalone
// Zoho Books items (CR-026). Managed on the property manager; this is just the
// "where are they" view.

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

  // Columns need navigate for the property link, so they're built in-render.
  const COLUMNS = [
    { key: 'industryName', label: 'Industry', lock: true, sortKey: 'industryName', render: r => r.industryName || '—' },
    {
      key: 'propertyCaption', label: 'Property', sortKey: 'propertyCaption', render: r => (
        <a
          onClick={() => r.propertyId && navigate(`/sku/industries/${r.industryId || ''}/properties`)}
          style={{ color: 'var(--blue)', cursor: 'pointer', textDecoration: 'none' }}
          title="Open in property manager"
        >{r.propertyCaption || '—'} ›</a>
      ),
    },
    { key: 'displayValue', label: 'Value', sortKey: 'displayValue', render: r => <span style={{ fontWeight: 500 }}>{r.displayValue}</span> },
    { key: 'sku', label: 'Code', sortKey: 'sku', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.sku}</span> },
    { key: 'zohoItemId', label: 'Books item id', sortKey: 'zohoItemId', render: r => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{r.zohoItemId}</span> },
  ];
  const { cols, chooser } = useGridColumns('sku.books', COLUMNS);

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
            right={
              <div style={{ display: 'flex', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <FilterSelect label="industries" value={fIndustry} onChange={setFIndustry} options={distinct(rows, 'industryName')} />
              </div>
            }
          />
          <DataTable
            cols={cols} rows={pageRows}
            sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort}
          />
          {pageRows.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No values are linked to Books items yet.</div>
          )}
        </div>
      </div>

      <GridFooter pager={pager} />
    </div>
  );
}
