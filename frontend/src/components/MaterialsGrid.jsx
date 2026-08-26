import { Fragment, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PROC_LABEL } from './woCommon.jsx';

/**
 * The Materials tab (CR-049): KPI band + overall coverage bar on top, banner
 * callouts for shortage/procurement, then one grid with instant per-line
 * actions. Reserve / Issue / Release act on the line's full cap in one click;
 * Return opens an inline row with a quantity (Issue → Main is the only return
 * route the backend supports). Every button posts the same confirmed txn the
 * old confirm bar did — just one line at a time.
 */

// ponytail: instant actions always move the line's full cap; partial amounts
// only exist on Return. Add per-line qty inputs back if partial moves return.
const VERB = { reserve: 'Reserved', dereserve: 'Released', issue: 'Issued', return: 'Returned' };

export default function MaterialsGrid({ workOrderId, fgs, procStatus, onChanged }) {
  const navigate = useNavigate();
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [grid, setGrid] = useState(null);
  const [filter, setFilter] = useState('all');       // all | short | reserve | covered
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(null);            // itemId | 'bulk' while a txn runs
  const [returnFor, setReturnFor] = useState(null);  // itemId with the return row open
  const [retQty, setRetQty] = useState('');

  function load(id = fgId) {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/wo/${workOrderId}/grid`, { params: { fgId: id } })
      .then(({ data }) => setGrid(data))
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the grid'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(fgId); /* eslint-disable-next-line */ }, [fgId, workOrderId]);

  // Refresh = re-pull stock/PO numbers from Zoho, then re-read the grid. full=true
  // sweeps the whole catalog so a Zoho inventory adjustment / opening stock on any
  // item is reflected (the default refresh only covers items on open work orders).
  async function syncStock(full = false) {
    setSyncing(true);
    try {
      await axios.post('/api/wo/refresh', null, { params: full ? { full: 1 } : {} });
      if (full) toast.success('Stock synced from Zoho');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Stock sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const rows = grid?.rows || [];

  const tot = useMemo(() => rows.reduce(
    (t, r) => ({
      req: t.req + r.bom, res: t.res + r.reserved, iss: t.iss + r.issued,
      short: t.short + (r.short ? r.shortfallQty : 0),
    }),
    { req: 0, res: 0, iss: 0, short: 0 },
  ), [rows]);
  const pct = tot.req ? Math.min(100, Math.round(100 * (tot.res + tot.iss) / tot.req)) : 0;

  const counts = useMemo(() => ({
    all: rows.length,
    short: rows.filter(r => r.short).length,
    reserve: rows.filter(r => r.reservable > 0).length,
    covered: rows.filter(r => r.needed === 0).length,
  }), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'short' && !r.short) return false;
      if (filter === 'reserve' && !(r.reservable > 0)) return false;
      if (filter === 'covered' && r.needed !== 0) return false;
      if (q && !(r.name || '').toLowerCase().includes(q) && !(r.sku || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  async function doTxn(type, requested, itemId) {
    setBusy(itemId ?? 'bulk');
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/txn`, { fgId, type, requested, confirm: true });
      toast.success(
        data.transferOrderNumber
          ? `${VERB[type]} — Transfer Order ${data.transferOrderNumber} created`
          : `${VERB[type]} — ${data.txnNumber}`,
      );
      setReturnFor(null); setRetQty('');
      load();
      onChanged?.();
    } catch (err) {
      const d = err.response?.data;
      // Every problem at once, so the whole form is fixed in one pass.
      (d?.details || [d?.error || 'Could not complete the action']).forEach(m => toast.error(m, { duration: 6000 }));
    } finally {
      setBusy(null);
    }
  }

  // "Reserve everything available" — one txn covering every reservable line in view.
  function reserveAll() {
    const requested = visible.filter(r => r.reservable > 0).map(r => ({ itemId: r.itemId, qty: r.reservable }));
    if (!requested.length) return toast('Nothing can be reserved on these lines yet');
    doTxn('reserve', requested, null);
  }

  if (!fgs.length) return <Empty>Add a finished good to this work order first.</Empty>;

  const missingUnits = tot.short;
  const chips = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'short', label: 'Short', n: counts.short },
    { key: 'reserve', label: 'To reserve', n: counts.reserve },
    { key: 'covered', label: 'Covered', n: counts.covered },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'auto' }}>
      {/* utility row: finished good + sync */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 0', flexWrap: 'wrap' }}>
        {fgs.length > 1 && (
          <select value={fgId || ''} onChange={e => setFgId(e.target.value)} style={select}>
            {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
          </select>
        )}
        {grid?.lastSyncAt && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Stock last synced {grid.lastSyncAt} · BOM revision {grid.revision}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => syncStock(false)} disabled={syncing} style={btn}>{syncing ? 'Syncing…' : '⟳ Refresh stock'}</button>
        <button onClick={() => syncStock(true)} disabled={syncing} title="Pull current stock for every item — reflects Zoho inventory adjustments / opening stock" style={btn}>Sync all</button>
      </div>

      {/* KPI band + overall coverage */}
      <div style={{ padding: '12px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <Kpi label="Required" value={tot.req} />
          <Kpi label="Reserved" value={tot.res} color="var(--blue)" />
          <Kpi label="Issued" value={tot.iss} color="#16a34a" />
          <Kpi label="Short (to buy)" value={tot.short} color={tot.short > 0 ? '#b91c1c' : '#16a34a'} />
        </div>
        <div style={{ background: 'var(--bg-secondary)', height: 6, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--blue), #16a34a)', borderRadius: 999 }} />
        </div>
      </div>

      {grid && !grid.warehousesConfigured && (
        <Banner tone="warn">
          Warehouses are not configured yet — material cannot be moved. Set the Main, Reserve and Issue
          warehouses in <b>Settings</b> (account menu, top right).
        </Banner>
      )}
      {grid?.shortCount > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, margin: '12px 20px 0', padding: '10px 14px',
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            {grid.shortCount} item{grid.shortCount === 1 ? ' is' : 's are'} short — {missingUnits.toLocaleString()} units must be bought before this order can be covered.
          </div>
          <button onClick={() => navigate('/wo/purchase')}
            style={{ ...btn, background: '#b45309', borderColor: '#b45309', color: '#fff', fontWeight: 600, flexShrink: 0 }}>
            Request purchase
          </button>
        </div>
      )}
      {procStatus && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, margin: '12px 20px 0', padding: '10px 14px',
          background: 'var(--blue-light)', border: '1px solid var(--blue-border)', borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>
            Procurement is under way for this work order — {PROC_LABEL[procStatus] || procStatus}.
          </div>
          <button onClick={() => navigate('/wo/purchase')}
            style={{ ...btn, color: 'var(--blue)', borderColor: 'var(--blue-border)', fontWeight: 600, flexShrink: 0 }}>
            Track in Purchase request
          </button>
        </div>
      )}

      {/* filter chips + search + bulk reserve */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 10px', flexWrap: 'wrap' }}>
        {chips.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)} style={chipStyle(filter === c.key)}>
            {c.label} <span style={{ fontWeight: 700 }}>{c.n}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reserve: Main → Reserve WH · Issue: Reserve → Issue WH</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Find an item or code"
          style={{ ...select, width: 180, maxWidth: 180 }}
        />
        <button onClick={reserveAll} disabled={busy === 'bulk'}
          style={{ ...btn, background: 'var(--blue)', borderColor: 'var(--blue)', color: '#fff', fontWeight: 600 }}>
          {busy === 'bulk' ? 'Reserving…' : 'Reserve everything available'}
        </button>
      </div>

      <div style={{ padding: '0 20px 20px' }}>
        {loading ? <Empty>Loading…</Empty> : !rows.length ? (
          <Empty>No BOM lines yet — import the BOM on the <b>BOM</b> tab.</Empty>
        ) : !visible.length ? (
          <Empty>No lines match this filter.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Item</th>
                <th style={th} title="What this work order needs in total: per-unit BOM × finished-good quantity.">Req</th>
                <th style={th} title="On hand in the Main warehouse right now.">Stock</th>
                <th style={th} title="Sitting in the Reserve warehouse for this work order.">Reserved</th>
                <th style={th} title="Sent to production, net of anything returned.">Issued</th>
                <th style={th} title="Quantity ordered from vendors for this work order.">On order</th>
                <th style={th} title="What cannot be covered from stock or open POs.">Short</th>
                <th style={{ ...th, textAlign: 'left' }}>Status</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 210 }} />
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const [st, tone] = lineStatus(r);
                const rowBusy = busy === r.itemId;
                return (
                  <Fragment key={r.itemId}>
                    <tr style={{ borderBottom: returnFor === r.itemId ? 'none' : '1px solid var(--border)' }}>
                      <td style={{ ...num, textAlign: 'left', fontFamily: 'var(--font)' }}>
                        <div style={{ fontWeight: 500 }}>{r.name || r.itemId}</div>
                        {r.sku && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.sku}{r.uom ? ` · ${r.uom}` : ''}</div>}
                      </td>
                      <td style={{ ...num, fontWeight: 600 }}>{r.bom.toLocaleString()}</td>
                      <td style={num}>{r.stock.toLocaleString()}</td>
                      <td style={{ ...num, color: r.reserved > 0 ? 'var(--blue)' : undefined, fontWeight: r.reserved > 0 ? 600 : 400 }}>{r.reserved.toLocaleString()}</td>
                      <td style={{ ...num, color: r.issued > 0 ? '#15803d' : undefined, fontWeight: r.issued > 0 ? 600 : 400 }}>{r.issued.toLocaleString()}</td>
                      <td style={{ ...num, color: r.po > 0 ? '#b45309' : 'var(--text-muted)' }}>{(r.po || 0).toLocaleString()}</td>
                      <td style={{ ...num, fontWeight: r.short ? 700 : 400, color: r.short ? '#b91c1c' : 'var(--text-muted)' }}>{(r.short ? r.shortfallQty : 0).toLocaleString()}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, color: tone, background: `${tone}18`, whiteSpace: 'nowrap' }}>{st}</span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {r.reservable > 0 && (
                            <button disabled={rowBusy} onClick={() => doTxn('reserve', [{ itemId: r.itemId, qty: r.reservable }], r.itemId)}
                              style={{ ...actBtn, background: 'var(--blue-light)', borderColor: 'var(--blue-border)', color: 'var(--blue)' }}>
                              Reserve {r.reservable.toLocaleString()}
                            </button>
                          )}
                          {r.reserved > 0 && (
                            <button disabled={rowBusy} onClick={() => doTxn('issue', [{ itemId: r.itemId, qty: r.reserved }], r.itemId)}
                              style={{ ...actBtn, background: '#effaf2', borderColor: '#c9e5d2', color: '#15803d' }}>
                              Issue {r.reserved.toLocaleString()}
                            </button>
                          )}
                          {r.reserved > 0 && (
                            <button disabled={rowBusy} title="Release the reservation back to the Main warehouse"
                              onClick={() => doTxn('dereserve', [{ itemId: r.itemId, qty: r.reserved }], r.itemId)}
                              style={actBtn}>
                              Release
                            </button>
                          )}
                          {r.issued > 0 && (
                            <button disabled={rowBusy}
                              onClick={() => { setReturnFor(returnFor === r.itemId ? null : r.itemId); setRetQty(String(r.issued)); }}
                              style={actBtn}>
                              Return
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {returnFor === r.itemId && (
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-page)' }}>
                        <td colSpan={9} style={{ padding: '10px 14px', borderTop: '1px dashed var(--border-mid)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <b>Return</b>
                            <input
                              type="number" min="1" max={r.issued} step="any" value={retQty}
                              onChange={e => setRetQty(e.target.value)}
                              style={{ width: 80, padding: '5px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)' }}
                            />
                            <span style={{ color: 'var(--text-muted)' }}>of {r.issued.toLocaleString()} issued, back to the Main warehouse</span>
                            <button disabled={rowBusy || !(Number(retQty) > 0) || Number(retQty) > r.issued}
                              onClick={() => doTxn('return', [{ itemId: r.itemId, qty: Number(retQty) }], r.itemId)}
                              style={{ ...actBtn, background: 'var(--blue)', borderColor: 'var(--blue)', color: '#fff' }}>
                              {rowBusy ? 'Returning…' : 'Confirm return'}
                            </button>
                            <button onClick={() => setReturnFor(null)} style={{ ...actBtn, border: 'none', background: 'transparent', color: 'var(--text-muted)' }}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Per-line state pill, worst problem first: short beats covered beats actionable.
function lineStatus(r) {
  if (r.short) return ['Short', '#b91c1c'];
  if (r.needed === 0) return [r.issued >= r.bom ? 'Issued' : 'Covered', '#15803d'];
  if (r.reservable > 0) return ['To reserve', '#2563eb'];
  return ['Waiting stock', '#64748b'];
}

function Kpi({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color, fontFamily: 'var(--font-mono)' }}>{value.toLocaleString()}</div>
    </div>
  );
}

const num = { padding: '8px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' };
const th = {
  padding: '9px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  textTransform: 'uppercase', letterSpacing: '0.03em',
};
const btn = {
  padding: '7px 12px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
const actBtn = {
  padding: '5px 10px', fontSize: 12, fontWeight: 600, background: 'var(--bg-card)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  color: 'var(--text-secondary)', whiteSpace: 'nowrap',
};
const select = {
  padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', maxWidth: 320,
};
function chipStyle(active) {
  return {
    padding: '5px 12px', fontSize: 12, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? 'var(--blue)' : 'var(--border)'}`,
    background: active ? 'var(--blue-light)' : 'var(--bg-card)',
    color: active ? 'var(--blue)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400,
  };
}

export function Empty({ children }) {
  return <div style={{ padding: 24, fontSize: 13, color: 'var(--text-muted)' }}>{children}</div>;
}

export function Banner({ tone = 'info', children }) {
  const c = tone === 'warn' ? { bg: '#fffbeb', fg: '#92400e', bd: '#fde68a' } : { bg: '#eff6ff', fg: '#1e40af', bd: '#bfdbfe' };
  return (
    <div style={{ margin: '10px 20px 0', padding: '9px 12px', fontSize: 12, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, borderRadius: 'var(--radius-md)' }}>
      {children}
    </div>
  );
}
