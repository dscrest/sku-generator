import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { readXlsxFile, matrixFromText, parseBooksComposites, downloadBooksSample } from '../components/BomTab';
import { autoMap, applyMapping } from '../components/booksMapping';
import PickList from '../components/PickList';

// Bulk item import (CR-092): upload a Zoho Books item sheet → map columns to
// Books fields (exact-name matches auto-map, rest by hand) → per-row
// Name/SKU/Description via the same engine as the manual generator → local
// SKUItem rows. One fixed sample file for every product type. The product type
// picked on the page applies to every row; "From Category Name" (the default
// when the org has several) sends each row to the product type named like its
// Category Name. Composite
// items import inline here too (Books composite export → /api/wo/composites).
// Push to Books is manual unless the org's auto-push setting (SKU Settings) is on.
// The sample download is an info link under the upload button, not a step.

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
const card = (active) => ({
  flex: 1, padding: '14px 16px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
  border: `1.5px solid ${active ? T.accent : T.borderStrong}`,
  background: active ? '#eef2ff' : T.bgElev, color: T.ink, fontFamily: T.sans,
  textDecoration: 'none', display: 'block',
});

// Fixed columns of the Zoho Books item import/export sheet (sample_items.csv).
const BOOKS_HEADERS = [
  'Item Name', 'SKU', 'Item ID', 'Category Name', 'HSN/SAC', 'Sales Description', 'Selling Price',
  'Is Returnable Item', 'Brand', 'Manufacturer', 'UPC', 'EAN', 'ISBN',
  'Part Number', 'Product Type', 'Sales Account', 'Unit', 'Purchase Description',
  'Purchase Price', 'Item Type', 'Purchase Account', 'Inventory Account',
  'Reorder Level', 'Preferred Vendor', 'Opening Stock', 'Opening Stock Value',
  'Package Weight', 'Package Length', 'Package Width', 'Package Height',
  'Weight unit', 'Dimension unit', 'Inter State Tax Name', 'Inter State Tax Type',
  'Inter State Tax Rate', 'Intra State Tax Name', 'Intra State Tax Type',
  'Intra State Tax Rate', 'Taxability Type', 'Exemption Reason', 'Warehouse Name',
];

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

const fmtSize = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const hint = { margin: '8px 0 0', fontSize: 12, color: T.ink3 };
const linkBtn = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  color: T.accent, textDecoration: 'underline',
};

// Visible button + hidden input. The handlers clear the input's value (so the
// same file can be re-picked), so the picked file is shown from state instead.
function FilePick({ onChange, picked }) {
  const ref = useRef(null);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button onClick={() => ref.current?.click()} style={btn(T.accent)}>
        ⬆ {picked ? 'Change file' : 'Choose file'}
      </button>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={onChange} style={{ display: 'none' }} />
      <span style={{ fontSize: 13, color: picked ? T.ink : T.ink3 }}>
        {picked ? `📄 ${picked}` : 'No file selected'}
      </span>
    </div>
  );
}

const NOT_MAPPED = '— not mapped —';

// Typable column picker: PickList filters as you type, but only a real file
// column commits — other text is dropped on blur. Focus blanks the text so the
// whole list shows; the current column stays visible as the placeholder.
function ColumnPick({ value, options, onChange }) {
  const [text, setText] = useState(null); // null ⇔ not editing
  return (
    <PickList
      value={text ?? value}
      options={options}
      placeholder={value || NOT_MAPPED}
      onChange={(v) => {
        setText(v);
        if (v === NOT_MAPPED) onChange('');
        else if (options.includes(v)) onChange(v);
      }}
      inputProps={{ onFocusCapture: () => setText(''), onBlur: () => setText(null) }}
      style={{ ...ctrl, height: 28, width: '100%', borderColor: value ? T.borderStrong : T.border }}
    />
  );
}

