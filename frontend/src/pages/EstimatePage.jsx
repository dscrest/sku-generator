import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { readDealId, readParam } from '../components/CrmInfoCard';
import { buildEstimate, computeTotals } from './estimateParser';
import { TermsSheet, HeadBand, FootBand } from './EstimateTerms.jsx';
import { loadTerms, saveTerms, DEFAULT_TERMS, EXPORT_TERMS } from './estimateTerms.js';

// Estimate ("Techno Commercial Proposal") print page. Two CRM entry points:
// a Deal button (/#/estimate?dealId=<id>) lists the deal's Quotes with
// checkboxes — ticked quotes print one sheet each, page-break between — and a
// Quote button (/#/estimate?quoteId=<id>) renders that quote directly. Sheet is
// a port of estimate-prototype/msun-estimate.html with two templates —
// A–F priced / A–D technical — and native window.print().

const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "Version of templates" dropdown. standard = grouped items, no totals page;
// with-total = grouped items + CALCULATION FOR OFFER page; export = standard
// items but the export T&C page (EXPORT_TERMS); trading = no same-name grouping,
// one row per CRM line.
const TEMPLATE_VERSIONS = [
  { key: 'standard', label: 'Standard' },
  { key: 'with-total', label: 'With Total' },
  { key: 'export', label: 'Export' },
  { key: 'trading', label: 'All Item - Trading' },
];

// Prototype CSS, page-scoped with an est- prefix. Print: hide everything but
// the sheet (WoPrintSheet visibility trick — the sheet lives inside app chrome).
// Theme (colors/typography) follows estimate-prototype/Sales_Order_Template.html:
// Inter, teal #0F7576 primary, tints #EAF2F1/#EFF5F4, borders #D8E5E4.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800;900&display=swap');
.est-toolbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); }
.est-toolbar .est-spacer { flex: 1; }
.est-toolbar button, .est-toolbar select { font: inherit; font-size: 13px; padding: 7px 14px; border-radius: var(--radius-md);
  border: 1px solid var(--border-mid); background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; }
