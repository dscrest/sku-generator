import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

/**
 * The Materials grid — one screen, four actions.
 *
 * Reserve, De-reserve, Issue and Return share this table, these columns and
 * this Confirm button. Picking an action only changes which cap applies and
 * what the editable "Qty" column means, so a user learns one screen and can do
 * four jobs. Everything else on screen stays put.
 */

const ACTIONS = [
  { key: 'reserve', label: 'Reserve', verb: 'Reserve', capKey: 'reservable', capLabel: 'Reservable [H]',
    move: 'Main → Reserve warehouse', help: 'Set aside stock for this work order. Capped by what is on hand.' },
  { key: 'dereserve', label: 'De-reserve', verb: 'Release', capKey: 'reserved', capLabel: 'Reserved [C]',
    move: 'Reserve → Main warehouse', help: 'Release material this work order no longer needs.' },
  { key: 'issue', label: 'Issue', verb: 'Issue', capKey: 'reserved', capLabel: 'Reserved [C]',
    move: 'Reserve → Issue warehouse', help: 'Send reserved material to production.' },
  { key: 'return', label: 'Return', verb: 'Return', capKey: 'issued', capLabel: 'Issued [D]',
    move: 'Issue → Main warehouse', help: 'Send unused issued material back to stock.' },
];

// Column letters match the BRD so the grid can be checked against it line by
// line; the tooltip is the plain-English version for everyone else.
const COLS = [
  { key: 'bom', label: 'BOM [A]', help: 'What this work order needs: per-unit BOM quantity × finished-good quantity.' },
  { key: 'stock', label: 'Stock [B]', help: 'On hand in the Main warehouse right now.' },
  { key: 'reserved', label: 'Reserved [C]', help: 'Sitting in the Reserve warehouse for this work order.' },
  { key: 'issued', label: 'Issued [D]', help: 'Sent to production, net of anything returned.' },
  { key: 'po', label: 'PO [E]', help: 'Quantity ordered from vendors for this work order.' },
  { key: 'received', label: 'Received [F]', help: 'Quantity received against those purchase orders.' },
  { key: 'billed', label: 'Billed [G]', help: 'Quantity the vendor has billed.' },
  { key: 'reservable', label: 'Reservable [H]', help: 'What you can still reserve: A − C − D − G, capped by stock on hand.' },
  { key: 'extraReserved', label: 'Extra Reserved [I]', help: 'A + C − D − G, as defined in the BRD.' },
];

const num = { padding: '7px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' };
const th = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#fff', textAlign: 'right',
  background: '#1e3a5f', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: 'help',
};

