import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { readDealId, readParam } from '../components/CrmInfoCard';
import { buildEstimate, computeTotals } from './estimateParser';
import { TermsSheet } from './EstimateTerms.jsx';
import { loadTerms, saveTerms } from './estimateTerms.js';

// Estimate ("Techno Commercial Proposal") print page. Two CRM entry points:
// a Deal button (/#/estimate?dealId=<id>) lists the deal's Quotes with
// checkboxes — ticked quotes print one sheet each, page-break between — and a
// Quote button (/#/estimate?quoteId=<id>) renders that quote directly. Sheet is
// a port of estimate-prototype/msun-estimate.html with two templates —
// A–F priced / A–D technical — and native window.print().

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Prototype CSS, page-scoped with an est- prefix. Print: hide everything but
// the sheet (WoPrintSheet visibility trick — the sheet lives inside app chrome).
const CSS = `
.est-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); }
.est-toolbar .est-spacer { flex: 1; }
.est-toolbar button { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: var(--radius-md);
  border: 1px solid var(--border-mid); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; }
.est-toolbar button:hover { background: var(--bg); }
.est-toolbar button.est-active { background: #e8501e; border-color: #e8501e; color: #fff; }
.est-toolbar .est-lbl { font-size: 12px; color: var(--text-secondary); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.est-sheet { background: #fff; width: 210mm; max-width: 100%; margin: 18px auto; padding: 12mm 10mm;
  box-shadow: 0 2px 14px rgba(0,0,0,.12); font-size: 11px; line-height: 1.35; color: #1a1a1a;
  font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
.est-banner { font-size: 34px; font-weight: 800; font-style: italic; color: #e8501e; letter-spacing: -1px; text-align: center; }
.est-logo { display: block; margin: 0 auto 2px; max-height: 60px; max-width: 100%; }
.est-proposal-title { text-align: center; font-weight: 700; text-decoration: underline; margin: 4px 0 8px; font-size: 14px; }
.est-sheet table { width: 100%; border-collapse: collapse; }
.est-hdr td { border: 1px solid #000; padding: 4px 7px; vertical-align: top; }
.est-hdr .est-to-name { font-size: 15px; font-weight: 700; }
.est-hdr .est-offer-no { color: #e8501e; font-weight: 700; }
.est-hdr .est-lbl-cell { font-weight: 700; text-align: center; }
.est-grid { margin-top: 6px; }
.est-grid th, .est-grid td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
.est-grid th { background: #f1f1f1; font-size: 10px; text-transform: uppercase; }
.est-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.est-ctr { text-align: center; white-space: nowrap; }
.est-design-row td { background: #fff7d6; color: #e8501e; font-weight: 700; text-transform: uppercase; text-align: center; }
.est-item-title { font-weight: 700; text-decoration: underline; }
.est-specs { list-style: none; margin: 4px 0 0; padding: 0; }
.est-specs li { line-height: 1.5; }
.est-specs .est-k { font-weight: 700; }
.est-grid .est-t-lbl { font-weight: 700; text-align: center; text-transform: uppercase; white-space: nowrap; }
.est-grid .est-t-final { font-weight: 800; }
.est-tc { margin-top: 10px; }
.est-tc td { border: 1px solid #000; padding: 4px 7px; vertical-align: top; }
.est-tc .est-tc-lbl { font-weight: 700; text-decoration: underline; width: 24%; }
.est-tc-bank td { width: 25%; }
.est-tc-bank .est-tc-lbl { text-decoration: none; }
.est-tc-footer { display: flex; align-items: center; gap: 12px; margin-top: 10px; border: 2px solid #1a3ea5; padding: 6px 10px; }
.est-tc-footer-logo { max-height: 46px; }
.est-tc-footer-addr { flex: 1; font-weight: 700; font-size: 12px; border-left: 2px solid #1a3ea5; padding-left: 12px; }
.est-editing [contenteditable] { outline: 1px dashed #e8501e; outline-offset: 1px; min-width: 20px;
  display: inline-block; }
.est-editing [contenteditable]:focus { outline-style: solid; background: #fff7f3; }
.est-edit-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px;
  background: #fff7f3; border: 1px dashed #e8501e; border-radius: 6px; }
.est-sheet button.est-noprint { font: inherit; font-size: 11px; padding: 2px 8px; margin-top: 4px;
  border-radius: 5px; border: 1px solid #c7ccd2; background: #f6f7f9; cursor: pointer; }
.est-sheet button.est-noprint:hover { background: #eef0f3; }
.est-row-del { margin-left: 6px; margin-top: 0 !important; }
@media print {
  .est-noprint { display: none !important; }
  body * { visibility: hidden; }
  .est-print-area, .est-print-area * { visibility: visible; }
  .est-print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .est-sheet { width: auto; margin: 0; padding: 0; box-shadow: none;
    break-after: page; page-break-after: always; }
  .est-sheet:last-child { break-after: auto; page-break-after: auto; }
  @page { size: A4; margin: 12mm; }
}
`;