export default function ImportItemsPage() {
  const [kind, setKind] = useState('simple'); // 'simple' | 'composite'
  const [industries, setIndustries] = useState([]);
  const [industryId, setIndustryId] = useState('');
  const [properties, setProperties] = useState([]);
  const [rows, setRows] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get('/api/industries')
      .then((r) => {
        const list = r.data || [];
        setIndustries(list);
        // '' = From Category Name. A single product type needs no choice.
        setIndustryId(list.length === 1 ? list[0].id : '');
      })
      .catch(() => toast.error('Failed to load product types'));
    // Every product type's properties in one call — rows route per Category Name.
    axios.get('/api/properties')
      .then((r) => setProperties((r.data || []).filter((p) => p.activeInSku !== false)))
      .catch(() => toast.error('Failed to load properties'));
  }, []);

  // One mapping row per caption; a caption shared by product types lists them all.
  // `mapping` covers every product type's fields (switching the product type
  // keeps hand-made mappings); the table shows the picked product type's only.
  const typesByField = {};
  const seen = new Map(); // lowercased caption → field
  const shownProps = new Set();
  for (const p of properties) {
    const caption = String(p.caption || '').trim();
    if (!caption) continue;
    const k = caption.toLowerCase();
    if (!industryId || String(p.industryId) === String(industryId)) shownProps.add(k);
    if (!seen.has(k)) { seen.set(k, `${caption} (Custom Field)`); typesByField[seen.get(k)] = []; }
    const types = typesByField[seen.get(k)];
    if (p.industryName && !types.includes(p.industryName)) types.push(p.industryName);
  }
  const templateHeaders = [...BOOKS_HEADERS, ...seen.values()];
  const shownHeaders = [...BOOKS_HEADERS, ...[...seen].filter(([k]) => shownProps.has(k)).map(([, f]) => f)];
  const columnOptions = [NOT_MAPPED, ...csvHeaders];

  // Exact-named columns map automatically; the user maps the rest by hand.
  useEffect(() => {
    if (csvHeaders.length) setMapping(autoMap(templateHeaders, csvHeaders));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csvHeaders, properties]);

  async function onFile(e) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setResult(null);
    try {
      const matrix = /\.(xlsx|xls)$/i.test(file.name)
        ? await readXlsxFile(file)
        : matrixFromText(await file.text());
      const parsed = matrixToRows(matrix);
      if (!parsed.length) { toast.error('No data rows found in the sheet'); setRows([]); setCsvHeaders([]); setFileName(''); return; }
      setCsvHeaders((matrix[0] || []).map((h) => String(h || '').trim()).filter(Boolean));
      setRows(parsed);
      setFileName(`${file.name} · ${fmtSize(file.size)}`);
      toast.success(`${parsed.length} row${parsed.length === 1 ? '' : 's'} ready`);
    } catch (err) {
      toast.error('Could not read the file');
      setRows([]); setCsvHeaders([]); setFileName('');
    } finally {
      input.value = '';
    }
  }

  async function runImport() {
    if (!rows.length) return;
    setBusy(true); setResult(null);
    try {
      const shownMapping = Object.fromEntries(shownHeaders.map((f) => [f, mapping[f]]));
      const body = { industryId: industryId || null, rows: applyMapping(rows, shownMapping), format: 'books' };
      const { data } = await axios.post('/api/sku-items/import', body);
      setResult(data);
      const pushed = data.results.filter((r) => r.pushed).length;
      toast.success(`${data.succeeded} created, ${data.failed} failed${pushed ? `, ${pushed} pushed to Books` : ''}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  // Composite flow: Books composite export → parsed groups → /api/wo/composites/import.
  // Same machinery as CompositeBomPage, inlined so import lives on one page.
  const [compGroups, setCompGroups] = useState(null);
  const [compCreateMissing, setCompCreateMissing] = useState(false);
  const [compBusy, setCompBusy] = useState(false);
  const [compFileName, setCompFileName] = useState('');
  const clearComp = () => { setCompGroups(null); setCompFileName(''); };

  async function onCompFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const matrix = /\.(csv|txt|tsv)$/i.test(file.name)
        ? matrixFromText(await file.text())
        : await readXlsxFile(file);
      const groups = parseBooksComposites(matrix);
      if (!groups?.length) {
        toast.error('Not a Zoho Books composite-items export. To import one BOM sheet (SKU/Name/Qty), open the composite item first.', { duration: 7000 });
        return;
      }
      setCompCreateMissing(false);
      setCompGroups(groups);
      setCompFileName(`${file.name} · ${fmtSize(file.size)}`);
    } catch {
      toast.error('Could not read that file. Use .xlsx or .csv.');
    }
  }

  async function runCompImport() {
    setCompBusy(true);
    try {
      const { data } = await axios.post('/api/wo/composites/import', { groups: compGroups, createMissing: compCreateMissing });
      const bad = data.results.filter((r) => r.status === 'error' || r.status === 'skipped');
      bad.forEach((r) => toast.error(`${r.name}: ${r.error}`, { duration: 8000 }));
      const okCount = data.results.length - bad.length;
      if (okCount) toast.success(`${okCount} composite item(s) imported`);
      clearComp();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setCompBusy(false);
    }
  }

  const hasPushCol = !!result?.results?.some((r) => r.pushed !== undefined);

  function downloadResults() {
    if (!result) return;
    const head = 'row,status,sku,name,error,productType,warning' + (hasPushCol ? ',pushed,pushError' : '');
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = result.results.map((r) => {
      const cols = [r.row, r.status, r.sku || '', r.name || '', r.error || '', r.productType || '', r.warning || ''];
      if (hasPushCol) cols.push(r.pushed === undefined ? '' : String(!!r.pushed), r.pushError || '');
      return cols.map(esc).join(',');
    }).join('\n');
    const url = URL.createObjectURL(new Blob([head + '\n' + body], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'import-results.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
    <div style={{ padding: 24, maxWidth: 920, margin: '0 auto', fontFamily: T.sans, color: T.ink }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Bulk Item Import</h2>
      <p style={{ margin: '0 0 20px', color: T.ink3, fontSize: 13 }}>
        Upload a sheet of items. Items are created here; they are
        pushed to Zoho Books automatically or manually depending on your{' '}
        <Link to="/sku/settings">SKU Settings</Link>.
      </p>

      {/* Step 1: what kind of items */}
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
        1 · What are you importing?
      </label>
      <div style={{ display: 'flex', gap: 12, maxWidth: 640 }}>
        <button onClick={() => setKind('simple')} style={card(kind === 'simple')}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Simple items</div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>
            One row per item — Zoho Books item sheet (.xlsx, .xls or .csv).
          </div>
        </button>
        <button onClick={() => setKind('composite')} style={card(kind === 'composite')}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Composite items</div>
          <div style={{ fontSize: 12, color: T.ink3, marginTop: 3 }}>
            Items with a BOM — Zoho Books composite-items export.
          </div>
        </button>
      </div>

      {kind === 'simple' && (
        <>
          {/* The selector appears only when the org has several product types. */}
          {industries.length > 1 && (
            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
                Product type
              </label>
              <select value={industryId} onChange={(e) => setIndustryId(e.target.value)} style={{ ...ctrl, minWidth: 260 }}>
                <option value="">From Category Name</option>
                {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          )}

          {/* Step 2: upload. The sample (one fixed Books item sheet for every
              product type) is optional info, so it sits below as a link. */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
              2 · Upload filled sheet
            </label>
            <FilePick onChange={onFile}
                      picked={fileName && `${fileName} · ${rows.length} row${rows.length === 1 ? '' : 's'}`} />
            <p style={hint}>
              Need a template?{' '}
              {/* ponytail: relative href — app is hosted under /app/ with base './' + HashRouter */}
              <a href="sample_items.xlsx" download="sample_items.xlsx" style={{ color: T.accent }}>Download sample</a>
              . Rows with an SKU keep it as-is; rows without one generate it from the
              custom-field columns, using the SKU rules of the product type.
            </p>
          </div>

          {/* Step 3: field mapping — Zoho Books fields | uploaded file columns.
              Exact-name matches auto-map; everything else starts unmapped. */}
          {csvHeaders.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
                3 · Match fields with Zoho Books ({shownHeaders.filter((f) => mapping[f]).length} of {shownHeaders.length} matched)
              </label>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', maxWidth: 640 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: T.bgSubtle, textAlign: 'left', color: T.ink3 }}>
                      <th style={{ padding: '7px 10px' }}>Zoho Books field</th>
                      <th style={{ padding: '7px 10px' }}>Your file column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownHeaders.map((f) => (
                      <tr key={f} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '5px 10px' }}>
                          {f}
                          {!industryId && typesByField[f]?.length > 0 && (
                            <span style={{ color: T.ink3, marginLeft: 6 }}>· {typesByField[f].join(', ')}</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 10px' }}>
                          <ColumnPick value={mapping[f] || ''} options={columnOptions}
                                      onChange={(v) => setMapping((m) => ({ ...m, [f]: v }))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!mapping['Item Name'] && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: T.err }}>Map the Item Name field to import.</p>
              )}
            </div>
          )}

          {/* Run */}
          <div style={{ marginTop: 20 }}>
            <button onClick={runImport}
                    disabled={!rows.length || busy || !mapping['Item Name']}
                    style={{ ...btn(T.accent), opacity: !rows.length || busy || !mapping['Item Name'] ? 0.5 : 1 }}>
              {busy ? 'Importing…' : `Import ${rows.length} item${rows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}

      {kind === 'composite' && (
        <>
          {/* Step 2: upload. The sample (generated Books composite-items sheet,
              opens in Excel) is optional info, so it sits below as a link. */}
          <div style={{ marginTop: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.ink3, marginBottom: 6 }}>
              2 · Upload Books export
            </label>
            <FilePick onChange={onCompFile}
                      picked={compFileName && `${compFileName} · ${compGroups?.length || 0} composite item(s)`} />
            <p style={hint}>
              Need a template?{' '}
              <button onClick={downloadBooksSample} style={linkBtn}>Download sample</button>
              . Zoho Books composite-items export format: one block per composite item,
              component rows beneath it.
            </p>
          </div>

          {/* Preview + run. ponytail: no "updates existing / creates new" badge — that
              needs the /api/wo/composites list; the import results report outcomes. */}
          {compGroups && (
            <div style={{ marginTop: 20, border: `1px solid ${T.border}`, borderRadius: 8, overflow: 'hidden', maxWidth: 640 }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: T.bgSubtle }}>
                <b style={{ fontSize: 13 }}>Import {compGroups.length} composite item(s)</b>
                <div style={{ flex: 1 }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={compCreateMissing} onChange={(e) => setCompCreateMissing(e.target.checked)} />
                  Create missing component items in Books
                </label>
                <button onClick={clearComp} disabled={compBusy}
                        style={{ ...btn(T.bgElev), color: T.ink, border: `1.5px solid ${T.borderStrong}` }}>
                  Cancel
                </button>
                <button onClick={runCompImport} disabled={compBusy} style={btn(T.accent)}>
                  {compBusy ? 'Importing…' : 'Import'}
                </button>
              </div>
              {compGroups.map((g, i) => (
                <div key={i} style={{ padding: '8px 14px', borderTop: i ? `1px solid ${T.border}` : 'none', fontSize: 12, display: 'flex', gap: 12 }}>
                  <b style={{ minWidth: 180 }}>{g.name}</b>
                  <span style={{ fontFamily: T.mono, color: T.ink3, minWidth: 80 }}>{g.sku || '—'}</span>
                  <span>{g.rows.length} component(s)</span>
                </div>
              ))}
            </div>
          )}
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
                  {hasPushCol && <th style={{ padding: '7px 10px', width: 130 }}>Books</th>}
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
                      {r.status === 'success' && (r.productType || r.warning) && (
                        <div style={{ fontSize: 12, color: T.ink3 }}>
                          {[r.productType, r.warning].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    {hasPushCol && (
                      <td style={{ padding: '7px 10px', fontSize: 12, color: r.pushError ? T.err : r.pushed ? T.ok : T.ink3 }}
                          title={r.pushError || undefined}>
                        {r.pushed ? 'Pushed' : r.pushError ? 'Push failed' : '—'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
