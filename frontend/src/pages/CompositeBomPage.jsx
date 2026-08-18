import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import { Empty, Banner } from '../components/MaterialsGrid.jsx';
import { AccessNotice, Table, btn } from '../components/woCommon.jsx';
import {
  rowsFromMatrix, matrixFromText, parseBooksComposites, readXlsxFile, downloadBooksSample, DIFF, Legend, PasteBox,
} from '../components/BomTab.jsx';

/**
 * Global BOM page (CR-028): a grid of Zoho Books composite items — no
 * work-order framing. A row drills into the composite's BOM: upload/paste a
 * sheet, review the coloured diff, apply straight to Books. Rows matching no
 * Books item can be created there as plain inventory items. "New composite
 * item" builds a fresh composite in Books from an uploaded sheet.
 */
export default function CompositeBomPage() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null); // { id, name, sku } | 'new'
  const [blocked, setBlocked] = useState(null);
  const [importGroups, setImportGroups] = useState(null); // parsed Books export
  const [impCreateMissing, setImpCreateMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const sheet = useSheetInput(matrix => {
    const groups = parseBooksComposites(matrix);
    if (!groups?.length) {
      return toast.error('Not a Zoho Books composite-items export. To import one BOM sheet (SKU/Name/Qty), open the composite item first.', { duration: 7000 });
    }
    setImpCreateMissing(false);
    setImportGroups(groups);
  });

  async function runImport() {
    setBusy(true);
    try {
      const { data } = await axios.post('/api/wo/composites/import', { groups: importGroups, createMissing: impCreateMissing });
      const bad = data.results.filter(r => r.status === 'error' || r.status === 'skipped');
      bad.forEach(r => toast.error(`${r.name}: ${r.error}`, { duration: 8000 }));
      const okCount = data.results.length - bad.length;
      if (okCount) toast.success(`${okCount} composite item(s) imported`);
      setImportGroups(null);
      loadList();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  function loadList() {
    axios.get('/api/wo/composites')
      .then(({ data }) => setRows(data))
      .catch(err => {
        if (err.response?.status === 409 && err.response.data?.error === 'reauth_required') setBlocked('reauth');
        else if (err.response?.status === 403) setBlocked('disabled');
        else toast.error(err.response?.data?.error || 'Could not load composite items');
      });
  }
  useEffect(loadList, []);

  const filtered = (Array.isArray(rows) ? rows : []).filter(r =>
    !q || [r.name, r.sku].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())),
  );
  // Hooks must run on every render — keep usePager above the early returns.
  const { pageRows, pager } = usePager(filtered);

  if (blocked) return <AccessNotice kind={blocked} />;
  if (selected === 'new') {
    return <NewComposite onBack={() => setSelected(null)} onCreated={() => { setSelected(null); loadList(); }} />;
  }
  if (selected) return <CompositeDetail item={selected} onBack={() => setSelected(null)} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, SKU…"
          style={{ width: 260, padding: '7px 11px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)' }}
        />
        <div style={{ flex: 1 }} />
        <button onClick={() => sheet.fileRef.current?.click()} disabled={busy} style={btn}>⬆ Import Books export</button>
        <input ref={sheet.fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={sheet.onFile} style={{ display: 'none' }} />
        <button onClick={() => setSelected('new')} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
          + New composite item
        </button>
      </div>

      {importGroups && (
        <div style={{ margin: '12px 20px 0', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>Import {importGroups.length} composite item(s) from the Books export</b>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={impCreateMissing} onChange={e => setImpCreateMissing(e.target.checked)} />
              Create missing component items in Books
            </label>
            <button onClick={() => setImportGroups(null)} disabled={busy} style={btn}>Cancel</button>
            <button onClick={runImport} disabled={busy} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
              {busy ? 'Importing…' : 'Import'}
            </button>
          </div>
          {importGroups.map((g, i) => {
            const exists = (rows || []).some(c =>
              (g.sku && String(c.sku || '').toLowerCase() === g.sku.toLowerCase())
              || String(c.name || '').trim().toLowerCase() === g.name.toLowerCase(),
            );
            return (
              <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
                <b style={{ minWidth: 180 }}>{g.name}</b>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', minWidth: 80 }}>{g.sku || '—'}</span>
                <span>{g.rows.length} component(s)</span>
                <span style={{ color: exists ? '#b45309' : '#15803d', fontWeight: 600 }}>
                  {exists ? 'updates existing' : 'creates new'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {!rows ? <Empty>Loading…</Empty> : !filtered.length ? <Empty>No composite items in this Books org.</Empty> : (
          <Table
            head={['Name', 'SKU', 'Status']}
            rows={pageRows.map(c => ({
              key: c.id, onClick: () => setSelected(c),
              cells: [
                <b style={{ color: 'var(--blue)' }}>{c.name}</b>,
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.sku || '—'}</span>,
                c.status,
              ],
            }))}
          />
        )}
      </div>
      <GridFooter pager={pager} />
    </div>
  );
}

// Shared file/paste → cell-matrix plumbing for the grid, detail and
// new-composite views. Consumers decide what the matrix means (a plain
// SKU/Name/Qty sheet or a Books composite-items export).
function useSheetInput(onMatrix) {
  const fileRef = useRef(null);
  const [pasting, setPasting] = useState(false);
  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onMatrix(/\.(csv|txt|tsv)$/i.test(file.name)
        ? matrixFromText(await file.text())
        : await readXlsxFile(file));
    } catch {
      toast.error('Could not read that file. Use .xlsx or .csv.');
    }
  }
  function onPaste(text) {
    setPasting(false);
    onMatrix(matrixFromText(text));
  }
  return { fileRef, pasting, setPasting, onFile, onPaste };
}

function CompositeDetail({ item, onBack }) {
  const [bom, setBom] = useState(null);
  const [preview, setPreview] = useState(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  function load(refresh) {
    axios.get(`/api/wo/composites/${item.id}/bom`, { params: refresh ? { refresh: 1 } : {} })
      .then(({ data }) => setBom(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the BOM'));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [item.id]);

  const sheet = useSheetInput(matrix => {
    // A Books composite-items export carries several BOMs — pick this item's.
    const groups = parseBooksComposites(matrix);
    let rows;
    if (groups) {
      const g = groups.find(g =>
        (item.sku && g.sku.toLowerCase() === String(item.sku).toLowerCase())
        || g.name.toLowerCase() === String(item.name || '').trim().toLowerCase(),
      ) || (groups.length === 1 ? groups[0] : null);
      if (!g) {
        return toast.error(`This Books export holds ${groups.length} composite items and none match "${item.name}". Use "Import Books export" on the BOM list instead.`, { duration: 8000 });
      }
      rows = g.rows;
    } else {
      rows = rowsFromMatrix(matrix);
    }
    if (!rows.length) return toast.error('No usable rows found. Expected columns: SKU, Name, Qty.');
    runPreview(rows);
  });

  async function runPreview(rows) {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/composites/${item.id}/bom/preview`, { rows });
      setPreview(data);
      setCreateMissing(false);
      if (!data.changeCount && !data.missing?.length) toast('No differences found — the BOM already matches.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not compare the BOM');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/composites/${item.id}/bom/apply`, {
        lines: preview.lines, missing: preview.missing, createMissing,
      });
      toast.success(`BOM updated in Books${data.created.length ? ` — created ${data.created.length} item(s)` : ''}`);
      setPreview(null);
      load();
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not apply the BOM']).forEach(m => toast.error(m, { duration: 7000 }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button onClick={onBack} style={btn}>← All BOMs</button>
        <b style={{ fontSize: 14 }}>{item.name}</b>
        {item.sku && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{item.sku}</span>}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 24px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => sheet.fileRef.current?.click()} disabled={busy} style={btn}>⬆ Upload BOM (Excel / CSV)</button>
          <button onClick={() => sheet.setPasting(p => !p)} disabled={busy} style={btn}>Paste from spreadsheet</button>
          <button onClick={downloadBooksSample} style={btn}>⬇ Download sample</button>
          <button onClick={() => load(true)} disabled={busy} style={btn}>⟳ Refresh from Zoho</button>
          <input ref={sheet.fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={sheet.onFile} style={{ display: 'none' }} />
        </div>

        {sheet.pasting && <PasteBox onCancel={() => sheet.setPasting(false)} onParse={sheet.onPaste} />}

        {preview && (
          <div style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 13 }}>
                {preview.changeCount ? `${preview.changeCount} change(s) to review` : 'No changes'}
              </b>
              <Legend />
              <div style={{ flex: 1 }} />
              <button onClick={() => setPreview(null)} style={btn}>Discard</button>
              <button
                onClick={apply}
                disabled={busy || (!preview.changeCount && !(createMissing && preview.missing?.length))}
                style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}
              >
                Apply to Books
              </button>
            </div>

            {preview.missing?.length > 0 && (
              <Banner tone="warn">
                {preview.missing.length} row(s) match no item in Books:{' '}
                {preview.missing.slice(0, 5).map(u => u.name || u.sku).join(', ')}
                {preview.missing.length > 5 && ` +${preview.missing.length - 5} more`}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontWeight: 600 }}>
                  <input type="checkbox" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} />
                  Create these items in Books and add them to the BOM
                </label>
              </Banner>
            )}

            <DiffTable lines={preview.lines} />
          </div>
        )}

        <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Current BOM</h3>
        {!bom ? <Empty>Loading…</Empty> : !bom.lines.length ? (
          <Empty>No components yet. Upload a BOM file or paste from a spreadsheet.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>
                {['Component', 'SKU', 'UOM', 'Qty'].map((h, i) => (
                  <th key={h} style={{ ...thStyle, textAlign: i < 3 ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bom.lines.map(l => (
                <tr key={l.rmItemId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={cell}>{l.rmName}</td>
                  <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.rmSku || '—'}</td>
                  <td style={cell}>{l.uom || '—'}</td>
                  <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.perUnitQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewComposite({ onBack, onCreated }) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const sheet = useSheetInput(matrix => {
    // A single-composite Books export also prefills the name/SKU fields.
    const groups = parseBooksComposites(matrix);
    if (groups) {
      if (groups.length !== 1) {
        return toast.error('This Books export holds several composite items — use "Import Books export" on the BOM list instead.', { duration: 8000 });
      }
      setName(n => n || groups[0].name);
      setSku(s => s || groups[0].sku);
      return setRows(groups[0].rows);
    }
    const parsed = rowsFromMatrix(matrix);
    if (!parsed.length) return toast.error('No usable rows found. Expected columns: SKU, Name, Qty.');
    setRows(parsed);
  });

  async function create(createMissing) {
    if (!name.trim()) return toast.error('Give the composite item a name.');
    if (!rows?.length) return toast.error('Upload or paste the component rows first.');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/wo/composites', { name: name.trim(), sku: sku.trim(), rows, createMissing });
      toast.success(`Created ${data.name} in Books${data.created.length ? ` with ${data.created.length} new item(s)` : ''}`);
      onCreated();
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not create the composite item']).forEach(m => toast.error(m, { duration: 7000 }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
        <button onClick={onBack} style={btn}>← All BOMs</button>
        <b style={{ fontSize: 14 }}>New composite item</b>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px 24px', maxWidth: 720 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Name *" style={{ ...input, flex: 2 }} />
          <input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU" style={{ ...input, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => sheet.fileRef.current?.click()} disabled={busy} style={btn}>⬆ Upload BOM (Excel / CSV)</button>
          <button onClick={() => sheet.setPasting(p => !p)} disabled={busy} style={btn}>Paste from spreadsheet</button>
          <button onClick={downloadBooksSample} style={btn}>⬇ Download sample</button>
          <input ref={sheet.fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={sheet.onFile} style={{ display: 'none' }} />
        </div>

        {sheet.pasting && <PasteBox onCancel={() => sheet.setPasting(false)} onParse={sheet.onPaste} />}

        {rows?.length > 0 && (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', marginBottom: 14 }}>
              <thead>
                <tr>
                  {['SKU', 'Name', 'Qty'].map((h, i) => (
                    <th key={h} style={{ ...thStyle, textAlign: i < 2 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.sku || '—'}</td>
                    <td style={cell}>{r.name || '—'}</td>
                    <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => create(false)} disabled={busy} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>
                Create in Books
              </button>
              <button onClick={() => create(true)} disabled={busy} style={btn}>
                Create + add missing components as new items
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DiffTable({ lines }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {['Item', 'SKU', 'Change', 'Was', 'Now'].map(h => (
            <th key={h} style={{ ...thStyle, textAlign: h === 'Item' || h === 'SKU' ? 'left' : 'right' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lines.map(l => {
          const d = DIFF[l.diffStatus] || DIFF.unchanged;
          return (
            <tr key={l.rmItemId} style={{ background: d.bg, borderBottom: '1px solid var(--border)' }}>
              <td style={cell}>{l.rmName || l.rmItemId}</td>
              <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.rmSku || '—'}</td>
              <td style={{ ...cell, textAlign: 'right', color: d.fg, fontWeight: 600, fontSize: 12 }}>{d.label}</td>
              <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.prevQty ?? '—'}</td>
              <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.requiredQty}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const input = {
  padding: '8px 11px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
};
const thStyle = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const cell = { padding: '7px 12px', fontSize: 13 };
