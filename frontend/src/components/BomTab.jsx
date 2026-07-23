import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
// Loaded on demand — only someone who actually uploads a spreadsheet pays for
// the parser (~180 kB), and the CSV/paste paths never touch it.
const readXlsxFile = (file) => import('read-excel-file/browser').then(m => m.default(file));
import { Empty, Banner } from './MaterialsGrid.jsx';

/**
 * BOM tab: the frozen requirement for this work order, the Excel/CSV upload,
 * and the coloured diff against it.
 *
 * The spreadsheet is parsed here in the browser and posted as JSON, so the
 * function needs no file handling and no parser dependency. Zoho's composite
 * item stays the master — an accepted revision is pushed back to it.
 */

// Header synonyms a store team actually types.
const COL_ALIASES = {
  sku: ['sku', 'item code', 'code', 'item sku', 'part no', 'part number'],
  name: ['name', 'item', 'item name', 'description', 'material', 'raw material'],
  qty: ['qty', 'quantity', 'required qty', 'req qty', 'total qty', 'nos'],
};

// Map a header row to column indexes; falls back to position (sku, name, qty).
function mapHeaders(header) {
  const idx = { sku: -1, name: -1, qty: -1 };
  header.forEach((cell, i) => {
    const h = String(cell ?? '').trim().toLowerCase();
    for (const [key, aliases] of Object.entries(COL_ALIASES)) {
      if (idx[key] === -1 && aliases.includes(h)) idx[key] = i;
    }
  });
  if (idx.qty === -1 && idx.sku === -1 && idx.name === -1) return { sku: 0, name: 1, qty: 2, guessed: true };
  return idx;
}

function rowsFromMatrix(matrix) {
  if (!matrix.length) return [];
  const idx = mapHeaders(matrix[0]);
  const body = idx.guessed ? matrix : matrix.slice(1);
  return body
    .map(r => ({
      sku: idx.sku >= 0 ? String(r[idx.sku] ?? '').trim() : '',
      name: idx.name >= 0 ? String(r[idx.name] ?? '').trim() : '',
      qty: Number(String(r[idx.qty] ?? '').replace(/,/g, '')) || 0,
    }))
    .filter(r => (r.sku || r.name) && r.qty > 0);
}

// CSV / tab-separated, for a pasted selection or a "Save as CSV" export.
function parseDelimited(text) {
  const delim = text.includes('\t') ? '\t' : ',';
  return rowsFromMatrix(
    text.split(/\r?\n/).filter(Boolean).map(line => line.split(delim).map(c => c.replace(/^"|"$/g, '').trim())),
  );
}

const DIFF = {
  new: { bg: '#f0fdf4', fg: '#15803d', label: 'New' },
  qtyChanged: { bg: '#fffbeb', fg: '#b45309', label: 'Qty changed' },
  removed: { bg: '#fef2f2', fg: '#b91c1c', label: 'Removed' },
  unchanged: { bg: 'transparent', fg: 'var(--text-muted)', label: '' },
};

