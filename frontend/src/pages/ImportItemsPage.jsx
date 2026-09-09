import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { readXlsxFile, matrixFromText } from '../components/BomTab';

// Bulk item import (CR-092): upload a sheet → per-row Name/SKU/Description via the
// same engine as the manual generator → local SKUItem rows. Push to Books stays
// manual (the "Push all unsynced" button on the SKU Generator page).

const T = {
  accent: '#4f46e5', ink: '#0f172a', ink3: '#64748b', border: '#e2e8f0',
  borderStrong: '#cbd5e1', ok: '#16a34a', okSoft: '#f0fdf4', err: '#be123c',
  errSoft: '#fef2f2', bg: '#f8fafc', bgElev: '#fff', bgSubtle: '#f1f5f9',
  mono: 'var(--font-mono)', sans: 'var(--font)',
};
const ctrl = {
  height: 34, boxSizing: 'border-box', padding: '0 10px',
  border: `1.5px solid ${T.borderStrong}`, borderRadius: 6, fontSize: 13,
  color: T.ink, background: T.bgElev, outline: 'none', fontFamily: T.sans,
};
const btn = (bg) => ({
  height: 34, padding: '0 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: '#fff', background: bg, fontFamily: T.sans,
});

// A parsed sheet matrix → row objects keyed by the header row. Blank rows dropped.
function matrixToRows(matrix) {
  if (!matrix || matrix.length < 2) return [];
  const headers = matrix[0].map((h) => String(h || '').trim());
  return matrix
    .slice(1)
    .filter((r) => r.some((c) => String(c || '').trim() !== ''))
    .map((r) => {
      const o = {};
      headers.forEach((h, j) => { if (h) o[h] = r[j]; });
      return o;
    });
}

function csvDownload(filename, headers) {
  const csv = headers.map((h) => (/[",\n]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h)).join(',') + '\n';
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ImportItemsPage() {
  const [industries, setIndustries] = useState([]);
  const [industryId, setIndustryId] = useState('');
  const [properties, setProperties] = useState([]);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    axios.get('/api/industries')
      .then((r) => setIndustries(r.data || []))
      .catch(() => toast.error('Failed to load product types'));
  }, []);

  useEffect(() => {
    setProperties([]); setRows([]); setResult(null); setFileName('');
    if (!industryId) return;
    axios.get(`/api/industries/${industryId}/properties`)
      .then((r) => setProperties((r.data || []).filter((p) => p.activeInSku !== false)
        .sort((a, b) => (a.skuPosition ?? 0) - (b.skuPosition ?? 0))))
      .catch(() => toast.error('Failed to load properties'));
  }, [industryId]);

  const templateHeaders = [...properties.map((p) => p.caption), 'Item Type'];

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setResult(null);
    try {
      const matrix = /\.(xlsx|xls)$/i.test(file.name)
        ? await readXlsxFile(file)
        : matrixFromText(await file.text());
      const parsed = matrixToRows(matrix);
      if (!parsed.length) { toast.error('No data rows found in the sheet'); setRows([]); return; }
      setRows(parsed);
      toast.success(`${parsed.length} row${parsed.length === 1 ? '' : 's'} ready`);
    } catch (err) {
      toast.error('Could not read the file');
      setRows([]);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function runImport() {
    if (!industryId || !rows.length) return;
    setBusy(true); setResult(null);
    try {
      const { data } = await axios.post('/api/sku-items/import', { industryId, rows });
      setResult(data);
      toast[data.failed ? 'success' : 'success'](`${data.succeeded} created, ${data.failed} failed`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function downloadResults() {
    if (!result) return;
    const head = 'row,status,sku,name,error';
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = result.results.map((r) => [r.row, r.status, r.sku || '', r.name || '', r.error || ''].map(esc).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([head + '\n' + body], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'import-results.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto', fontFamily: T.sans, color: T.ink }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Bulk Item Import</h2>
      <p style={{ margin: '0 0 20px', color: T.ink3, fontSize: 13 }}>
        Upload a sheet of items for one product type. Each row is run through the same
        Name / SKU / Description rules as the generator. Items are created here; push
        them to Zoho Books afterwards from the <Link to="/sku/items">SKU Generator</Link> page.
      </p>

      {/* Step 1: product type */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
        1 · Product type
      </label>
      <select value={industryId} onChange={(e) => setIndustryId(e.target.value)} style={{ ...ctrl, minWidth: 260 }}>
        <option value="">Select a product type…</option>
        {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>

      {industryId && (
        <>
          {/* Step 2: template */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
              2 · Template
            </label>
            <button
              onClick={() => csvDownload(`import-template.csv`, templateHeaders)}
              disabled={!properties.length}
              style={{ ...btn(T.bgSubtle), color: T.ink, border: `1.5px solid ${T.borderStrong}` }}>
              ⬇ Download template ({templateHeaders.length} columns)
            </button>
            <div style={{ marginTop: 8, fontSize: 12, color: T.ink3, fontFamily: T.mono }}>
              {templateHeaders.join('  ·  ')}
            </div>
          </div>

          {/* Step 3: upload */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
              3 · Upload filled sheet
            </label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={onFile} style={{ fontSize: 13 }} />
            {fileName && <span style={{ marginLeft: 10, fontSize: 12, color: T.ink3 }}>{fileName} — {rows.length} rows</span>}
          </div>

          {/* Step 4: run */}
          <div style={{ marginTop: 20 }}>
            <button onClick={runImport} disabled={!rows.length || busy} style={{ ...btn(T.accent), opacity: !rows.length || busy ? 0.5 : 1 }}>
              {busy ? 'Importing…' : `Import ${rows.length} item${rows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {result && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>Results</strong>
            <span style={{ color: T.ok, fontSize: 13 }}>{result.succeeded} succeeded</span>
            <span style={{ color: result.failed ? T.err : T.ink3, fontSize: 13 }}>{result.failed} failed</span>
            <button onClick={downloadResults} style={{ ...btn(T.bgSubtle), color: T.ink, border: `1.5px solid ${T.borderStrong}`, marginLeft: 'auto' }}>
              ⬇ Download results
            </button>
          </div>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: T.bgSubtle, textAlign: 'left', color: T.ink3 }}>
                  <th style={{ padding: '7px 10px', width: 48 }}>Row</th>
                  <th style={{ padding: '7px 10px', width: 70 }}>Status</th>
                  <th style={{ padding: '7px 10px' }}>SKU</th>
                  <th style={{ padding: '7px 10px' }}>Name / Error</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.row} style={{ borderTop: `1px solid ${T.border}`, background: r.status === 'failed' ? T.errSoft : T.bgElev }}>
                    <td style={{ padding: '7px 10px', color: T.ink3 }}>{r.row}</td>
                    <td style={{ padding: '7px 10px', fontWeight: 600, color: r.status === 'success' ? T.ok : T.err }}>
                      {r.status === 'success' ? 'OK' : 'Failed'}
                    </td>
                    <td style={{ padding: '7px 10px', fontFamily: T.mono }}>{r.sku || '—'}</td>
                    <td style={{ padding: '7px 10px', color: r.status === 'failed' ? T.err : T.ink }}>
                      {r.status === 'success' ? r.name : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