.est-toolbar button:hover { background: var(--bg); }
.est-toolbar button.est-active { background: #0F7576; border-color: #0F7576; color: #fff; }
.est-toolbar .est-lbl { font-size: 12px; color: var(--text-secondary); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.est-sheet { background: #fff; width: 210mm; max-width: 100%; margin: 18px auto; padding: 12mm 10mm;
  box-shadow: 0 2px 14px rgba(0,0,0,.12); font-size: 12px; line-height: 1.35; color: #222;
  font-family: 'Inter', -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  box-sizing: border-box; min-height: 297mm; display: flex; flex-direction: column;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.est-grid { margin-bottom: 10px; }
/* Detail rows: vertical column lines only — horizontal lines stay on the item
   boundary, the heading, and the totals rows. */
.est-grid tbody[data-item] td { border-top: 0; border-bottom: 0; }
.est-grid tbody[data-item] tr:first-child td { border-top: 1px solid #D8E5E4; }
.est-banner { font-size: 26px; font-weight: 900; color: #0F7576; letter-spacing: -0.5px; }
/* Company band at the top of every page (Sales Order template header). */
.est-head-band { display: flex; justify-content: space-between; align-items: center; gap: 16px;
  background: #EAF2F1; border-left: 6px solid #0F7576; border-radius: 8px;
  padding: 12px 16px; margin-bottom: 8px; }
.est-head-band > div:first-child { flex: 1; display: flex; justify-content: center; }
.est-head-addr { text-align: right; color: #444; line-height: 1.5; }
.est-head-addr b { color: #111; }
.est-head-co { font-weight: 800; color: #111; }
.est-logo { display: block; max-height: 96px; max-width: 100%; margin: 0 auto; }
/* Header band prints on the first page only; continuation sheets omit it.
   ponytail: budget uses full chrome for every page, so continuation pages
   under-fill by ~1 band height — safe (never overflows). */
.est-print-area .est-sheet:not(:first-child) .est-head-band { display: none; }
/* ISO certificate strip pinned to the sheet bottom (sheet is a flex column).
   The image is a drop-in: absent frontend/public/iso-certs.png renders nothing. */
.est-foot-band { margin-top: auto; width: 100%; }
.est-proposal-title { text-align: center; font-weight: 800; color: #0F7576; text-transform: uppercase;
  letter-spacing: 1.2px; margin: 4px 0 8px; font-size: 14px; }
.est-sheet table { width: 100%; border-collapse: collapse; }
.est-hdr td { border: 1px solid #D8E5E4; background: #fff; padding: 4px 7px; vertical-align: top; }
.est-hdr .est-to-name { font-size: 15px; font-weight: 700; color: #111; }
.est-hdr .est-offer-no { color: #0F7576; font-weight: 800; }
.est-hdr .est-hdr-lbl { font-weight: 400; color: #555; }
.est-grid { margin-top: 6px; }
.est-grid th, .est-grid td { border: 1px solid #D8E5E4; padding: 3px 6px; vertical-align: top; }
.est-grid th { background: #0F7576; color: #fff; border-color: #0F7576; font-size: 11px;
  font-weight: 700; text-transform: uppercase; letter-spacing: .8px; }
.est-grid tbody { break-inside: avoid; page-break-inside: avoid; }
.est-num { text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.est-ctr { text-align: center; white-space: nowrap; }
.est-item-title { font-weight: 700; color: #111; text-decoration: underline; }
.est-specs { list-style: none; margin: 4px 0 0; padding: 0; }
.est-specs li { line-height: 1.5; }
.est-specs .est-k { font-weight: 700; }
.est-grid .est-t-lbl { font-weight: 700; text-align: center; text-transform: uppercase; white-space: nowrap; background: #EFF5F4; }
.est-grid .est-t-final { font-weight: 800; }
/* Grand-total band, as the Sales Order template's totals-grand-row. */
.est-grid tr.est-t-band td { background: #0F7576; color: #fff; border-color: #0F7576; }
.est-tc { margin-top: 10px; }
.est-tc td { border: 1px solid #D8E5E4; padding: 4px 7px; vertical-align: top; }
.est-tc .est-tc-lbl { font-weight: 700; text-decoration: underline; width: 24%; background: #EFF5F4; }
.est-tc-bank td { width: 25%; }
.est-tc-bank .est-tc-lbl { text-decoration: none; }
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
  .est-sheet { width: auto; margin: 0; padding: 0; box-shadow: none; min-height: 272mm;
    break-after: page; page-break-after: always; }
  .est-sheet:last-child { break-after: auto; page-break-after: auto; }
  @page { size: A4; margin: 12mm; }
}
`;

// Company band + page title + To/Offer header table, shared by the item
// sheets and the calculation summary sheet.
function SheetChrome({ h, title, onLogoLoad }) {
  return (
    <div className="est-chrome">
      <HeadBand onLogoLoad={onLogoLoad} />
      <div className="est-proposal-title">{title}</div>
      <table className="est-hdr">
        <tbody>
          <tr>
            <td style={{ width: '58%' }}>
              <div>To,</div>
              <div className="est-to-name">{h.to.name}</div>
              {h.to.address && <div>{h.to.address}</div>}
              {(h.to.phone || h.to.email) && <div>{[h.to.phone, h.to.email].filter(Boolean).join(' · ')}</div>}
              {h.to.gstin && <div><b>GSTIN:</b> {h.to.gstin}</div>}
              {h.to.contact && <div>{[h.to.contact, h.to.mobile].filter(Boolean).join(' | ')}</div>}
            </td>
            <td style={{ width: '42%' }}>
              <div><span className="est-hdr-lbl">Our Offer No :</span> <span className="est-offer-no">{h.offerNo}</span></div>
              <div style={{ marginTop: 4 }}><span className="est-hdr-lbl">Offer Preparation Date :</span> <b>{h.date}</b></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// A physical A4 page: repeated header chrome, this page's items, and a gross
// PAGE total computed from this page's items only. Discount appears solely on
// the CalcSheet (with-total version).
// Item pages are identical across template versions; versions differ only in
// parsing (trading skips grouping) and the CalcSheet page (with-total only).
function EstimateSheet({ estimate, items, priced, pageNo, onLogoLoad }) {
  const h = estimate.header;
  const totals = computeTotals(items, null);

  return (
    <div className="est-sheet">
      <SheetChrome h={h} title="Techno Commercial Proposal" onLogoLoad={onLogoLoad} />

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
        {/* One tbody per item — the pagination measure pass reads their
            heights via [data-item]. */}
        {items.map((it) => (
          <tbody key={it.sr} data-item>
            {it.flat ? (
              <tr>
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
              <ItemRows item={it} priced={priced} />
            )}
          </tbody>
        ))}
        <tbody data-totals>
          {priced ? (
            <tr className="est-t-band">
              <td />
              <td className="est-ctr est-t-final">PAGE {pageNo}</td>
              <td />
              <td className="est-ctr est-t-final">{totals.totalQty}</td>
              <td className="est-t-lbl est-t-final">TOTAL</td>
              <td className="est-num est-t-final">{inr.format(totals.totalA)}</td>
            </tr>
          ) : (
            <tr className="est-t-band">
              <td />
              <td className="est-ctr est-t-final">PAGE {pageNo}</td>
              <td className="est-t-lbl">TOTAL QTY</td>
              <td className="est-ctr est-t-final">{totals.totalQty}</td>
            </tr>
          )}
        </tbody>
      </table>
      <FootBand onLoad={onLogoLoad} />
    </div>
  );
}

// "CALCULATION FOR OFFER" summary sheet (reference PDF page 05): one row per
// item per printed page (PAG nn spans a multi-item page), then grand
// qty/amount, discount, and final basic amount across every printed page.
function CalcSheet({ estimates, pages, priced, pageNo }) {
  const pcts = [...new Set(estimates.map((e) => e.header.discountPct).filter(Boolean))];
  const grand = { totalA: 0, totalQty: 0, disc: 0, net: 0 };
  for (const e of estimates) {
    const t = computeTotals(e.items, e.header.discountPct);
    grand.totalA += t.totalA; grand.totalQty += t.totalQty;
    grand.disc += t.disc; grand.net += t.net;
  }
  const bold = { color: '#111', fontWeight: 800 };
  return (
    <div className="est-sheet">
      <SheetChrome h={estimates[0].header} title="CALCULATION FOR OFFER" />
      <table className="est-grid">
        <thead>
          <tr>
            <th style={{ width: '14%' }}>PAG NO.</th>
            <th>DESCRIPTION OF GOOD</th>
            <th style={{ width: '14%' }}>TOTAL QTY</th>
            {priced && <th style={{ width: '20%' }}>TOTAL AMOUNT</th>}
          </tr>
        </thead>
        <tbody>
          {pages.map((p, k) => p.items.map((it, j) => {
            const t = computeTotals([it], null);
            return (
              <tr key={`${k}-${j}`}>
                {j === 0 && (
                  <td className="est-ctr" style={{ fontWeight: 700 }} rowSpan={p.items.length}>
                    PAG {String(k + 1).padStart(2, '0')}
                  </td>
                )}
                <td className="est-ctr" style={{ fontWeight: 700 }}>{it.title}</td>
                <td className="est-ctr">{t.totalQty}</td>
                {/* Amount is clubbed per page: one cell spanning the page's
                    item rows, mirroring the PAG cell. */}
                {priced && j === 0 && (
                  <td className="est-num" style={{ verticalAlign: 'middle' }} rowSpan={p.items.length}>
                    {inr.format(computeTotals(p.items, null).totalA)}
                  </td>
                )}
              </tr>
            );
          }))}
          <tr>
            <td colSpan={2} className="est-t-lbl" style={{ textAlign: 'right' }}>Total Qty &amp; Amount</td>
            <td className="est-ctr" style={bold}>{grand.totalQty}</td>
            {priced && <td className="est-num" style={bold}>{inr.format(grand.totalA)}</td>}
          </tr>
          {priced && grand.disc > 0 && (
            <tr>
              <td colSpan={2} className="est-t-lbl" style={{ textAlign: 'right' }}>
                Discount{pcts.length === 1 ? ` @${pcts[0]}%` : ''}
              </td>
              <td />
              <td className="est-num" style={{ fontWeight: 700 }}>{inr.format(grand.disc)}</td>
            </tr>
          )}
          {priced && (
            <tr className="est-t-band">
              <td colSpan={2} className="est-t-lbl" style={{ textAlign: 'right' }}>Final Basic Amount</td>
              <td />
              <td className="est-num est-t-final">{inr.format(grand.net)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="est-ctr" style={{ fontWeight: 800 }}>PAGE {pageNo}</div>
      <FootBand />
    </div>
  );
}

// ── pagination ───────────────────────────────────────────────────────────────
// CSS page-breaking can't produce per-page totals, so pages are composed here:
// a hidden measure pass renders every estimate as one full sheet, item tbody
// heights are read back, and items are greedily packed into A4-sized pages.
// Each page then renders as a complete sheet whose totals cover only its own
// items. Page numbers run continuously across all selected quotes.

const MM = 96 / 25.4; // CSS px per mm
const PAGE_PX = (297 - 24) * MM; // A4 content height inside the 12mm @page margins
const SLACK_PX = 16; // screen sheet is ~4mm wider than print; absorb wrap drift

function EstimatePages({ estimates, priced, version }) {
  const [pages, setPages] = useState(null);
  const measureRef = useRef(null);
  const remeasured = useRef(new Set()); // one re-run per image (logo, ISO strip)

  useLayoutEffect(() => { setPages(null); }, [estimates, priced, version]);

  useLayoutEffect(() => {
    if (pages || !measureRef.current) return;
    const out = [];
    measureRef.current.querySelectorAll('.est-sheet').forEach((sheet, ei) => {
      const budget = PAGE_PX - SLACK_PX
        - sheet.querySelector('.est-chrome').offsetHeight
        - sheet.querySelector('thead').offsetHeight
        - sheet.querySelector('[data-totals]').offsetHeight
        - (sheet.querySelector('.est-foot-band')?.offsetHeight || 0);
      let cur = [];
      let used = 0;
      sheet.querySelectorAll('[data-item]').forEach((el, ii) => {
        const hpx = el.offsetHeight;
        if (cur.length && used + hpx > budget) {
          out.push({ ei, items: cur });
          cur = [];
          used = 0;
        }
        // ponytail: an item taller than a whole page overflows naturally —
        // no intra-item pagination.
        cur.push(estimates[ei].items[ii]);
        used += hpx;
      });
      if (cur.length) out.push({ ei, items: cur });
    });
    setPages(out);
  }, [pages, estimates, priced]);

  // Header logo and ISO strip each trigger one re-measure once loaded, so the
  // budget includes their real heights (guarded by src — load fires per mount).
  const onLogoLoad = (e) => {
    const src = e?.target?.src || '';
    if (!remeasured.current.has(src)) { remeasured.current.add(src); setPages(null); }
  };

  if (!pages) return (
    <div ref={measureRef} aria-hidden="true"
      style={{ position: 'absolute', left: -9999, top: 0, visibility: 'hidden' }}>
      {estimates.map((e, i) => (
        <EstimateSheet key={i} estimate={e} items={e.items} priced={priced} pageNo="00"
          onLogoLoad={onLogoLoad} />
      ))}
    </div>
  );
  return (
    <>
      {pages.map((p, k) => (
        <EstimateSheet key={k} estimate={estimates[p.ei]} items={p.items} priced={priced}
          pageNo={String(k + 1).padStart(2, '0')} onLogoLoad={onLogoLoad} />
      ))}
      {pages.length > 0 && version === 'with-total' && (
        <CalcSheet estimates={estimates} pages={pages} priced={priced}
          pageNo={String(pages.length + 1).padStart(2, '0')} />
      )}
    </>
  );
}

// Structured item: first size row carries Sr.No + description over every row
// (rowspan). Design group headers are not rendered — only the size rows.
function ItemRows({ item, priced }) {
  const bodyRowCount = item.groups.reduce((n, g) => n + g.rows.length, 0);
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
  // Sr + description rowspan cells must ride on the very first emitted row —
  // a design header row included — or every later row shifts one column right
  // and the rowspan spills into the totals rows.
  let first = true;
  const lead = () => {
    if (!first) return null;
    first = false;
    return (
      <>
        <td className="est-ctr" rowSpan={bodyRowCount}>{item.sr}</td>
        <td rowSpan={bodyRowCount}>{descCell}</td>
      </>
    );
  };
  const rows = [];
  for (const g of item.groups) {
    for (const [ri, r] of g.rows.entries()) {
      rows.push(
        <tr key={`${g.design}-${r.size}-${ri}`}>
          {lead()}
          <td className="est-ctr">{r.size}{r.mm && <><br />{r.mm}</>}</td>
          <td className="est-ctr">{r.qty}</td>
          {priced && <td className="est-num">{inr.format(r.rate)}</td>}
          {priced && <td className="est-num">{inr.format(r.qty * r.rate)}</td>}
        </tr>
      );
    }
  }
  return rows;
}

// Revision metadata for a quote — screen-only (est-noprint, never printed),
// persisted per quote in this browser's localStorage.
function RevFields({ quoteId, label }) {
  const key = 'estimateRev:' + quoteId;
  const [v, setV] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
  });
  const set = (patch) => {
    const n = { ...v, ...patch };
    setV(n);
    localStorage.setItem(key, JSON.stringify(n));
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {label && <b style={{ fontSize: 12 }}>{label}</b>}
      <label style={{ fontSize: 12 }}>Revision Date{' '}
        <input type="date" value={v.revDate || ''} onChange={(e) => set({ revDate: e.target.value })} />
      </label>
      <label style={{ fontSize: 12 }}>Revision No{' '}
        <input type="text" size={8} value={v.revNo || ''} onChange={(e) => set({ revNo: e.target.value })} />
      </label>
    </span>
  );
}

export default function EstimatePage() {
  const [searchParams] = useSearchParams();
  const dealId = readDealId(searchParams);
  const quoteId = readParam(searchParams, 'quoteId');
  const [state, setState] = useState({ status: 'loading' });
  const [rawQuotes, setRawQuotes] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [priced, setPriced] = useState(true);
  const [version, setVersion] = useState('with-total');
  const [terms, setTermsState] = useState(() => loadTerms(false));
  const [exportTerms, setExportTermsState] = useState(() => loadTerms(true));
  const [editTerms, setEditTerms] = useState(false);
  // Export version prints the export T&C preset; both sets edit + persist
  // independently so touching one never clobbers the other.
  const isExport = version === 'export';
  const activeTerms = isExport ? exportTerms : terms;
  const setActiveTerms = (t) => {
    (isExport ? setExportTermsState : setTermsState)(t);
    saveTerms(t, isExport);
  };

  // Trading lists every CRM line as its own row; re-parse when toggled.
  const estimates = useMemo(
    () => rawQuotes.map((q) => buildEstimate(q, { merge: version !== 'trading' })),
    [rawQuotes, version],
  );

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
        setRawQuotes(rs.map((r) => r.data));
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
                {[q.Quote_No || q.Quote_Number, q.Quote_Stage, q.Grand_Total != null && `₹ ${inr.format(q.Grand_Total)}`,
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
    <>
      <div className="est-noprint" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'center', padding: '10px 16px' }}>
        {rawQuotes.map((q) => (
          <RevFields key={q.id} quoteId={q.id}
            label={rawQuotes.length > 1 ? (q.Quote_No || q.Quote_Number || q.id) : ''} />
        ))}
      </div>
      <div className="est-print-area">
        <EstimatePages estimates={estimates} priced={priced} version={version} />
        <TermsSheet terms={activeTerms} defaults={isExport ? EXPORT_TERMS : DEFAULT_TERMS}
          editing={editTerms} onChange={setActiveTerms} />
      </div>
    </>
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
          <span className="est-lbl">Version</span>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {TEMPLATE_VERSIONS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
          <span className="est-spacer" />
          <button className={editTerms ? 'est-active' : ''} onClick={toggleEditTerms}>✎ Edit T&C</button>
          <button onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      )}
      {body}
    </div>
  );
}
