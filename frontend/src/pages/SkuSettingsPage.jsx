import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

// SKU module org settings (account menu → SKU Settings): numerical series
// mode + number format, and auto-push imported items to Zoho Books.
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

export default function SkuSettingsPage() {
  const [autoPush, setAutoPush] = useState(false);
  const [widgetAutoPush, setWidgetAutoPush] = useState(true);
  const [seriesMode, setSeriesMode] = useState('off');
  const [seriesPad, setSeriesPad] = useState(4);
  const [defaultItemType, setDefaultItemType] = useState('Trading');
  const [typeLabels, setTypeLabels] = useState({});
  const [pushTracking, setPushTracking] = useState('serial');
  const [pushAccountId, setPushAccountId] = useState('');
  const [stockAccounts, setStockAccounts] = useState([]);
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
        setLoaded(true);
      })
      .catch(() => toast.error('Failed to load settings'));
    axios.get('/api/sku-items/stock-accounts').then((r) => setStockAccounts(r.data)).catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    try {
      await axios.put('/api/sku-items/settings', {
        autoPushImport: autoPush, seriesMode, seriesPad, defaultItemType, typeLabels, pushTracking, pushAccountId,
        widgetAutoPush,
      });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const pad = Math.min(8, Math.max(1, Number(seriesPad) || 4));

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 8, padding: 18,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Numerical series</span>
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
                style={{
                  width: 120, height: 32, padding: '0 10px', fontSize: 13,
                  fontFamily: 'var(--font-mono)', border: '1px solid var(--border)',
                  borderRadius: 6, background: 'var(--bg-card)', color: 'var(--text-primary)',
                }}
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
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Default item type</span>
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
                style={{
                  width: 220, height: 32, padding: '0 10px', fontSize: 13,
                  border: '1px solid var(--border)', borderRadius: 6,
                  background: 'var(--bg-card)', color: 'var(--text-primary)',
                }}
                value={typeLabels[t.value] || ''}
                placeholder={t.placeholder}
                maxLength={60}
                disabled={!loaded}
                onChange={(e) => setTypeLabels((l) => ({ ...l, [t.value]: e.target.value }))}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({t.value})</span>
            </label>
          ))}
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            The selected type is preselected when creating items in the SKU Generator and the CRM quote widget.
            The label is shown across the app and written to CRM Products → Item Source by the quote widget, so it should match that picklist.
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Push to Zoho Books defaults</span>
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
            style={{
              height: 32, padding: '0 10px', fontSize: 13, maxWidth: 320, cursor: 'pointer',
              border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
            value={pushAccountId}
            disabled={!loaded}
            onChange={(e) => setPushAccountId(e.target.value)}
          >
            <option value="">Books default (Finished Goods)</option>
            {stockAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Preselected in the Push to Zoho Books dialog — still changeable on each push.
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoPush}
            disabled={!loaded}
            onChange={(e) => setAutoPush(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Auto-push imported items to Zoho Books
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
              When on, each item created by a bulk import is pushed to Books immediately.
              When off, push manually from the SKU Generator page (Push / Push all unsynced).
            </span>
          </span>
        </label>
        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={widgetAutoPush}
            disabled={!loaded}
            onChange={(e) => setWidgetAutoPush(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              CRM widgets: push new items to Zoho Books immediately
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
              Applies to both CRM widgets (Quote Maker and Product Configurator). A new item is always saved to the SKU
              master. When on, it is also pushed to Zoho Books the moment it is added to a quote. When off, push it later
              from the SKU Items page (Push / Push all unsynced). Sales can still switch it per line with the widget&apos;s
              Push to Books box.
            </span>
          </span>
        </label>
        <button
          onClick={save}
          disabled={!loaded || saving}
          style={{
            marginTop: 16, height: 34, padding: '0 16px', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff',
            background: 'var(--blue)', opacity: !loaded || saving ? 0.6 : 1,
          }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