export default function MaterialsGrid({ workOrderId, fgs, onChanged }) {
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [action, setAction] = useState('reserve');
  const [grid, setGrid] = useState(null);
  const [qty, setQty] = useState({});          // itemId -> typed quantity
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const act = ACTIONS.find(a => a.key === action);

  function load(id = fgId) {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/wo/${workOrderId}/grid`, { params: { fgId: id } })
      .then(({ data }) => { setGrid(data); setQty({}); })
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the grid'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(fgId); /* eslint-disable-next-line */ }, [fgId, workOrderId]);

  const rows = grid?.rows || [];
  const entered = useMemo(
    () => Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([itemId, v]) => ({ itemId, qty: Number(v) })),
    [qty],
  );

  // Fill every row with the most it can take — the "reserve everything I can"
  // case, which is what the store team does most mornings.
  function fillAll() {
    const next = {};
    for (const r of rows) {
      const cap = r[act.capKey];
      if (cap > 0) next[r.itemId] = String(cap);
    }
    setQty(next);
    if (!Object.keys(next).length) toast(`Nothing can be ${act.verb.toLowerCase()}d on this list yet`);
  }

  async function confirm() {
    if (!entered.length) return toast.error('Enter a quantity on at least one line');
    setBusy(true);
    try {
      const { data } = await axios.post(`/api/wo/${workOrderId}/txn`, {
        fgId, type: action, requested: entered, confirm: true,
      });
      toast.success(
        data.transferOrderNumber
          ? `${act.verb}d — Transfer Order ${data.transferOrderNumber} created`
          : `${act.verb}d — ${data.txnNumber}`,
      );
      load();
      onChanged?.();
    } catch (err) {
      const d = err.response?.data;
      // Every problem at once, so the whole form is fixed in one pass.
      (d?.details || [d?.error || 'Could not complete the action']).forEach(m => toast.error(m, { duration: 6000 }));
    } finally {
      setBusy(false);
    }
  }

  if (!fgs.length) return <Empty>Add a finished good to this work order first.</Empty>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* action selector — the only thing that changes between the four jobs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {fgs.length > 1 && (
          <select value={fgId || ''} onChange={e => setFgId(e.target.value)} style={select}>
            {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => { setAction(a.key); setQty({}); }}
              title={a.help}
              style={{
                padding: '7px 14px', fontSize: 13, border: 'none', cursor: 'pointer',
                background: a.key === action ? 'var(--blue)' : 'var(--bg-card)',
                color: a.key === action ? '#fff' : 'var(--text-secondary)',
                fontWeight: a.key === action ? 600 : 400,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{act.move}</span>
        <div style={{ flex: 1 }} />
        <button onClick={fillAll} style={btn}>Fill maximum</button>
        <button onClick={() => load()} style={btn}>⟳ Refresh</button>
        <button
          onClick={confirm}
          disabled={busy || !entered.length}
          style={{
            ...btn, background: entered.length ? 'var(--blue)' : 'var(--bg-card)',
            color: entered.length ? '#fff' : 'var(--text-muted)', borderColor: entered.length ? 'var(--blue)' : 'var(--border)',
            fontWeight: 600, cursor: entered.length && !busy ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? 'Working…' : `Confirm ${act.label}${entered.length ? ` (${entered.length})` : ''}`}
        </button>
      </div>

      {grid && !grid.warehousesConfigured && (
        <Banner tone="warn">
          Warehouses are not configured yet — material cannot be moved. Set the Main, Reserve and Issue
          warehouses in <b>Work Order → Settings</b>.
        </Banner>
      )}
      {grid?.lastSyncAt && (
        <div style={{ padding: '6px 20px', fontSize: 12, color: 'var(--text-muted)' }}>
          Stock last synced {grid.lastSyncAt} · BOM revision {grid.revision}
          {grid.shortCount > 0 && <> · <span style={{ color: '#dc2626', fontWeight: 600 }}>{grid.shortCount} item(s) short</span></>}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px 20px' }}>
        {loading ? <Empty>Loading…</Empty> : !rows.length ? (
          <Empty>No BOM lines yet — import the BOM on the <b>BOM</b> tab.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Item</th>
                {COLS.map(c => <th key={c.key} style={th} title={c.help}>{c.label}</th>)}
                <th style={{ ...th, background: '#0f2942', minWidth: 110 }} title={`Maximum: ${act.capLabel}`}>
                  {act.verb} Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cap = r[act.capKey];
                const typed = Number(qty[r.itemId] || 0);
                const over = typed > cap;
                return (
                  <tr key={r.itemId} style={{ borderBottom: '1px solid var(--border)', background: r.short ? '#fef2f2' : 'transparent' }}>
                    <td style={{ ...num, textAlign: 'left', fontFamily: 'var(--font)' }}>
                      <div style={{ fontWeight: 500 }}>{r.name || r.itemId}</div>
                      {r.sku && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.sku}</div>}
                      {r.short && (
                        <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>
                          Short by {r.shortfallQty} — raise a purchase request
                        </div>
                      )}
                    </td>
                    {COLS.map(c => (
                      <td key={c.key} style={{
                        ...num,
                        color: c.key === 'reservable' && r[c.key] > 0 ? '#16a34a' : undefined,
                        fontWeight: c.key === act.capKey ? 700 : 400,
                      }}>
                        {r[c.key]}
                      </td>
                    ))}
                    <td style={{ ...num, padding: '4px 8px' }}>
                      <input
                        type="number" min="0" max={cap} step="any"
                        value={qty[r.itemId] ?? ''}
                        onChange={e => setQty(q => ({ ...q, [r.itemId]: e.target.value }))}
                        placeholder={cap > 0 ? `max ${cap}` : '—'}
                        disabled={cap <= 0}
                        title={cap > 0 ? `Up to ${cap} (${act.capLabel})` : `Nothing to ${act.verb.toLowerCase()} on this line`}
                        style={{
                          width: 96, padding: '5px 8px', fontSize: 13, textAlign: 'right',
                          fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius-sm)',
                          border: `1px solid ${over ? '#dc2626' : 'var(--border)'}`,
                          background: cap <= 0 ? 'var(--bg-page)' : 'var(--bg-card)',
                          color: over ? '#dc2626' : 'inherit',
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
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

export { ACTIONS, COLS };
