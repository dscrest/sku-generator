import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import CrmInfoCard from '../components/CrmInfoCard';

const T = {
  accent: '#4f46e5',
  accentHover: '#4338ca',
  accentSoft: '#eef2ff',
  accentInk: '#4338ca',
  ok: '#16a34a',
  okSoft: '#f0fdf4',
  warn: '#b45309',
  warnSoft: '#fffbeb',
  ink: '#0f172a',
  ink2: '#334155',
  ink3: '#64748b',
  ink4: '#94a3b8',
  bg: '#f8fafc',
  bgElev: '#ffffff',
  bgSubtle: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  mono: "'JetBrains Mono', ui-monospace, monospace",
  sans: "'Manrope', ui-sans-serif, sans-serif",
};

const shadowSm = '0 1px 2px rgba(15,23,42,0.04), 0 1px 4px rgba(15,23,42,0.04)';

function CheckIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function WarnIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/></svg>;
}
function DotIcon() {
  return <svg width="6" height="6" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>;
}
// Mirrors isActive() on the server so the list can never show a property the
// server would drop. The UI for moving properties in/out is hidden (CR-011) —
// every property is in the SKU — but the column and the gate stay for later.
const isActive = p => p.activeInSku !== false;

const ctrlStyle = {
  width: '100%', height: 32, boxSizing: 'border-box',
  padding: '0 10px', border: `1.5px solid ${T.borderStrong}`, borderRadius: 6,
  fontFamily: T.sans, fontSize: 13, color: T.ink, background: T.bgElev, outline: 'none',
};

function Badge({ children, tone }) {
  const c = tone === 'warn'
    ? { fg: '#be123c', bg: '#fef2f2', bd: '#fecdd3' }
    : { fg: T.accentInk, bg: T.accentSoft, bd: '#c7d2fe' };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', padding: '1px 5px',
      borderRadius: 8, color: c.fg, background: c.bg, border: `1px solid ${c.bd}`, flexShrink: 0,
    }}>{children}</span>
  );
}

function SectionHead({ label }) {
  return (
    <div style={{
      padding: '9px 16px', background: T.bgSubtle, borderTop: `1px solid ${T.border}`,
      fontSize: 10.5, fontWeight: 600, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em',
    }}>
      {label}
    </div>
  );
}

