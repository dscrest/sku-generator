import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

// SKU module org settings (Settings → SKU Settings), one tab per kind of setting
// (CR-229): series | items | books. The same component serves all three tabs
// (route param), so state and the single Save span them. Price ladder and the
// design-rate toggle live in Settings → Product Configurator.
const MODES = [
  { value: 'off', label: 'Off', hint: 'SKUs are just the property codes — no running number.' },
  { value: 'continuous', label: 'Simple series', hint: 'One running number across all SKUs (FAB-RED-001, FAB-BLU-002, FAB-RED-003).' },
  { value: 'params', label: 'Item-wise series', hint: 'Each item counts its own series (CH-RD-001, CH-RD-002; CH-BL-001). Same parameters again get the next number.' },
];

// Stored type values never change; each org names them (CR-180). The label is
// also what the CRM quote widget writes to Products → Item Source.
const ITEM_TYPES = [
  { value: 'Trading', placeholder: 'Direct Purchase' },
  { value: 'Manufacturing', placeholder: 'In-House Manufacturing' },
];

const TABS = ['series', 'items', 'books'];

// Shared settings-page shell: full-width card grid + pinned Save bar.
export const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 18,
  display: 'flex', flexDirection: 'column', gap: 10,
};
export const cardGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' };
export const heading = { fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' };
export const hint = { fontSize: 12.5, color: 'var(--text-secondary)' };
export const field = {
  height: 32, padding: '0 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6,
  background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box',
};
export function SaveBar({ onSave, disabled, saving }) {
  return (
    // Same 44px line as GridFooter / the app footer.
    <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <button
        onClick={onSave}
        disabled={disabled}
        style={{
          height: 30, padding: '0 16px', border: 'none', borderRadius: 6,
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff',
          background: 'var(--blue)', opacity: disabled ? 0.6 : 1,
        }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

export default function SkuSettingsPage() {
  const { tab = 'series' } = useParams();
  const [autoPush, setAutoPush] = useState(false);
  const [widgetAutoPush, setWidgetAutoPush] = useState(true);
  const [seriesMode, setSeriesMode] = useState('off');
  const [seriesPad, setSeriesPad] = useState(4);
  const [defaultItemType, setDefaultItemType] = useState('Trading');
  const [typeLabels, setTypeLabels] = useState({});
  const [pushTracking, setPushTracking] = useState('serial');
  const [pushAccountId, setPushAccountId] = useState('');
  const [stockAccounts, setStockAccounts] = useState([]);
  // Extra item fields (CR-209): catalogue from the server, enabled keys per org.
  const [itemFieldCatalog, setItemFieldCatalog] = useState([]);
  const [itemFields, setItemFields] = useState([]);
  // Units of measure (CR-216): comma-separated text, cleaned server-side.
  const [uoms, setUoms] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/sku-items/settings')
      .then((r) => {
        setAutoPush(!!r.data.autoPushImport);
        setWidgetAutoPush(r.data.widgetAutoPush !== false);
        setSeriesMode(r.data.seriesMode || 'off');
        setSeriesPad(Number(r.data.seriesPad) || 4);
        setDefaultItemType(r.data.defaultItemType || 'Trading');
        setTypeLabels(r.data.typeLabels || {});
        setPushTracking(r.data.pushTracking || 'serial');
        setPushAccountId(r.data.pushAccountId || '');
        setItemFieldCatalog(r.data.itemFieldCatalog || []);
        setItemFields(r.data.itemFields || []);
        setUoms((r.data.uoms || []).join(', '));
        setLoaded(true);
      })
      .catch(() => toast.error('Failed to load settings'));
    axios.get('/api/sku-items/stock-accounts').then((r) => setStockAccounts(r.data)).catch(() => {});
  }, []);

  if (!TABS.includes(tab)) return <Navigate to="/settings/sku/series" replace />;

  async function save() {
    setSaving(true);
    try {
      // priceLadder / designRate are absent on purpose: the server leaves keys
      // it does not receive untouched, so the Product Configurator page owns them.
      const { data } = await axios.put('/api/sku-items/settings', {
        autoPushImport: autoPush, seriesMode, seriesPad, defaultItemType, typeLabels, pushTracking, pushAccountId,
        widgetAutoPush, itemFields, uoms,
      });
      setUoms((data.uoms || []).join(', ')); // show the cleaned list (trimmed, de-duplicated)
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const pad = Math.min(8, Math.max(1, Number(seriesPad) || 4));

  const series = (
    <div style={card}>
      <span style={heading}>Numerical series</span>
      {MODES.map((m) => (
        <label key={m.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="seriesMode"
            checked={seriesMode === m.value}
            disabled={!loaded}
            onChange={() => setSeriesMode(m.value)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>{m.hint}</span>
          </span>
        </label>
      ))}
      {seriesMode !== 'off' && (
        <div style={{ marginLeft: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>Number format</label>
          <input
            style={{ ...field, width: 120, fontFamily: 'var(--font-mono)' }}
            inputMode="numeric"
            disabled={!loaded}
            value={'1'.padStart(pad, '0')}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              setSeriesPad(Math.min(8, Math.max(1, digits.length)));
            }}
            placeholder="e.g. 001"
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            SKUs count <span style={{ fontFamily: 'var(--font-mono)' }}>{'1'.padStart(pad, '0')}, {'2'.padStart(pad, '0')} … {'10'.padStart(pad, '0')}, {'100'.padStart(pad, '0')}</span> — always starts at 1. Max 7 leading zeros.
          </div>
        </div>
      )}
    </div>
  );

  const items = (
    <>
      <div style={card}>
        <span style={heading}>Default item type</span>
        {ITEM_TYPES.map((t) => (
          <label key={t.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="defaultItemType"
              checked={defaultItemType === t.value}
              disabled={!loaded}
              onChange={() => setDefaultItemType(t.value)}
            />
            <input
              style={{ ...field, width: 220 }}
              value={typeLabels[t.value] || ''}
              placeholder={t.placeholder}
              maxLength={60}
              disabled={!loaded}
              onChange={(e) => setTypeLabels((l) => ({ ...l, [t.value]: e.target.value }))}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({t.value})</span>
          </label>
        ))}
        <span style={hint}>
          The selected type is preselected when creating items in the SKU Generator and the CRM quote widget.
          The label is shown across the app and written to CRM Products → Item Source by the quote widget, so it should match that picklist.
        </span>
      </div>
      <div style={card}>
        <span style={heading}>Extra item fields</span>
        {itemFieldCatalog.map((f) => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={itemFields.includes(f.key)}
              disabled={!loaded}
              onChange={(e) => setItemFields((l) => (e.target.checked ? [...l, f.key] : l.filter((k) => k !== f.key)))}
            />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{f.label}</span>
          </label>
        ))}
        <span style={hint}>
          Ticked fields appear on the SKU Generator and the SKU item editor for this organisation only, and are sent to
          Zoho Books with the item on push. Untick to hide them again; stored values are kept.
        </span>
      </div>
      <div style={card}>
        <span style={heading}>Units of measure</span>
        <input
          style={{ ...field, width: '100%' }}
          value={uoms}
          disabled={!loaded}
          onChange={(e) => setUoms(e.target.value)}
          placeholder="Nos, Pcs, Kgs, Gms, Mtr, CM, MM, Ltr, Set, Box"
        />
        <span style={hint}>
          Comma-separated. Offered in every UOM dropdown: template components, the Component Map and the CRM Product
          Configurator. Nos stays the default for new rows. Clear the box to go back to the standard list.
        </span>
      </div>
    </>
  );

  const books = (
    <>
      <div style={card}>
        <span style={heading}>Push to Zoho Books defaults</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 13.5, color: 'var(--text-primary)' }}>
          {[['none', 'None'], ['serial', 'Serial Number'], ['batch', 'Batch']].map(([val, lab]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="radio"
                name="pushTracking"
                checked={pushTracking === val}
                disabled={!loaded}
                onChange={() => setPushTracking(val)}
              />
              {lab}
            </label>
          ))}
        </div>
        <select
          style={{ ...field, maxWidth: 320, cursor: 'pointer' }}
          value={pushAccountId}
          disabled={!loaded}
          onChange={(e) => setPushAccountId(e.target.value)}
        >
          <option value="">Books default (Finished Goods)</option>
          {stockAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <span style={hint}>Preselected in the Push to Zoho Books dialog — still changeable on each push.</span>
      </div>
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPush}
            disabled={!loaded}
            onChange={(e) => setAutoPush(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={heading}>Auto-push imported items to Zoho Books</span>
            <span style={{ ...hint, display: 'block', marginTop: 3 }}>
              When on, each item created by a bulk import is pushed to Books immediately.
              When off, push manually from the SKU Generator page (Push / Push all unsynced).
            </span>
          </span>
        </label>
      </div>
      <div style={card}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={widgetAutoPush}
            disabled={!loaded}
            onChange={(e) => setWidgetAutoPush(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={heading}>CRM widgets: push new items to Zoho Books immediately</span>
            <span style={{ ...hint, display: 'block', marginTop: 3 }}>
              Applies to both CRM widgets (Quote Maker and Product Configurator). A new item is always saved to the SKU
              master. When on, it is also pushed to Zoho Books the moment it is added to a quote. When off, push it later
              from the SKU Items page (Push / Push all unsynced). Sales can still switch it per line with the widget&apos;s
              Push to Books box.
            </span>
          </span>
        </label>
      </div>
    </>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* the settings layout clips overflow, so the page owns its scroll */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={cardGrid}>
          {tab === 'series' && series}
          {tab === 'items' && items}
          {tab === 'books' && books}
        </div>
      </div>
      <SaveBar onSave={save} disabled={!loaded || saving} saving={saving} />
    </div>
  );
}
