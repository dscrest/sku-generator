import { useState } from 'react';
import { DEFAULT_TERMS } from './estimateTerms.js';

// Terms & Conditions last page for the estimate. Editing happens in place on
// the sheet: when `editing`, cells become contentEditable (uncontrolled, saved
// on blur) and row add/remove controls appear. Data model, defaults, and
// localStorage load/save live in estimateTerms.js.

const letter = (i) => String.fromCharCode(65 + i); // A, B, C…

// Uncontrolled editable region: state updates only on blur, so React never
// re-renders mid-typing and the caret stays put.
function Ed({ editing, value, onSave, ...rest }) {
  return (
    <span {...rest} contentEditable={editing ? 'plaintext-only' : undefined}
      suppressContentEditableWarning
      onBlur={editing ? (e) => onSave(e.currentTarget.innerText) : undefined}>{value}</span>
  );
}

export function TermsSheet({ terms, editing, onChange }) {
  const [logoOk, setLogoOk] = useState(true);
  const patch = (p) => onChange({ ...terms, ...p });
  const setTerm = (i, k, v) => patch({ terms: terms.terms.map((t, j) => (j === i ? { ...t, [k]: v } : t)) });
  const setBank = (i, j, v) => patch({ bank: terms.bank.map((r, x) => (x === i ? r.map((c, y) => (y === j ? v : c)) : r)) });

  return (
    <div className={`est-sheet${editing ? ' est-editing' : ''}`} id="est-terms-sheet">
      {editing && (
        <div className="est-noprint est-edit-bar">
          <span className="est-lbl">Editing Terms &amp; Conditions (this browser only) — click any text</span>
          <span className="est-spacer" />
          <button onClick={() => onChange(DEFAULT_TERMS)}>Reset to default</button>
        </div>
      )}
      <div className="est-proposal-title" style={{ fontSize: 15 }}>General Terms &amp; Conditions</div>
      <table className="est-tc">
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
              <td style={{ whiteSpace: 'pre-wrap' }}>
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
      <div className="est-tc-footer">
        {logoOk
          ? <img className="est-tc-footer-logo" src="msun-logo.png" alt="MSUN Valve Pvt. Ltd." onError={() => setLogoOk(false)} />
          : <div className="est-banner" style={{ fontSize: 18 }}>MSUN VALVE PVT. LTD.</div>}
        <div className="est-tc-footer-addr">
          <Ed editing={editing} value={terms.footer} onSave={(v) => patch({ footer: v })} />
        </div>
      </div>
    </div>
  );
}
