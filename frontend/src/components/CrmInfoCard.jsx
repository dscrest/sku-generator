import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

// Shows the originating Zoho CRM Deal when the generator is opened from a CRM
// custom link button (/#/sku/generator?dealId=<id>). Read-only context, never
// blocks the generator: if CRM isn't authorized yet it offers a one-time
// reconnect through the Zoho consent screen (?consent=1) so the not-yet-granted
// ZohoCRM scope is actually added.
const C = {
  bgElev: '#ffffff', border: '#e2e8f0', ink: '#0f172a', ink3: '#64748b',
  ink4: '#94a3b8', accent: '#4f46e5', warnSoft: '#fffbeb', warn: '#b45309',
};
const shadowSm = '0 1px 2px rgba(15,23,42,0.04), 0 1px 4px rgba(15,23,42,0.04)';

const lookup = (v) => (v && typeof v === 'object' ? v.name : v) || null;

// HashRouter's useSearchParams only sees the query INSIDE the hash
// (/app/#/sku/...?dealId=). Zoho link buttons often put it BEFORE the hash
// (/app/?dealId=...#/sku/...) — read both so either form works.
export function readParam(searchParams, key) {
  return (
    (searchParams && searchParams.get(key)) ||
    new URLSearchParams(window.location.search).get(key) ||
    ''
  );
}

export function readDealId(searchParams) {
  return readParam(searchParams, 'dealId');
}

export default function CrmInfoCard({ dealId }) {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    if (!dealId) return;
    setState({ status: 'loading' });
    axios.get('/api/crm/deal/' + encodeURIComponent(dealId))
      .then(({ data }) => setState({ status: 'ok', deal: data }))
      .catch((err) => {
        if (err.response?.status === 409 && err.response?.data?.error === 'reauth_required') {
          setState({ status: 'reauth' });
        } else if (err.response?.status === 404) {
          setState({ status: 'notfound' });
        } else {
          setState({ status: 'error' });
        }
      });
  }, [dealId]);

  const card = {
    background: C.bgElev, border: `1px solid ${C.border}`, borderRadius: 12,
    padding: '16px 20px', boxShadow: shadowSm, marginBottom: 14,
  };
  const eyebrow = {
    fontSize: 11, fontWeight: 600, color: C.ink4, textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: 10,
  };

  if (state.status === 'loading') {
    return <div style={card}><div style={eyebrow}>CRM Info</div>
      <div style={{ height: 14, width: 180, background: '#f1f5f9', borderRadius: 6 }} /></div>;
  }

  if (state.status === 'reauth') {
    return <div style={card}><div style={eyebrow}>CRM Info</div>
      <div style={{ fontSize: 13, color: C.ink3 }}>
        Connect Zoho CRM to show deal details.{' '}
        <a href="/server/skuapi/auth/zoho?consent=1" style={{ color: C.accent, fontWeight: 600 }}>Connect CRM</a>
      </div></div>;
  }

  if (state.status === 'notfound' || state.status === 'error') {
    return <div style={card}><div style={eyebrow}>CRM Info</div>
      <div style={{ fontSize: 13, color: C.ink4 }}>Couldn't load deal {dealId}.</div></div>;
  }

  const d = state.deal || {};
  const amount = typeof d.Amount === 'number' ? d.Amount.toLocaleString() : lookup(d.Amount);
  const rows = [
    ['Deal Name', d.Deal_Name],
    ['Account Name', lookup(d.Account_Name)],
    ['Contact', lookup(d.Contact_Name)],
    ['Stage', d.Stage],
    ['Amount', amount],
    ['Owner', lookup(d.Owner)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div style={card}>
      <div style={eyebrow}>CRM Info</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 24px' }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: C.ink4, marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Link to={`/estimate?dealId=${encodeURIComponent(dealId)}`}
          style={{ fontSize: 13, color: C.accent, fontWeight: 600 }}>
          Print Estimate →
        </Link>
      </div>
    </div>
  );
}
