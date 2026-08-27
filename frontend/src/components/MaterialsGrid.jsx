import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

/**
 * The Materials grid — one screen, four actions.
 *
 * Reserve, De-reserve, Issue and Return share this table, these columns and
 * this confirm bar. Picking an action only changes which cap applies and what
 * the editable "now" column means, so a user learns one screen and can do four
 * jobs. Everything else on screen stays put.
 *
 * The layout is the plain-language reservation view: a shortage warning bar,
 * filter chips, a per-line coverage bar, per-line MAX buttons, and a live
 * confirm bar pinned to the bottom. Every number comes straight from the grid
 * payload — coverage and the chip categories are derived on the client.
 */

const ACTIONS = [
  { key: 'reserve', label: 'Reserve', verb: 'Reserve', gerund: 'Reserving', capKey: 'reservable',
    move: 'Main → Reserve warehouse', help: 'Set aside stock for this work order. Capped by what is on hand.' },
  { key: 'dereserve', label: 'De-reserve', verb: 'Release', gerund: 'Releasing', capKey: 'reserved',
    move: 'Reserve → Main warehouse', help: 'Release material this work order no longer needs.' },
  { key: 'issue', label: 'Issue', verb: 'Issue', gerund: 'Issuing', capKey: 'reserved',
    move: 'Reserve → Issue warehouse', help: 'Send reserved material to production.' },
  { key: 'return', label: 'Return', verb: 'Return', gerund: 'Returning', capKey: 'issued',
    move: 'Issue → Main warehouse', help: 'Send unused issued material back to stock.' },
];

// The four core columns (Needed / In stock / Reserved / Issued) and the coverage
// bar are always shown. COLS are the extra BRD-reconciliation columns, hidden by
// default and revealed through the column picker for anyone who wants them.
const COLS = [
  { key: 'po', label: 'PO', help: 'Quantity ordered from vendors for this work order.' },
  { key: 'received', label: 'Received', help: 'Quantity received against those purchase orders.' },
  { key: 'billed', label: 'Billed', help: 'Quantity the vendor has billed.' },
  { key: 'reservable', label: 'Reservable', help: 'What you can still reserve: A − C − D − G, capped by stock on hand.' },
  { key: 'extraReserved', label: 'Extra reserved', help: 'A + C − D − G, as defined in the BRD.' },
];

// Bumped from 'materialsGridCols' so the new hidden-by-default optional columns
// take effect for everyone; old saved configs referenced columns that are now
// structural. ponytail: one-time reset, no migration needed.
const COL_STORAGE_KEY = 'materialsGridCols2';
const defaultCfg = () => COLS.map(c => ({ key: c.key, visible: false }));

// Reconcile any saved config against the current COLS so editing COLS in code
// can never corrupt a saved preference: drop unknown keys, append new ones.
function loadColCfg() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY) || 'null');
    if (!Array.isArray(saved)) return defaultCfg();
    const known = new Set(COLS.map(c => c.key));
    const kept = saved.filter(s => s && known.has(s.key)).map(s => ({ key: s.key, visible: s.visible === true }));
    const missing = COLS.filter(c => !kept.some(s => s.key === c.key)).map(c => ({ key: c.key, visible: false }));
    return [...kept, ...missing];
  } catch { return defaultCfg(); }
}

const num = { padding: '8px 10px', fontSize: 13, textAlign: 'right', fontFamily: 'var(--font-mono)' };
const th = {
  padding: '9px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right',
  background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  textTransform: 'uppercase', letterSpacing: '0.03em',
};