function EstimateSheet({ estimate, priced, pageNo }) {
  const h = estimate.header;
  const totals = computeTotals(estimate.items, h.discountPct);
  // Logo dropped by the user at frontend/public/msun-logo.png; text banner
  // until it exists (same pattern as the sidebar's octfis-logo.png).
  const [logoOk, setLogoOk] = useState(true);

  return (
    <div className="est-sheet">
      {logoOk
        ? <img className="est-logo" src="msun-logo.png" alt="MSUN Valve Pvt. Ltd." onError={() => setLogoOk(false)} />
        : <div className="est-banner">MSUN VALVE PVT. LTD.</div>}
      <div className="est-proposal-title">Techno Commercial Proposal</div>
      <table className="est-hdr">
        <tbody>
          <tr>
            <td style={{ width: '58%' }}>
              <div>To,</div>
              <div className="est-to-name">{h.to.name}</div>
              {h.to.contact && <div>{h.to.contact}</div>}
            </td>
            <td style={{ width: '42%' }}>
              <div className="est-lbl-cell">Our Offer No</div>
              <div className="est-offer-no est-ctr">{h.offerNo}</div>
              <div className="est-lbl-cell" style={{ marginTop: 4 }}>Offer Preparation Date</div>
              <div className="est-ctr">{h.date}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="est-grid">
        <thead>
          <tr>
            <th style={{ width: '6%' }}>SR. NO</th>
            <th style={{ width: priced ? '40%' : '60%' }}>DESCRIPTION OF GOODS</th>
            <th style={{ width: '12%' }}>SIZE (INCH)</th>
            <th style={{ width: '9%' }}>QTY (NOS)</th>
            {priced && <th style={{ width: '16%' }}>LIST PRICE (PER PCS)</th>}
            {priced && <th style={{ width: '17%' }}>TOTAL AMOUNT</th>}
          </tr>
        </thead>
        <tbody>
          {/* Totals live inside the grid (matches the original scanned sheet):
              TOTAL-A / DISC rows in the price columns, then a final row with
              PAGE nn + total qty + TOTAL. */}
          {estimate.items.map((it) => it.flat ? (
            <tr key={it.sr}>
              <td className="est-ctr">{it.sr}</td>
              <td>
                <div className="est-item-title">{it.title}</div>
                {it.text && <div style={{ whiteSpace: 'pre-wrap' }}>{it.text}</div>}
              </td>
              <td className="est-ctr">-</td>
              <td className="est-ctr">{it.qty}</td>
              {priced && <td className="est-num">{inr.format(it.rate)}</td>}
              {priced && <td className="est-num">{inr.format(it.total)}</td>}
            </tr>
          ) : (
            <ItemRows key={it.sr} item={it} priced={priced} />
          ))}
          {priced ? (
            <>
              <tr>
                <td /><td /><td /><td />
                <td className="est-t-lbl">TOTAL - A</td>
                <td className="est-num">{inr.format(totals.totalA)}</td>
              </tr>
              {h.discountPct != null && (
                <tr>
                  <td /><td /><td /><td />
                  <td className="est-t-lbl">DISC @ {h.discountPct}%</td>
                  <td className="est-num">{inr.format(totals.disc)}</td>
                </tr>
              )}
              <tr>
                <td />
                <td className="est-ctr est-t-final">PAGE {pageNo}</td>
                <td />
                <td className="est-ctr est-t-final">{totals.totalQty}</td>
                <td className="est-t-lbl est-t-final">TOTAL</td>
                <td className="est-num est-t-final">{inr.format(totals.net)}</td>
              </tr>
            </>
          ) : (
            <tr>
              <td />
              <td className="est-ctr est-t-final">PAGE {pageNo}</td>
              <td className="est-t-lbl">TOTAL QTY</td>
              <td className="est-ctr est-t-final">{totals.totalQty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Structured item: first size row carries Sr.No + description over every row
// (rowspan), each design group emits a highlighted header row first.
function ItemRows({ item, priced }) {
  const bodyRowCount = item.groups.reduce((n, g) => n + g.rows.length + 1, 0);
  const descCell = (
    <>
      <div className="est-item-title">{item.title}</div>
      <ul className="est-specs">
        {item.specs.map(([k, v], i) => (
          <li key={i}>{k && <span className="est-k">{k}:- </span>}{v}</li>
        ))}
      </ul>
    </>
  );
  let first = true;
  const rows = [];
  for (const g of item.groups) {
    rows.push(
      <tr className="est-design-row" key={`d-${g.design}`}>
        <td colSpan={priced ? 4 : 2}>DESIGN:- {g.design}</td>
      </tr>
    );
    for (const r of g.rows) {
      rows.push(
        <tr key={`${g.design}-${r.size}`}>
          {first && <td className="est-ctr" rowSpan={bodyRowCount}>{item.sr}</td>}
          {first && <td rowSpan={bodyRowCount}>{descCell}</td>}
          <td className="est-ctr">{r.size}{r.mm && <><br />{r.mm}</>}</td>
          <td className="est-ctr">{r.qty}</td>
          {priced && <td className="est-num">{inr.format(r.rate)}</td>}
          {priced && <td className="est-num">{inr.format(r.qty * r.rate)}</td>}
        </tr>
      );
      first = false;
    }
  }
  return rows;
}

export default function EstimatePage() {
  const [searchParams] = useSearchParams();
  const dealId = readDealId(searchParams);
  const quoteId = readParam(searchParams, 'quoteId');
  const [state, setState] = useState({ status: 'loading' });
  const [estimates, setEstimates] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [priced, setPriced] = useState(true);
  const [terms, setTermsState] = useState(loadTerms);
  const [editTerms, setEditTerms] = useState(false);
  const setTerms = (t) => { setTermsState(t); saveTerms(t); };

  // The T&C sheet is the last page — scroll to it when editing starts so the
  // in-place editor is actually visible.
  function toggleEditTerms() {
    setEditTerms((v) => {
      if (!v) setTimeout(() => document.getElementById('est-terms-sheet')?.scrollIntoView({ behavior: 'smooth' }), 0);
      return !v;
    });
  }

  useEffect(() => {
    if (quoteId) { loadQuotes([quoteId]); return; } // Quote-record button: no picker
    if (!dealId) { setState({ status: 'nodeal' }); return; }
    axios.get(`/api/crm/deal/${encodeURIComponent(dealId)}/quotes`)
      .then(({ data }) => {
        setState({ status: 'list', quotes: data });
        if (data.length === 1) loadQuotes([data[0].id], data);
      })
      .catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, quoteId]);

  function fail(err) {
    if (err.response?.status === 409 && err.response?.data?.error === 'reauth_required') {
      setState({ status: 'reauth' });
    } else {
      setState({ status: 'error' });
    }
  }

  // One sheet per quote; quotes carried along so "← Quotes" can go back.
  function loadQuotes(ids, quotes = state.quotes) {
    setState({ status: 'loadingQuote', quotes });
    Promise.all(ids.map((id) => axios.get('/api/crm/quote/' + encodeURIComponent(id))))
      .then((rs) => {
        setEstimates(rs.map((r) => buildEstimate(r.data)));
        setState({ status: 'sheet', quotes });
      })
      .catch(fail);
  }

  function toggleChecked(id) {
    setChecked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const note = (msg) => <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>{msg}</div>;

  let body;
  if (state.status === 'nodeal') body = note('Open this page from a CRM deal (missing dealId).');
  else if (state.status === 'loading' || state.status === 'loadingQuote') body = note('Loading…');
  else if (state.status === 'reauth') body = note(
    <>Connect Zoho CRM to load quotes. <a href="/server/skuapi/auth/zoho?consent=1" style={{ color: '#4f46e5', fontWeight: 600 }}>Connect CRM</a></>
  );
  else if (state.status === 'error') body = note("Couldn't load quotes for this deal.");
  else if (state.status === 'list') body = state.quotes.length === 0
    ? note('No quotes on this deal.')
    : (
      <div style={{ maxWidth: 640, margin: '32px auto', padding: '0 16px' }}>
        <h3 style={{ fontSize: 15 }}>Select quotes to print</h3>
        {state.quotes.map((q) => (
          <label key={q.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '10px 14px',
            border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer',
          }}>
            <input type="checkbox" checked={checked.has(q.id)} onChange={() => toggleChecked(q.id)} />
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5 }}>{q.Subject || q.Quote_Number || q.id}</span>
              <span style={{ display: 'block', fontSize: 12, color: '#64748b' }}>
                {[q.Quote_Number, q.Quote_Stage, q.Grand_Total != null && `₹ ${inr.format(q.Grand_Total)}`,
                  q.Created_Time?.slice(0, 10)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </label>
        ))}
        <button disabled={!checked.size}
          onClick={() => loadQuotes(state.quotes.filter((q) => checked.has(q.id)).map((q) => q.id))}
          style={{
            marginTop: 8, padding: '9px 18px', borderRadius: 8, border: 'none', font: 'inherit', fontWeight: 600,
            background: checked.size ? '#e8501e' : '#e2e8f0', color: checked.size ? '#fff' : '#94a3b8',
            cursor: checked.size ? 'pointer' : 'default',
          }}>
          View estimate{checked.size > 1 ? 's' : ''}{checked.size ? ` (${checked.size})` : ''}
        </button>
      </div>
    );
  else body = (
    <div className="est-print-area">
      {estimates.map((e, i) => (
        <EstimateSheet key={i} estimate={e} priced={priced} pageNo={String(i + 1).padStart(2, '0')} />
      ))}
      <TermsSheet terms={terms} editing={editTerms} onChange={setTerms} />
    </div>
  );

  return (
    <div style={{ background: '#eceef1', minHeight: '100%', overflow: 'auto' }}>
      <style>{CSS}</style>
      {state.status === 'sheet' && (
        <div className="est-toolbar">
          {!quoteId && state.quotes?.length > 1 && (
            <button onClick={() => setState({ status: 'list', quotes: state.quotes })}>← Quotes</button>
          )}
          <span className="est-lbl">Template</span>
          <button className={priced ? 'est-active' : ''} onClick={() => setPriced(true)}>1 · Priced</button>
          <button className={!priced ? 'est-active' : ''} onClick={() => setPriced(false)}>2 · Technical</button>
          <span className="est-spacer" />
          <button className={editTerms ? 'est-active' : ''} onClick={toggleEditTerms}>✎ Edit T&C</button>
          <button onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      )}
      {body}
    </div>
  );
}
