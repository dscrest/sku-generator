import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { card, heading, hint, field, SaveBar } from './SkuSettingsPage.jsx';

// Settings → Product Configurator (CR-229): the org settings only the CRM
// Product Configurator widget reads — the price ladder (CR-220) and the
// design-costing rate fill (CR-211). Shares /api/sku-items/settings with the
// SKU Settings page; the PUT carries only these two keys and the server leaves
// every other key alone.

// Price ladder: per line class, Base → OH → Margin → P&F → Other → Disc, each
// step = previous ÷ (1 − %). Mirrors functions/skuapi/recipe/ladder.js.
const LADDER_STEPS = [['oh', 'OH %'], ['margin', 'Margin %'], ['pf', 'P&F %'], ['other', 'Other %'], ['disc', 'Disc %']];
const LADDER_CLASSES = [
  { key: 'mfg', label: 'Mfg item', type: 'Manufacturing', tint: '#FCE8D8', stripe: '#E07A2F' },
  { key: 'bo', label: 'BO item', type: 'Trading', tint: '#D9ECF3', stripe: '#3B8FB5' },
];
const emptyLadder = () => ({ mfg: { oh: 0, margin: 0, pf: 0, other: 0, disc: 0 }, bo: { oh: 0, margin: 0, pf: 0, other: 0, disc: 0 } });
function ladderExample(pcts) {
  let v = 100;
  const out = [100];
  LADDER_STEPS.forEach(([k]) => { v = v / (1 - Math.min(99.99, Math.max(0, Number(pcts[k]) || 0)) / 100); out.push(Math.round(v)); });
  return out.map((n) => n.toLocaleString('en-IN')).join(' → ');
}

const swatch = (c) => ({ width: 10, height: 10, borderRadius: 3, background: c.tint, border: `1px solid ${c.stripe}`, flex: 'none' });

export default function ConfiguratorSettingsPage() {
  const [designRate, setDesignRate] = useState(false);
  const [priceLadder, setPriceLadder] = useState(emptyLadder());
  const [typeLabels, setTypeLabels] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get('/api/sku-items/settings')
      .then((r) => {
        setDesignRate(r.data.designRate === true);
        setPriceLadder({ ...emptyLadder(), ...(r.data.priceLadder || {}) });
        setTypeLabels(r.data.typeLabels || {});
        setLoaded(true);
      })
      .catch(() => toast.error('Failed to load settings'));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await axios.put('/api/sku-items/settings', { designRate, priceLadder });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {/* Stacked, not the settings card grid: the ladder row is wide, so each card takes the full width (CR-230). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={designRate}
                disabled={!loaded}
                onChange={(e) => setDesignRate(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={heading}>Rate from the product design costing</span>
                <span style={{ ...hint, display: 'block', marginTop: 3 }}>
                  When on, picking a model in the CRM Product Configurator fills the Rate box with the unit cost of the
                  Product Design linked to that model (Sizing Models → Product Design), using the material the answers
                  name. Sales can still overwrite the rate. Off = the Rate box stays manual.
                </span>
              </span>
            </label>
          </div>
          <div style={card}>
            <span style={heading}>Price ladder</span>
            <span style={hint}>
              Each quote line is priced from its base price by class: Mfg (in-house) or BO (bought-out).
              Each step = previous ÷ (1 − %). Leave a step at 0 to skip it.
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', gap: 12, alignItems: 'center' }}>
              <span />
              {LADDER_STEPS.map(([k, label]) => (
                <span key={k} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>{label}</span>
              ))}
              {LADDER_CLASSES.map((c) => (
                <Fragment key={c.key}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)' }}>
                    <span style={swatch(c)} />
                    <span>{c.label}<span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{typeLabels[c.type] || c.type}</span></span>
                  </span>
                  {LADDER_STEPS.map(([k]) => (
                    <input
                      key={c.key + k}
                      inputMode="decimal"
                      disabled={!loaded}
                      value={priceLadder[c.key][k]}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, '');
                        setPriceLadder((p) => ({ ...p, [c.key]: { ...p[c.key], [k]: v } }));
                      }}
                      style={{ ...field, width: '100%', textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                    />
                  ))}
                </Fragment>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span>Example from a base of 100:</span>
              {LADDER_CLASSES.map((c) => (
                <span key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={swatch(c)} />
                  <span style={{ width: 70 }}>{c.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{ladderExample(priceLadder[c.key])}</span>
                </span>
              ))}
              <span style={{ color: 'var(--text-muted)' }}>Applies to new lines; quotes already created keep their prices.</span>
            </div>
          </div>
        </div>
      </div>
      <SaveBar onSave={save} disabled={!loaded || saving} saving={saving} />
    </div>
  );
}
