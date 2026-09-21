import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { TermsSheet } from './EstimateTerms.jsx';
import { CSS } from './EstimatePage.jsx';
import { normalizeTerms, DEFAULT_TERMS, SEED_TEMPLATES } from './estimateTerms.js';

// Settings → Quote T&C (CR-192). Named T&C templates for the quote print —
// terms differ customer to customer, so the print page picks one of these.
// The sheet below is the same in-place editor the print uses; here Save makes
// it permanent for the whole org. The bank/contact table is shared by every
// template. A new template starts as a copy of the one on screen.
const API = '/api/crm/estimate-terms';
const errMsg = (err) => err.response?.data?.error || err.message;

export default function EstimateTermsSettingsPage() {
  const [templates, setTemplates] = useState(null); // null = loading
  const [id, setId] = useState('');
  const [draft, setDraft] = useState(null); // { name, terms, bank } being edited
  const [busy, setBusy] = useState(false);

  async function load(selectId) {
    let { data } = await axios.get(API);
    if (!data.templates.length) {
      // First open for this org: persist the built-in Domestic/Export wording
      // so there is something real to edit. Sequential — Dev Catalyst throttles.
      for (const t of SEED_TEMPLATES) await axios.post(`${API}/templates`, { name: t.name, terms: t.terms });
      ({ data } = await axios.get(API));
    }
    const bank = normalizeTerms({ bank: data.bank || DEFAULT_TERMS.bank }).bank;
    const list = data.templates.map((t) => ({ ...t, terms: normalizeTerms(t).terms }));
    const cur = list.find((t) => t.id === selectId) || list[0];
    setTemplates(list);
    setId(cur.id);
    setDraft({ name: cur.name, terms: cur.terms, bank });
  }

  useEffect(() => { load().catch((err) => toast.error(errMsg(err))); }, []);

  const run = (fn) => async () => {
    setBusy(true);
    try { await fn(); } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  };

  const pick = (nextId) => {
    const t = templates.find((x) => x.id === nextId);
    setId(nextId);
    setDraft((d) => ({ ...d, name: t.name, terms: t.terms }));
  };

  const save = run(async () => {
    await axios.put(`${API}/templates/${id}`, { name: draft.name, terms: draft.terms });
    await axios.put(`${API}/bank`, { bank: draft.bank });
    await load(id);
    toast.success('Saved');
  });

  const addCopy = run(async () => {
    const { data } = await axios.post(`${API}/templates`, { name: `${draft.name} (copy)`, terms: draft.terms });
    await load(data.id);
  });

  const remove = run(async () => {
    if (!window.confirm(`Delete template "${draft.name}"?`)) return;
    await axios.delete(`${API}/templates/${id}`);
    await load();
  });

  if (!draft) return null;
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <style>{CSS}</style>
      <div className="est-toolbar">
        <select value={id} onChange={(e) => pick(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input value={draft.name} maxLength={80} placeholder="Template name" style={{ width: 220, cursor: 'text' }}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <button onClick={addCopy} disabled={busy}>+ New (copy of this)</button>
        <button onClick={remove} disabled={busy || templates.length < 2}>Delete</button>
        <span className="est-spacer" />
        <button className="est-active" onClick={save} disabled={busy || !draft.name.trim()}>Save</button>
      </div>
      <TermsSheet editing terms={{ ...draft, footer: '' }} defaults={{ ...draft, terms: templates.find((t) => t.id === id).terms }}
        onChange={(t) => setDraft({ ...draft, terms: t.terms, bank: t.bank })}
        hint="bank table is shared by all templates" />
    </div>
  );
}