export default function BomTab({ workOrderId, fgs, revision, onChanged }) {
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [bom, setBom] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const fileRef = useRef(null);

  function load() {
    if (!fgId) return;
    axios.get(`/api/wo/${workOrderId}/bom`, { params: { fgId } })
      .then(({ data }) => setBom(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the BOM'));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fgId, workOrderId, revision]);

  async function previewFrom(source, rows) {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/bom/preview`, { fgId, source, rows });
      setPreview(data);
      if (!data.changeCount) toast('No differences found — the BOM already matches.');
      if (data.unmatched?.length) {
        toast.error(`${data.unmatched.length} row(s) matched no item and were left out`, { duration: 6000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not compare the BOM');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = /\.(csv|txt|tsv)$/i.test(file.name)
        ? parseDelimited(await file.text())
        : rowsFromMatrix(await readXlsxFile(file));
      if (!rows.length) return toast.error('No usable rows found. Expected columns: SKU, Name, Qty.');
      previewFrom('excel', rows);
    } catch {
      toast.error('Could not read that file. Use .xlsx or .csv with SKU / Name / Qty columns.');
    }
  }

  async function apply(pushToZoho) {
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/bom/apply`, {
        fgId, lines: preview.lines, summary: preview.summary, pushToZoho,
      });
      toast.success(`BOM revision ${data.revision} applied${data.pushedToZoho ? ' and pushed to Zoho' : ''}`);
      setPreview(null);
      load();
      onChanged?.();
    } catch (err) {
      const d = err.response?.data;
      (d?.details || [d?.error || 'Could not apply the BOM']).forEach(m => toast.error(m, { duration: 7000 }));
    } finally {
      setBusy(false);
    }
  }

  if (!fgs.length) return <Empty>This work order has no finished goods.</Empty>;

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '14px 20px 24px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {fgs.length > 1 && (
          <select value={fgId || ''} onChange={e => { setFgId(e.target.value); setPreview(null); }} style={select}>
            {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
          </select>
        )}
        <button onClick={() => previewFrom('composite')} disabled={busy} style={btn}>
          ⟳ Compare with Zoho composite item
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={busy} style={btn}>⬆ Upload BOM (Excel / CSV)</button>
        <button onClick={() => setPasting(p => !p)} disabled={busy} style={btn}>Paste from spreadsheet</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={onFile} style={{ display: 'none' }} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Revision {bom?.revision ?? '—'}</span>
      </div>

      {pasting && (
        <PasteBox
          onCancel={() => setPasting(false)}
          onParse={text => {
            const rows = parseDelimited(text);
            if (!rows.length) return toast.error('Nothing usable pasted. Include SKU / Name / Qty columns.');
            setPasting(false);
            previewFrom('excel', rows);
          }}
        />
      )}

      {preview && (
        <div style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>
              {preview.changeCount ? `${preview.changeCount} change(s) to review` : 'No changes'}
            </b>
            <Legend />
            <div style={{ flex: 1 }} />
            <button onClick={() => setPreview(null)} style={btn}>Discard</button>
            <button onClick={() => apply(false)} disabled={busy || !preview.changeCount} style={btn}>
              Apply here only
            </button>
            <button
              onClick={() => apply(true)}
              disabled={busy || !preview.changeCount || preview.blocked?.length}
              style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}
            >
              Apply &amp; update Zoho
            </button>
          </div>

          {preview.blocked?.length > 0 && (
            <Banner tone="warn">
              <b>Cannot apply:</b>
              <ul style={{ margin: '4px 0 0 16px' }}>{preview.blocked.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </Banner>
          )}
          {preview.unmatched?.length > 0 && (
            <Banner tone="warn">
              {preview.unmatched.length} uploaded row(s) matched no item on this BOM and were left out:{' '}
              {preview.unmatched.slice(0, 5).map(u => u.name || u.sku).join(', ')}
              {preview.unmatched.length > 5 && ` +${preview.unmatched.length - 5} more`}
            </Banner>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Item', 'SKU', 'Change', 'Was', 'Now'].map(h => (
                  <th key={h} style={{ ...thStyle, textAlign: h === 'Item' || h === 'SKU' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.lines.map(l => {
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
        </div>
      )}

      <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Current BOM</h3>
      {!bom ? <Empty>Loading…</Empty> : !bom.lines.length ? (
        <Empty>No lines yet. Compare with the Zoho composite item, or upload a BOM file.</Empty>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <thead>
            <tr>
              {['Raw material', 'SKU', 'UOM', 'Per unit', 'Required', 'Source'].map((h, i) => (
                <th key={h} style={{ ...thStyle, textAlign: i < 3 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bom.lines.filter(l => !fgId || l.workOrderFgId === fgId).map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={cell}>{l.rmName}</td>
                <td style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{l.rmSku || '—'}</td>
                <td style={cell}>{l.uom || '—'}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{l.perUnitQty}</td>
                <td style={{ ...cell, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{l.requiredQty}</td>
                <td style={{ ...cell, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{l.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {bom?.revisions?.length > 1 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: '20px 0 8px' }}>Revision history</h3>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {bom.revisions.map(r => (
              <div key={r.revision} style={{ padding: '9px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
                <b style={{ minWidth: 40 }}>r{r.revision}</b>
                <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>{r.changedAt}</span>
                <span>
                  {(r.summary.added?.length || 0)} added · {(r.summary.changed?.length || 0)} changed · {(r.summary.removed?.length || 0)} removed
                </span>
                {r.pushedToZoho && <span style={{ color: '#15803d' }}>pushed to Zoho</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PasteBox({ onParse, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div style={{ marginBottom: 14, padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
        Select the rows in Excel, copy, and paste here. Columns: SKU, Name, Qty.
      </div>
      <textarea
        value={text} onChange={e => setText(e.target.value)} rows={6} autoFocus
        placeholder={'SKU\tName\tQty\nSH-1\tShaft\t12'}
        style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 8, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => onParse(text)} style={{ ...btn, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)' }}>Compare</button>
        <button onClick={onCancel} style={btn}>Cancel</button>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <span style={{ display: 'flex', gap: 10, fontSize: 11 }}>
      {['new', 'qtyChanged', 'removed'].map(k => (
        <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, color: DIFF[k].fg }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: DIFF[k].bg, border: `1px solid ${DIFF[k].fg}` }} />
          {DIFF[k].label}
        </span>
      ))}
    </span>
  );
}

const btn = {
  padding: '7px 12px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
const select = {
  padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', maxWidth: 320,
};
const thStyle = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
  background: 'var(--bg-page)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const cell = { padding: '7px 12px', fontSize: 13 };

export { rowsFromMatrix, parseDelimited, mapHeaders };
