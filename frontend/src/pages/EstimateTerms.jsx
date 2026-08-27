import { useState } from 'react';
import { DEFAULT_TERMS } from './estimateTerms.js';

// Terms & Conditions last page for the estimate. Editing happens in place on
// the sheet: when `editing`, cells become contentEditable (uncontrolled, saved
// on blur) and row add/remove controls appear. Data model, defaults, and
// localStorage load/save live in estimateTerms.js.

const letter = (i) => String.fromCharCode(65 + i); // A, B, C…

// Company identity band at the top of every printed page (Sales-Order-template
// header style): centered logo left, address block right. Lives here (not in
// EstimatePage) so both files can use it without a circular import.
const COMPANY = {
  name: 'MSUN VALVE PRIVATE LIMITED',
  lines: [
    'Plot No.B-10,Swastik Industrial Park,',
    'Kothiya Kunha Road,Kunha Patiya,Ta-Daskroi,',
    'Ahmedabad, Gujarat, India',
    'M: 91-9512506161',
    'E: sales@msunvalve.com · sales@marutivalves.com',
  ],
  gstin: '24AAQCM4066R1ZN',
  pan: 'AAQCM4066R',
};

export function HeadBand({ onLogoLoad }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="est-head-band">
      <div>
        {logoOk
          ? <img className="est-logo" src="msun_Invoicelogo_FINAL_LOGO.Png" alt="MSUN Valve Pvt. Ltd."
              onLoad={onLogoLoad} onError={() => setLogoOk(false)} />
          : <div className="est-banner">MSUN VALVE PVT. LTD.</div>}
      </div>
      <div className="est-head-addr">
        <div className="est-head-co">{COMPANY.name}</div>
        {COMPANY.lines.map((l, i) => <div key={i}>{l}</div>)}
        <div><b>GSTIN:</b> {COMPANY.gstin}</div>
        <div><b>PAN:</b> {COMPANY.pan}</div>
      </div>
    </div>
  );
}

// Shared column widths for a sheet's stacked main/filler/totals tables
// (table-layout: fixed) — one source so the vertical rules line up exactly.
export function Cols({ widths }) {
  return (
    <colgroup>
      {widths.map((w, i) => <col key={i} style={w ? { width: w } : undefined} />)}
    </colgroup>
  );
}

// Single-row table stretched by the sheet's flex column (.est-fill-table is
// flex:1): its one row takes all the leftover height, drawing only the
// vertical column rules — the empty ruled space above the totals band.
export function FillTable({ widths, className = 'est-grid' }) {
  return (
    <table className={`${className} est-fill-table`} aria-hidden="true">
      <Cols widths={widths} />
      <tbody><tr>{widths.map((_, i) => <td key={i} />)}</tr></tbody>
    </table>
  );
}

// Certification logos pinned to the bottom of every printed sheet (CR-058):
// IAF · IAS · IBR · ISO as individual images. A logo that fails to load drops
// out alone (zero width, pagination unaffected).
const FOOT_LOGOS = ['IAF - LOGO.jpeg', 'IAS - LOGO.jpeg', 'IBR APPROVED - LOGO.jpeg', 'ISO - 9002-2015 - LOGO.png'];

export function FootBand({ onLoad }) {
  const [hidden, setHidden] = useState([]);
  return (
    <div className="est-foot-band">
      {FOOT_LOGOS.filter(f => !hidden.includes(f)).map(f => (
        <img key={f} src={f} alt="" onLoad={onLoad}
          onError={() => setHidden(h => [...h, f])} />
      ))}
    </div>
  );
}

// Row accents per the reference PDF (Estimate_Version_02 T&C page): delivery /
// transit-damage red, payment / freight blue, validity enlarged bold.
// ponytail: keyword match on the label so user-edited text keeps its color.
function termStyle(label) {
  if (/delivery|transit/i.test(label)) return { color: '#0F7576', fontWeight: 800 };
  if (/payment|freight/i.test(label)) return { color: '#0F7576', fontWeight: 700 };
  if (/validity/i.test(label)) return { fontWeight: 700, fontSize: 14 };
  return undefined;
}