// caption | value control | resulting SKU fragment
function PropRow({ prop, children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 230px 74px',
      alignItems: 'center', gap: 12, padding: '7px 16px',
      borderTop: `1px solid ${T.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 13, color: T.ink }}>
        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prop.caption}</span>
        {prop.unit && <span style={{ color: T.ink4, flexShrink: 0 }}>({prop.unit})</span>}
        {prop.required && <Badge tone="warn">REQ</Badge>}
        {prop.includeInName && <Badge>NAME</Badge>}
      </div>
      {children}
    </div>
  );
}

export default function SKUGeneratorPage() {
  const [industries, setIndustries] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [properties, setProperties] = useState([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [propertyValues, setPropertyValues] = useState({});
  const [selections, setSelections] = useState({});
  const [preview, setPreview] = useState(null);
  const [itemType, setItemType] = useState('Trading');
  const [creating, setCreating] = useState(false);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => {
      setIndustries(data);
      const qInd = searchParams.get('industry');
      const found = qInd && data.find(i => String(i.id) === String(qInd));
      // No industry in the permalink: open on the first one so the properties
      // are already on screen instead of an empty prompt.
      if (found || data.length) setSelectedIndustry(found || data[0]);
    });
  }, []);

  const loadProperties = useCallback(async (industry) => {
    setLoadingProps(true);
    try {
      const { data: props } = await axios.get(`/api/industries/${industry.id}/properties`);
      setProperties(props);
      const valMap = {};
      await Promise.all(props.map(async p => {
        if (p.valueType === 'Manual') {
          const { data: vals } = await axios.get(`/api/properties/${p.id}/values`);
          valMap[p.id] = vals;
        }
      }));
      setPropertyValues(valMap);
      const initSels = {};
      props.forEach(p => {
        const qVal = searchParams.get(`p${p.id}`);
        if (qVal) initSels[p.id] = qVal;
      });
      setSelections(initSels);
    } catch {
      toast.error('Failed to load properties');
    } finally {
      setLoadingProps(false);
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedIndustry) {
      setProperties([]);
      setSelections({});
      setPreview(null);
      loadProperties(selectedIndustry);
    }
  }, [selectedIndustry]);

  const generatePreview = useCallback(async () => {
    if (!selectedIndustry || Object.keys(selections).length === 0) { setPreview(null); return; }
    try {
      const { data } = await axios.post('/api/sku/generate', { industryId: selectedIndustry.id, selectedValues: selections });
      setPreview(data);
    } catch { setPreview(null); }
  }, [selectedIndustry, selections]);

  useEffect(() => { generatePreview(); }, [generatePreview]);

  function handleSelect(propId, value) {
    setSelections(prev => ({ ...prev, [propId]: value }));
  }

  async function handleCreateItem() {
    if (!preview?.sku) return;
    if (missingRequired.length) { toast.error(`Required fields missing: ${missingRequired.join(', ')}`); return; }
    if (preview.duplicate) { toast.error(`SKU "${preview.sku}" already exists`); return; }
    setCreating(true);
    try {
      await axios.post('/api/sku/create-item', {
        name: preview.name, sku: preview.sku,
        description: preview.description, type: itemType,
        industryId: selectedIndustry.id,
        selectedValues: selections,
      });
      toast.success(`SKU "${preview.sku}" created`);
      navigate('/sku/items'); // land on the list with the new SKU visible
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create item');
    } finally { setCreating(false); }
  }

  function handleCopyPermalink() {
    const params = new URLSearchParams({ industry: selectedIndustry.id });
    Object.entries(selections).forEach(([pid, val]) => params.set(`p${pid}`, val));
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/sku/generator?${params.toString()}`)
      .then(() => toast.success('Permalink copied'));
  }

  function getSegCode(prop) {
    const sel = selections[prop.id];
    if (sel === undefined || sel === '') return null;
    if (prop.valueType === 'Range') return String(sel);
    const vals = propertyValues[prop.id] || [];
    const v = vals.find(v => String(v.id) === String(sel));
    return v?.sku || null;
  }

  const activeProps = properties.filter(isActive);

  const filledCount = activeProps.filter(p => selections[p.id] !== undefined && selections[p.id] !== '').length;
  const totalCount = activeProps.length;
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  const missingRequired = activeProps
    .filter(p => p.required && (selections[p.id] === undefined || selections[p.id] === ''))
    .map(p => p.caption);

  const validationChecks = [
    { key: 'ind', label: 'Industry selected', status: selectedIndustry ? 'ok' : 'pending' },
    {
      key: 'req',
      label: missingRequired.length ? `Required: ${missingRequired.join(', ')}` : 'Required fields complete',
      status: !selectedIndustry ? 'pending' : missingRequired.length ? 'warn' : 'ok',
    },
    {
      key: 'dup', label: 'No duplicate SKU',
      status: !preview?.sku ? 'pending' : preview.duplicate ? 'warn' : 'ok',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bg, fontFamily: T.sans }}>

      {/* ── Scrollable body. No page head: the SKU tab bar above already names
          the page, and the stats row moved out with it. */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 32px' }}>

        <Link to="/sku/items" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: T.ink3, textDecoration: 'none', marginBottom: 12 }}>
          ← Back to SKUs
        </Link>

        {/* Deal context when opened from a Zoho CRM custom link button */}
        {searchParams.get('dealId') && <CrmInfoCard dealId={searchParams.get('dealId')} />}

        {/* Two-column layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 268px', gap: 20, alignItems: 'flex-start' }}>

          {/* ── LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Industry selector */}
            <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, padding: '16px 20px', boxShadow: shadowSm }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.ink4, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                Industry
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {industries.map(ind => {
                  const active = selectedIndustry?.id === ind.id;
                  return (
                    <button
                      key={ind.id}
                      onClick={() => setSelectedIndustry(ind)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, fontSize: 13,
                        fontWeight: active ? 600 : 500,
                        border: `1.5px solid ${active ? T.accent : T.borderStrong}`,
                        cursor: 'pointer',
                        color: active ? '#fff' : T.ink2,
                        background: active ? T.accent : T.bgElev,
                        transition: 'all 0.12s', fontFamily: T.sans,
                        boxShadow: active ? `0 0 0 3px ${T.accentSoft}` : shadowSm,
                      }}
                    >
                      {ind.name}
                    </button>
                  );
                })}
                {industries.length === 0 && (
                  <span style={{ fontSize: 13, color: T.ink4, fontStyle: 'italic' }}>No industries — add one in Admin</span>
                )}
              </div>
            </div>

            {/* Hero Builder */}
            {selectedIndustry && (
              <div
                style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, padding: '24px 24px 20px', boxShadow: shadowSm, position: 'relative' }}
              >
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 11, fontWeight: 600, color: T.ink3,
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14,
                }}>
                  <span style={{ width: 6, height: 6, background: T.ok, borderRadius: '50%', boxShadow: `0 0 0 3px ${T.okSoft}` }} />
                  Live SKU · {selectedIndustry.name}
                </div>

                {/* SKU chip display */}
                <div style={{
                  fontFamily: T.mono, fontWeight: 600,
                  // 24 segments at 48px is three wrapped lines — scale down past ~10.
                  fontSize: activeProps.length > 10 ? 24 : 48,
                  lineHeight: 1.15, letterSpacing: '-0.01em',
                  display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end',
                  gap: '6px 10px', marginBottom: 14,
                }}>
                  {loadingProps ? (
                    <span style={{ color: T.ink4, fontSize: 28, fontWeight: 400 }}>Loading…</span>
                  ) : properties.length === 0 ? (
                    <span style={{ color: T.ink4, fontSize: 22, fontWeight: 400, fontFamily: T.sans }}>Add properties to generate a SKU</span>
                  ) : activeProps.length === 0 ? (
                    <span style={{ color: T.ink4, fontSize: 22, fontWeight: 400, fontFamily: T.sans }}>No properties in SKU generation</span>
                  ) : activeProps.map(prop => {
                    const code = getSegCode(prop);
                    return (
                      <span
                        key={prop.id}
                        title={prop.caption}
                        style={{
                          padding: '2px 8px', borderRadius: 8,
                          border: `1.5px ${code ? 'solid' : 'dashed'} ${code ? 'transparent' : T.borderStrong}`,
                          background: code ? 'transparent' : T.bgSubtle,
                          color: code ? T.ink : T.ink4,
                          userSelect: 'none',
                        }}
                      >
                        {code || '?'}
                      </span>
                    );
                  })}
                </div>

                {/* Name */}
                <div style={{ fontSize: 13.5, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                  {preview
                    ? <strong style={{ color: T.ink2 }}>{preview.name || '—'}</strong>
                    : 'Pick values below to build a SKU'}
                </div>

                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 4, background: T.bgSubtle, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: T.accent, borderRadius: 4, width: `${progress}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: 12, color: T.ink3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: T.ink }}>{filledCount}</strong>&nbsp;of {totalCount} properties
                  </div>
                </div>

              </div>
            )}

            {/* ── Property list — one row per property, all of them in the SKU */}
            {selectedIndustry && activeProps.length > 0 && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: shadowSm, overflow: 'hidden' }}>

                <SectionHead label={`Properties · ${activeProps.length}`} />
                {activeProps.map(prop => {
                  const code = getSegCode(prop);
                  const val = selections[prop.id] ?? '';
                  return (
                    <PropRow key={prop.id} prop={prop}>
                      {prop.valueType === 'Range' ? (
                        <input
                          type="number"
                          value={val}
                          onChange={e => handleSelect(prop.id, e.target.value)}
                          min={prop.rangeMin ?? undefined}
                          max={prop.rangeMax ?? undefined}
                          placeholder={prop.rangeMin != null && prop.rangeMax != null ? `${prop.rangeMin} – ${prop.rangeMax}` : 'Enter value'}
                          style={ctrlStyle}
                        />
                      ) : (
                        <select value={val} onChange={e => handleSelect(prop.id, e.target.value)} style={{ ...ctrlStyle, cursor: 'pointer' }}>
                          <option value="">— select —</option>
                          {(propertyValues[prop.id] || []).map(v => (
                            <option key={v.id} value={String(v.id)}>{v.sku} — {v.displayValue}</option>
                          ))}
                        </select>
                      )}
                      <span style={{
                        fontFamily: T.mono, fontSize: 12.5, fontWeight: 600,
                        color: code ? T.accentInk : T.ink4, textAlign: 'right',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{code || '—'}</span>
                    </PropRow>
                  );
                })}
              </div>
            )}

            {/* ── Description preview — exactly what Zoho Books receives */}
            {selectedIndustry && preview?.description && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: shadowSm, overflow: 'hidden' }}>
                <SectionHead label="Item & sales description" />
                <pre style={{
                  margin: 0, padding: '12px 16px', maxHeight: 260, overflowY: 'auto',
                  fontFamily: T.sans, fontSize: 12.5, lineHeight: 1.6, color: T.ink2,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{preview.description}</pre>
              </div>
            )}

            {/* Empty state */}
            {!selectedIndustry && (
              <div style={{
                background: T.bgElev, border: `1px dashed ${T.borderStrong}`,
                borderRadius: 12, padding: '52px 24px', textAlign: 'center',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.borderStrong} strokeWidth="1.5" style={{ marginBottom: 12 }}>
                  <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                  <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17h7M17 14v7"/>
                </svg>
                <div style={{ fontWeight: 600, color: T.ink3, fontSize: 14 }}>Select an industry to begin</div>
                <div style={{ fontSize: 12, color: T.ink4, marginTop: 4 }}>Properties load dynamically per industry</div>
              </div>
            )}

            {/* No properties state */}
            {selectedIndustry && !loadingProps && properties.length === 0 && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.ink4, marginBottom: 10 }}>
                  <strong style={{ color: T.ink2 }}>{selectedIndustry.name}</strong> has no properties yet. Add properties to generate a SKU.
                </div>
                <Link
                  to={`/sku/industries/${selectedIndustry.id}/properties`}
                  style={{
                    display: 'inline-block', padding: '7px 14px', borderRadius: 8,
                    fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    background: T.accent, color: '#fff',
                  }}
                >
                  Add properties
                </Link>
              </div>
            )}
          </div>

          {/* ── RIGHT RAIL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 }}>

            {/* Actions */}
            <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: shadowSm }}>
              <div style={{ padding: '16px 18px 14px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 3 }}>Save this SKU</div>
                <div style={{ fontSize: 12, color: T.ink3, marginBottom: 14, minHeight: 18 }}>
                  {preview?.sku
                    ? <span style={{ fontFamily: T.mono, fontWeight: 600, color: T.accentInk }}>{preview.sku}</span>
                    : 'Choose the item type, then create'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: T.bgSubtle, borderRadius: 8, padding: 3, marginBottom: 14 }}>
                  {['Trading', 'Manufacturing'].map(t => (
                    <button
                      key={t}
                      onClick={() => setItemType(t)}
                      style={{
                        border: 'none', padding: '7px 10px',
                        fontFamily: T.sans, fontSize: 12.5, fontWeight: 500,
                        color: itemType === t ? T.ink : T.ink3,
                        background: itemType === t ? T.bgElev : 'transparent',
                        borderRadius: 6, cursor: 'pointer',
                        boxShadow: itemType === t ? shadowSm : 'none',
                        transition: 'all 0.12s',
                      }}
                    >{t}</button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={handleCreateItem}
                    disabled={creating || !preview?.sku}
                    style={{
                      width: '100%', padding: '9px 14px', borderRadius: 8,
                      fontSize: 13.5, fontWeight: 500,
                      border: `1px solid ${preview?.sku && !creating ? T.accent : T.borderStrong}`,
                      cursor: creating || !preview?.sku ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: preview?.sku && !creating ? T.accent : T.bgSubtle,
                      color: preview?.sku && !creating ? '#fff' : T.ink4,
                      fontFamily: T.sans, opacity: creating ? 0.75 : 1,
                      boxShadow: preview?.sku && !creating ? '0 1px 0 rgba(79,70,229,0.4)' : 'none',
                      transition: 'all 0.12s',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {creating ? 'Creating…' : 'Create Item'}
                    {!creating && preview?.sku && (
                      <span style={{ fontFamily: T.mono, fontSize: 10, opacity: 0.65, padding: '1px 5px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 3, lineHeight: 1 }}>⌘↵</span>
                    )}
                  </button>

                  <button
                    onClick={handleCopyPermalink}
                    disabled={!selectedIndustry}
                    style={{
                      width: '100%', padding: '9px 14px', borderRadius: 8,
                      fontSize: 13, fontWeight: 500,
                      border: `1px solid ${T.borderStrong}`,
                      cursor: !selectedIndustry ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: T.bgElev, color: T.ink2,
                      fontFamily: T.sans, boxShadow: shadowSm,
                      opacity: !selectedIndustry ? 0.5 : 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                    </svg>
                    Copy permalink
                  </button>
                </div>
              </div>
            </div>

            {/* Validation */}
            <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: shadowSm }}>
              <div style={{ padding: '12px 16px 10px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: T.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Validation
                </div>
                {validationChecks.map((check, i) => (
                  <div
                    key={check.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 12.5, padding: '6px 0',
                      borderTop: i > 0 ? `1px dashed ${T.border}` : 'none',
                      color: check.status === 'pending' ? T.ink4 : T.ink2,
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                      background: check.status === 'ok' ? T.okSoft : check.status === 'warn' ? T.warnSoft : T.bgSubtle,
                      color: check.status === 'ok' ? T.ok : check.status === 'warn' ? T.warn : T.ink4,
                    }}>
                      {check.status === 'ok' && <CheckIcon />}
                      {check.status === 'warn' && <WarnIcon />}
                      {check.status === 'pending' && <DotIcon />}
                    </span>
                    {check.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
