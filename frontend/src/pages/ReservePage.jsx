import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

const th = {
  padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#fff', textAlign: 'right',
  background: '#1e3a5f', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
};
const td = { padding: '8px 12px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' };

const COLS = [
  { key: 'bom', label: 'BOM [A]' },
  { key: 'stock', label: 'Stock on Hand [B]' },
  { key: 'reserved', label: 'Reserved [C]' },
  { key: 'issued', label: 'Issued [D]' },
  { key: 'po', label: 'PO [E]' },
  { key: 'received', label: 'Received [F]' },
  { key: 'billed', label: 'Billed [G]' },
  { key: 'reservable', label: 'Reservable [H=A−C−D−G|B]' },
  { key: 'extraReserved', label: 'Extra Reserved [I=A+C−D−G]' },
];

function errInfo(err) {
  return {
    status: err.response?.status,
    code: err.response?.data?.error,
    message: err.response?.data?.message || err.response?.data?.error || 'Request failed',
  };
}

export default function ReservePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const soId = searchParams.get('soId');

  const [soQuery, setSoQuery] = useState('');
  const [soList, setSoList] = useState(null);
  const [so, setSo] = useState(null);
  const [fgItemId, setFgItemId] = useState(null);
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState(null); // 'reauth' | 'disabled' | error text

  function handleErr(err) {
    const { status, code, message } = errInfo(err);
    if (status === 409 && code === 'reauth_required') setBlocked('reauth');
    else if (status === 403) setBlocked('disabled');
    else toast.error(message);
  }

  // SO picker (no soId in the URL yet)
  useEffect(() => {
    if (soId) return;
    setSo(null); setFgItemId(null); setGrid(null);
    const t = setTimeout(() => {
      axios.get('/api/reserve/sales-orders', { params: soQuery ? { q: soQuery } : {} })
        .then(({ data }) => setSoList(data))
        .catch(handleErr);
    }, 300);
    return () => clearTimeout(t);
  }, [soId, soQuery]);

  // SO header + FG selector
  useEffect(() => {
    if (!soId) return;
    setSo(null); setFgItemId(null); setGrid(null); setBlocked(null);
    axios.get(`/api/reserve/so/${soId}`)
      .then(({ data }) => {
        setSo(data);
        if (data.lineItems.length) setFgItemId(data.lineItems[0].itemId);
      })
      .catch(handleErr);
  }, [soId]);

  function loadGrid(fg) {
    setLoading(true);
    axios.get('/api/reserve/grid', { params: { soId, fgItemId: fg } })
      .then(({ data }) => setGrid(data))
      .catch(handleErr)
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    if (soId && fgItemId) loadGrid(fgItemId);
  }, [soId, fgItemId]);

  async function refresh() {
    setSyncing(true);
    try {
      await axios.post('/api/reserve/sync');
      if (fgItemId) loadGrid(fgItemId);
      toast.success('Stock refreshed from Zoho');
    } catch (err) {
      handleErr(err);
    } finally {
      setSyncing(false);
    }
  }

  if (blocked === 'reauth') {
    return (
      <Center>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Reconnect Zoho to enable Inventory access</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          The Reserve module reads warehouses, composite items and stock from Zoho Inventory. Your current
          connection was authorized before that permission was added — reconnect once to grant it.
        </div>
        <a href="/server/skuapi/auth/zoho" style={{
          display: 'inline-block', padding: '8px 16px', background: 'var(--blue)', color: '#fff',
          borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
        }}>Reconnect Zoho</a>
      </Center>
    );
  }
  if (blocked === 'disabled') {
    return (
      <Center>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Reserve / De-reserve is not enabled</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          This add-on is not enabled for your organization. Contact OCTFIS to enable it.
        </div>
      </Center>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          Reserve / De-reserve{so ? ` — ${so.number}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {soId && (
            <button onClick={() => setSearchParams({})} style={btn}>‹ Sales orders</button>
          )}
          {soId && (
            <button onClick={refresh} disabled={syncing} style={btn}>
              {syncing ? 'Refreshing…' : '⟳ Refresh stock'}
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {!soId ? (
          <div style={{ maxWidth: 640 }}>
            <input
              value={soQuery}
              onChange={e => setSoQuery(e.target.value)}
              placeholder="Search sales orders by number…"
              style={{
                width: '100%', padding: '9px 12px', fontSize: 13, marginBottom: 12,
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
              }}
            />
            {!soList ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</div>
            ) : !soList.length ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No sales orders found.</div>
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {soList.map(s => (
                  <div
                    key={s.id}
                    className="list-row"
                    onClick={() => setSearchParams({ soId: s.id })}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{s.number}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.customerName}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.date}</span>
                    <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)' }}>{s.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !so ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading sales order…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>FG Item: </span>
                <select value={fgItemId || ''} onChange={e => setFgItemId(e.target.value)} style={{
                  padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', maxWidth: 380,
                }}>
                  {so.lineItems.map(l => (
                    <option key={l.itemId} value={l.itemId}>{l.name} × {l.quantity}</option>
                  ))}
                </select>
              </div>
              {grid && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  SO FG Qty: <b>{grid.fgQty}</b>
                  {grid.lastSyncAt && <> · Last stock sync: {grid.lastSyncAt}</>}
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading BOM & stock… (first open fetches live from Zoho)</div>
            ) : grid && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }}>Items</th>
                      {COLS.map(c => <th key={c.key} style={th}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.rows.map(r => (
                      <tr key={r.itemId} style={{ borderBottom: '1px solid var(--border)', background: r.short ? '#fee2e2' : 'transparent' }}>
                        <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font)' }}>
                          <div style={{ fontWeight: 500 }}>{r.name}</div>
                          {r.sku && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>SKU: {r.sku}</div>}
                          {r.short && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Shortage — reorder from vendor</div>}
                        </td>
                        {COLS.map(c => (
                          <td key={c.key} style={{ ...td, color: c.key === 'reservable' && r[c.key] > 0 ? '#16a34a' : undefined, fontWeight: c.key === 'reservable' ? 600 : 400 }}>
                            {r[c.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                  Read-only preview — Reserve / Issue / Return actions arrive with the next phase.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const btn = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', fontSize: 12,
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', color: 'var(--text-muted)',
};

function Center({ children }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '28px 32px' }}>
        {children}
      </div>
    </div>
  );
}