export default function MaterialsGrid({ workOrderId, fgs, onChanged }) {
  const navigate = useNavigate();
  const [fgId, setFgId] = useState(fgs[0]?.id || null);
  const [action, setAction] = useState('reserve');
  const [grid, setGrid] = useState(null);
  const [qty, setQty] = useState({});          // itemId -> typed quantity
  const [sel, setSel] = useState(() => new Set());   // itemIds ticked for bulk fill
  const [filter, setFilter] = useState('all');       // all | short | covered | left
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [colCfg, setColCfg] = useState(loadColCfg);   // applied column config
  const [draftCfg, setDraftCfg] = useState(null);     // picker working copy (null = closed)
  const [dragKey, setDragKey] = useState(null);
  const act = ACTIONS.find(a => a.key === action);

  const visibleCols = useMemo(
    () => colCfg.filter(c => c.visible).map(c => COLS.find(col => col.key === c.key)).filter(Boolean),
    [colCfg],
  );

  function applyCols() {
    setColCfg(draftCfg);
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(draftCfg));
    setDraftCfg(null);
  }
  function dropCol(targetKey) {
    setDraftCfg(cfg => {
      const next = [...cfg];
      const from = next.findIndex(c => c.key === dragKey);
      const to = next.findIndex(c => c.key === targetKey);
      if (from < 0 || to < 0 || from === to) return cfg;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragKey(null);
  }

  function load(id = fgId) {
    if (!id) return;
    setLoading(true);
    axios.get(`/api/wo/${workOrderId}/grid`, { params: { fgId: id } })
      .then(({ data }) => { setGrid(data); setQty({}); setSel(new Set()); })
      .catch(err => toast.error(err.response?.data?.error || 'Could not load the grid'))
      .finally(() => setLoading(false));
  }
  useEffect(() => { load(fgId); /* eslint-disable-next-line */ }, [fgId, workOrderId]);

  // Refresh = re-pull stock/PO numbers from Zoho, then re-read the grid.
  async function syncStock() {
    setSyncing(true);
    try {
      await axios.post('/api/wo/refresh');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Stock sync failed');
    } finally {
      setSyncing(false);
    }
  }

  const rows = grid?.rows || [];

  // A line still needs reserving when it isn't fully covered; for the other
  // actions the actionable set is simply "there's a cap to act on".
  const hasHeadroom = r => (action === 'reserve' ? r.needed > 0 : r[act.capKey] > 0);
  const counts = useMemo(() => ({
    all: rows.length,
    short: rows.filter(r => r.short).length,
    covered: rows.filter(r => r.needed === 0).length,
    left: rows.filter(hasHeadroom).length,
  }), [rows, action]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'short' && !r.short) return false;
      if (filter === 'covered' && r.needed !== 0) return false;
      if (filter === 'left' && !hasHeadroom(r)) return false;
      if (q && !(r.name || '').toLowerCase().includes(q) && !(r.sku || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search, action]);

  const entered = useMemo(
    () => Object.entries(qty).filter(([, v]) => Number(v) > 0).map(([itemId, v]) => ({ itemId, qty: Number(v) })),
    [qty],
  );
  const enteredUnits = entered.reduce((s, e) => s + e.qty, 0);
  const missingUnits = rows.reduce((s, r) => s + (r.short ? r.shortfallQty : 0), 0);

  // Fill the most each line can take — the "reserve everything I can" case. Scoped
  // to whatever the user is looking at: ticked rows if any, else the current filter.
  function fillAvailable() {
    const target = sel.size ? visible.filter(r => sel.has(r.itemId)) : visible;
    const next = { ...qty };
    let any = false;
    for (const r of target) {
      const cap = r[act.capKey];
      if (cap > 0) { next[r.itemId] = String(cap); any = true; }
    }
    setQty(next);
    if (!any) toast(`Nothing can be ${act.verb.toLowerCase()}d on these lines yet`);
  }

  const toggleRow = useCallback((itemId) => {
    setSel(s => { const n = new Set(s); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  }, []);
  const setRowQty = useCallback((itemId, v) => setQty(q => ({ ...q, [itemId]: v })), []);
  const allTicked = visible.length > 0 && visible.every(r => sel.has(r.itemId));
  function toggleAll() {
    setSel(s => {
      const n = new Set(s);
      if (allTicked) visible.forEach(r => n.delete(r.itemId));
      else visible.forEach(r => n.add(r.itemId));
      return n;
    });
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

  const leftLabel = `Left to ${act.verb.toLowerCase()}`;
  const chips = [
    { key: 'all', label: 'All', n: counts.all },
    { key: 'short', label: 'Short', n: counts.short },
    { key: 'covered', label: 'Fully covered', n: counts.covered },
    { key: 'left', label: leftLabel, n: counts.left },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* action selector — the only thing that changes between the four jobs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
        {fgs.length > 1 && (
          <select
            value={fgId || ''}
            onChange={e => {
              // Switching FG reloads the grid and clears typed quantities — ask first.
              if (entered.length && !window.confirm('Switching the finished good clears the quantities you typed. Continue?')) return;
              setFgId(e.target.value);
            }}
            style={select}
          >
            {fgs.map(f => <option key={f.id} value={f.id}>{f.name} × {f.qty}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {ACTIONS.map(a => (
            <button
              key={a.key}
              onClick={() => {
                if (a.key === action) return;
                // Same guard: the typed quantities belong to the current action.
                if (entered.length && !window.confirm(`Switching to ${a.label} clears the quantities you typed. Continue?`)) return;
                setAction(a.key); setQty({}); setSel(new Set());
              }}
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
        <button onClick={syncStock} disabled={syncing} style={btn}>{syncing ? 'Syncing…' : '⟳ Refresh stock'}</button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setDraftCfg(draftCfg ? null : colCfg)} title="Columns" aria-label="Columns"
            style={{ ...btn, display: 'inline-flex', alignItems: 'center', padding: '7px 10px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
          {draftCfg && (
            <>
              {/* click-away backdrop */}
              <div onClick={() => setDraftCfg(null)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 21, width: 240,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
              }}>
                <div style={{ padding: '4px 8px 8px', fontSize: 11, color: 'var(--text-muted)' }}>Extra columns</div>
                <div style={{ maxHeight: 320, overflow: 'auto' }}>
                  {draftCfg.map(c => {
                    const col = COLS.find(x => x.key === c.key);
                    if (!col) return null;
                    return (
                      <label
                        key={c.key}
                        draggable
                        onDragStart={() => setDragKey(c.key)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => dropCol(c.key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', fontSize: 13,
                          borderRadius: 'var(--radius-sm)', cursor: 'grab',
                          background: dragKey === c.key ? 'var(--bg-page)' : 'transparent',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)', display: 'flex' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
                        </span>
                        <input
                          type="checkbox"
                          checked={c.visible}
                          onChange={() => setDraftCfg(cfg => cfg.map(x => x.key === c.key ? { ...x, visible: !x.visible } : x))}
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setDraftCfg(defaultCfg())} style={{ ...btn, flex: 1 }}>Reset</button>
                  <button onClick={() => setDraftCfg(null)} style={{ ...btn, flex: 1 }}>Cancel</button>
                  <button onClick={applyCols} style={{ ...btn, flex: 1, background: 'var(--blue)', color: '#fff', borderColor: 'var(--blue)', fontWeight: 600 }}>Apply</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {grid && !grid.warehousesConfigured && (
        <Banner tone="warn">
          Warehouses are not configured yet — material cannot be moved. Set the Main, Reserve and Issue
          warehouses in <b>Settings</b> (account menu, top right).
        </Banner>
      )}

      {/* shortage warning bar — what can't be fully reserved, and the way out */}
      {grid?.shortCount > 0 && (
        <div style={{
          margin: '10px 20px 0', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)',
        }}>
          <span style={{ fontSize: 16 }} aria-hidden>⚠️</span>
          <div style={{ flex: 1, fontSize: 13, color: '#92400e' }}>
            <b>{grid.shortCount} item{grid.shortCount === 1 ? '' : 's'} can’t be fully reserved — {missingUnits.toLocaleString()} units missing.</b>{' '}
            You can still reserve what’s available now.
          </div>
          <button
            onClick={() => setFilter('short')}
            style={{ ...btn, background: 'var(--bg-card)', borderColor: '#fcd34d', color: '#92400e' }}>
            Show short items
          </button>
          <button
            onClick={() => navigate('/wo/purchase')}
            style={{ ...btn, background: '#b45309', borderColor: '#b45309', color: '#fff', fontWeight: 600 }}>
            Request purchase
          </button>
        </div>
      )}

      {/* filter chips + search + bulk fill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px 4px', flexWrap: 'wrap' }}>
        {chips.map(c => (
          <button key={c.key} onClick={() => setFilter(c.key)} style={chipStyle(filter === c.key)}>
            {c.label} <span style={{ fontWeight: 700 }}>{c.n}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Find an item or code"
          style={{ ...select, width: 220, maxWidth: 220 }}
        />
        <button onClick={fillAvailable} style={{ ...btn, background: 'var(--blue)', borderColor: 'var(--blue)', color: '#fff', fontWeight: 600 }}>
          {act.verb} everything available
        </button>
      </div>

      {grid?.lastSyncAt && (
        <div style={{ padding: '2px 20px 8px', fontSize: 12, color: 'var(--text-muted)' }}>
          Stock last synced {grid.lastSyncAt} · BOM revision {grid.revision}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
        {loading ? <Empty>Loading…</Empty> : !rows.length ? (
          <Empty>No BOM lines yet — import the BOM on the <b>BOM</b> tab.</Empty>
        ) : !visible.length ? (
          <Empty>No lines match this filter.</Empty>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'center', width: 34 }}>
                  <input type="checkbox" checked={allTicked} onChange={toggleAll} aria-label="Select all" />
                </th>
                <th style={{ ...th, textAlign: 'left' }}>Item</th>
                <th style={th} title="What this work order needs in total: per-unit BOM × finished-good quantity.">Needed</th>
                <th style={th} title="On hand in the Main warehouse right now.">In stock</th>
                <th style={th} title="Sitting in the Reserve warehouse for this work order.">Reserved</th>
                <th style={th} title="Sent to production, net of anything returned.">Issued</th>
                {visibleCols.map(c => <th key={c.key} style={th} title={c.help}>{c.label}</th>)}
                <th style={{ ...th, textAlign: 'left', minWidth: 150 }}>Coverage</th>
                <th style={{ ...th, textAlign: 'right', minWidth: 130 }}>{act.verb} now</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <GridRow
                  key={r.itemId} r={r} act={act} visibleCols={visibleCols}
                  qtyVal={qty[r.itemId] ?? ''} ticked={sel.has(r.itemId)}
                  onToggle={toggleRow} onQty={setRowQty}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* live confirm bar — pinned; nothing commits until pressed */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
        borderTop: '1px solid var(--border)', background: 'var(--bg-card)',
      }}>
        <div style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
          {entered.length ? (
            <>
              <b style={{ color: 'var(--text-primary)' }}>{act.gerund} {enteredUnits.toLocaleString()} units across {entered.length} line{entered.length === 1 ? '' : 's'}</b>
              <span style={{ color: 'var(--text-muted)' }}> · {act.move}</span>
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Enter a quantity or press MAX to {act.verb.toLowerCase()} a line.</span>
          )}
        </div>
        <button onClick={() => setQty({})} disabled={!entered.length} style={{ ...btn, opacity: entered.length ? 1 : 0.5 }}>
          Discard changes
        </button>
        <button
          onClick={confirm}
          disabled={busy || !entered.length}
          style={{
            ...btn, background: entered.length ? 'var(--blue)' : 'var(--bg-card)',
            color: entered.length ? '#fff' : 'var(--text-muted)', borderColor: entered.length ? 'var(--blue)' : 'var(--border)',
            fontWeight: 600, cursor: entered.length && !busy ? 'pointer' : 'not-allowed', padding: '8px 16px',
          }}
        >
          {busy ? 'Working…' : entered.length ? `${act.verb} ${entered.length} line${entered.length === 1 ? '' : 's'}` : `${act.verb} lines`}
        </button>
      </div>
    </div>
  );
}

// Coverage against the full requirement: issued (green) + reserved (blue) + the
// outstanding remainder — hatched red when it can't be covered from stock, a
// neutral track when it just hasn't been reserved yet.
// Memoized row: typing in one row's qty input re-renders only that row, not
// the whole grid — matters on multi-hundred-line BOMs.
const GridRow = memo(function GridRow({ r, act, visibleCols, qtyVal, ticked, onToggle, onQty }) {
  const cap = r[act.capKey];
  const over = Number(qtyVal || 0) > cap;
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={ticked} onChange={() => onToggle(r.itemId)} aria-label={`Select ${r.name || r.itemId}`} />
      </td>
      <td style={{ ...num, textAlign: 'left', fontFamily: 'var(--font)' }}>
        <div style={{ fontWeight: 500 }}>{r.name || r.itemId}</div>
        {r.sku && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r.sku}{r.uom ? ` · ${r.uom}` : ''}</div>}
      </td>
      <td style={{ ...num, fontWeight: r.needed > 0 ? 700 : 400, color: r.short ? '#b91c1c' : undefined }}>{r.bom.toLocaleString()}</td>
      <td style={num}>{r.stock.toLocaleString()}</td>
      <td style={num}>{r.reserved.toLocaleString()}</td>
      <td style={num}>{r.issued.toLocaleString()}</td>
      {visibleCols.map(c => (
        <td key={c.key} style={{ ...num, color: c.key === 'reservable' && r[c.key] > 0 ? '#16a34a' : undefined }}>
          {r[c.key]}
        </td>
      ))}
      <td style={{ padding: '8px 10px' }}><CoverageBar r={r} /></td>
      <td style={{ padding: '4px 8px' }}>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          <input
            type="number" min="0" max={cap} step="any"
            value={qtyVal}
            onChange={e => onQty(r.itemId, e.target.value)}
            placeholder={cap > 0 ? '0' : '—'}
            disabled={cap <= 0}
            title={cap > 0 ? `Up to ${cap}` : `Nothing to ${act.verb.toLowerCase()} on this line`}
            style={{
              width: 72, padding: '5px 8px', fontSize: 13, textAlign: 'right',
              fontFamily: 'var(--font-mono)', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${over ? '#dc2626' : 'var(--border)'}`,
              background: cap <= 0 ? 'var(--bg-page)' : 'var(--bg-card)',
              color: over ? '#dc2626' : 'inherit',
            }}
          />
          <button
            onClick={() => cap > 0 && onQty(r.itemId, String(cap))}
            disabled={cap <= 0}
            title={cap > 0 ? `Fill the most this line can take (${cap})` : 'Nothing available'}
            style={{ ...maxBtn, opacity: cap <= 0 ? 0.4 : 1, cursor: cap <= 0 ? 'not-allowed' : 'pointer' }}>
            MAX
          </button>
        </div>
      </td>
    </tr>
  );
});

function CoverageBar({ r }) {
  const basis = r.bom > 0 ? r.bom : (r.reserved + r.issued + r.needed);
  if (!basis) return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>;
  const pct = n => `${Math.max(0, Math.min(100, (n / basis) * 100))}%`;
  const caption = r.needed === 0 ? 'covered' : r.short ? `${r.shortfallQty.toLocaleString()} missing` : `${r.needed.toLocaleString()} left to reserve`;
  const capColor = r.needed === 0 ? '#15803d' : r.short ? '#b91c1c' : 'var(--text-muted)';
  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
        <div style={{ width: pct(r.issued), background: '#16a34a' }} />
        <div style={{ width: pct(r.reserved), background: 'var(--blue)' }} />
        {r.short && (
          <div style={{ width: pct(r.needed), backgroundImage: 'repeating-linear-gradient(45deg,#fca5a5 0,#fca5a5 4px,#fee2e2 4px,#fee2e2 8px)' }} />
        )}
      </div>
      <div style={{ fontSize: 11, color: capColor, marginTop: 4 }}>{caption}</div>
    </div>
  );
}

const btn = {
  padding: '7px 12px', fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-secondary)',
};
const maxBtn = {
  padding: '5px 8px', fontSize: 11, fontWeight: 600, background: 'var(--bg-secondary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)',
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

export { ACTIONS, COLS };