// Uncontrolled editable region: state updates only on blur, so React never
// re-renders mid-typing and the caret stays put. Values are HTML fragments so
// bold/color survive; ponytail: worst case is self-XSS — terms only round-trip
// through this browser's localStorage, never the server.
function Ed({ editing, value, onSave, ...rest }) {
  return (
    <span {...rest} contentEditable={editing || undefined}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: value }}
      onBlur={editing ? (e) => onSave(e.currentTarget.innerHTML) : undefined} />
  );
}

// Bold/color controls for the selection inside an Ed span. onMouseDown
// preventDefault keeps the text selection alive while the button is clicked.
// ponytail: execCommand is deprecated but universal; swap for Range spans only
// if a browser actually drops it. Fixed swatches beat <input type=color> here —
// the native picker steals focus and loses the selection.
const SWATCHES = ['#111111', '#0F7576', '#C0392B', '#1A5FB4'];
function FormatBar() {
  const cmd = (name, arg) => (e) => { e.preventDefault(); document.execCommand(name, false, arg); };
  return (
    <>
      <button style={{ fontWeight: 800 }} title="Bold selection" onMouseDown={cmd('bold')}>B</button>
      {SWATCHES.map((color) => (
        <button key={color} title={`Color selection ${color}`} onMouseDown={cmd('foreColor', color)}
          style={{ background: color, width: 18, height: 18, padding: 0, border: '1px solid #c7ccd2', borderRadius: 4 }} />
      ))}
    </>
  );
}

export function TermsSheet({ terms, editing, onChange, defaults = DEFAULT_TERMS }) {
  const patch = (p) => onChange({ ...terms, ...p });
  const setTerm = (i, k, v) => patch({ terms: terms.terms.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  const setBank = (i, j, v) => patch({ bank: terms.bank.map((r, x) => (x === i ? r.map((c, y) => (y === j ? v : c)) : r)) });

  return (
    <div className={`est-sheet${editing ? ' est-editing' : ''}`} id="est-terms-sheet">
      {editing && (
        <div className="est-noprint est-edit-bar">
          <span className="est-lbl">Editing Terms &amp; Conditions (this browser only) — select text, then:</span>
          <FormatBar />
          <span className="est-spacer" />
          <button onClick={() => onChange(defaults)}>Reset to default</button>
        </div>
      )}
      <HeadBand />
      <div className="est-proposal-title" style={{ fontSize: 15 }}>General Terms &amp; Conditions</div>
      <table className="est-tc">
        <Cols widths={['24%', null]} />
        <tbody>
          {terms.terms.map((t, i) => (
            <tr key={i}>
              <td className="est-tc-lbl">
                {letter(i)}. <Ed editing={editing} value={t.label} onSave={(v) => setTerm(i, 'label', v)} />
                {editing && (
                  <button className="est-noprint est-row-del" title="Remove term"
                    onClick={() => patch({ terms: terms.terms.filter((_, j) => j !== i) })}>✕</button>
                )}
              </td>
              <td style={{ whiteSpace: 'pre-wrap', ...termStyle(t.label) }}>
                <Ed editing={editing} value={t.text} onSave={(v) => setTerm(i, 'text', v)} style={{ display: 'block' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <button className="est-noprint" onClick={() => patch({ terms: [...terms.terms, { label: '', text: '' }] })}>
          + Add term
        </button>
      )}
      {/* Absorbs leftover page height so the bank table and footer strip sit
          at the page bottom. */}
      <FillTable widths={['24%', null]} className="est-tc" />
      <table className="est-tc est-tc-bank">
        <tbody>
          {terms.bank.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j % 2 ? '' : 'est-tc-lbl est-ctr'}>
                  <Ed editing={editing} value={c} onSave={(v) => setBank(i, j, v)} />
                  {editing && j === 3 && (
                    <button className="est-noprint est-row-del" title="Remove row"
                      onClick={() => patch({ bank: terms.bank.filter((_, x) => x !== i) })}>✕</button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <button className="est-noprint" onClick={() => patch({ bank: [...terms.bank, ['', '', '', '']] })}>
          + Add row
        </button>
      )}
      <FootBand />
    </div>
  );
}
