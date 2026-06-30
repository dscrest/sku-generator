import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';

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
const shadowLg = '0 12px 32px -8px rgba(15,23,42,0.12), 0 4px 8px -4px rgba(15,23,42,0.06)';

function CheckIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function WarnIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 9v4M12 17h.01"/></svg>;
}
function DotIcon() {
  return <svg width="6" height="6" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>;
}

export default function SKUGeneratorPage() {
  const [industries, setIndustries] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState(null);
  const [properties, setProperties] = useState([]);
  const [propertyValues, setPropertyValues] = useState({});
  const [selections, setSelections] = useState({});
  const [preview, setPreview] = useState(null);
  const [itemType, setItemType] = useState('Trading');
  const [creating, setCreating] = useState(false);
  const [recentSKUs, setRecentSKUs] = useState([]);
  const [stats, setStats] = useState({ totalSKUs: 0, industries: 0, thisWeek: 0 });
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [cmdkQuery, setCmdkQuery] = useState('');

  // Popover state
  const [popover, setPopover] = useState(null); // { propId, top, left }
  const [popQuery, setPopQuery] = useState('');
  const [popRangeVal, setPopRangeVal] = useState('');
  const popoverRef = useRef(null);
  const builderRef = useRef(null);
  const popSearchRef = useRef(null);

  const [searchParams] = useSearchParams();

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdkOpen(v => !v); }
      if (e.key === 'Escape') {
        setCmdkOpen(false);
        setPopover(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    function onDown(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setPopover(null);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [popover]);

  // Focus search when popover opens
  useEffect(() => {
    if (popover && popSearchRef.current) {
      setTimeout(() => popSearchRef.current?.focus(), 30);
    }
  }, [popover?.propId]);

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => {
      setIndustries(data);
      setStats(s => ({ ...s, industries: data.length }));
      const qInd = searchParams.get('industry');
      if (qInd) {
        const found = data.find(i => String(i.id) === String(qInd));
        if (found) setSelectedIndustry(found);
      }
    });
    axios.get('/api/sku-items').then(({ data }) => {
      const total = data.length;
      const week = data.filter(item => {
        if (!item.createdAt) return false;
        return Date.now() - new Date(item.createdAt).getTime() < 7 * 86400000;
      }).length;
      setStats(s => ({ ...s, totalSKUs: total, thisWeek: week }));
    }).catch(() => {});
  }, []);

  const loadRecent = useCallback(async (industryId) => {
    try {
      const { data } = await axios.get('/api/sku-items', { params: { industryId } });
      setRecentSKUs(data.slice(0, 6));
    } catch {}
  }, []);

  const loadProperties = useCallback(async (industry) => {
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
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedIndustry) {
      setProperties([]);
      setSelections({});
      setPreview(null);
      setPopover(null);
      loadProperties(selectedIndustry);
      loadRecent(selectedIndustry.id);
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
    setPopover(null);
  }

  async function handleCreateItem() {
    if (!preview?.sku) return;
    setCreating(true);
    try {
      await axios.post('/api/sku/create-item', {
        name: preview.name, sku: preview.sku,
        description: preview.description, type: itemType,
        industryId: selectedIndustry.id,
      });
      toast.success(`SKU "${preview.sku}" created`);
      setStats(s => ({ ...s, totalSKUs: s.totalSKUs + 1, thisWeek: s.thisWeek + 1 }));
      loadRecent(selectedIndustry.id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create item');
    } finally { setCreating(false); }
  }

  function handleCopyPermalink() {
    const params = new URLSearchParams({ industry: selectedIndustry.id });
    Object.entries(selections).forEach(([pid, val]) => params.set(`p${pid}`, val));
    navigator.clipboard.writeText(`${window.location.origin}/sku-generator?${params.toString()}`)
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

  function openPopover(prop, chipEl) {
    if (!chipEl || !builderRef.current) return;
    const chipRect = chipEl.getBoundingClientRect();
    const builderRect = builderRef.current.getBoundingClientRect();
    const left = Math.max(0, chipRect.left - builderRect.left);
    const top = chipRect.bottom - builderRect.top + 8;
    const currentVal = selections[prop.id];
    setPopRangeVal(prop.valueType === 'Range' ? (currentVal || '') : '');
    setPopQuery('');
    setPopover({ propId: prop.id, top, left });
  }

  const activeProp = popover ? properties.find(p => p.id === popover.propId) : null;
  const popOptions = activeProp
    ? (propertyValues[activeProp.id] || []).filter(v =>
        !popQuery || v.sku.toLowerCase().includes(popQuery.toLowerCase()) ||
        v.displayValue.toLowerCase().includes(popQuery.toLowerCase()))
    : [];

  const filledCount = properties.filter(p => selections[p.id] !== undefined && selections[p.id] !== '').length;
  const totalCount = properties.length;
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;

  const validationChecks = [
    { key: 'ind', label: 'Industry selected', status: selectedIndustry ? 'ok' : 'pending' },
    {
      key: 'req', label: 'Required fields complete',
      status: !selectedIndustry ? 'pending' : (filledCount === totalCount && totalCount > 0) ? 'ok' : 'warn',
    },
    {
      key: 'dup', label: 'No duplicate SKU',
      status: !preview?.sku ? 'pending' : recentSKUs.some(s => s.sku === preview.sku) ? 'warn' : 'ok',
    },
  ];

  const filteredRecent = cmdkQuery
    ? recentSKUs.filter(s =>
        s.sku.toLowerCase().includes(cmdkQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(cmdkQuery.toLowerCase()))
    : recentSKUs;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bg, fontFamily: T.sans }}>

      {/* ── Topbar */}
      <div style={{
        background: T.bgElev, borderBottom: `1px solid ${T.border}`,
        padding: '0 24px', height: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        boxShadow: shadowSm,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ color: T.ink4 }}>Home</span>
          <span style={{ color: T.ink4 }}>/</span>
          <span style={{ color: T.ink3, fontWeight: 600 }}>SKU Generator</span>
        </div>
        <button
          onClick={() => setCmdkOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 500,
            cursor: 'pointer', background: T.bgSubtle, color: T.ink3,
            border: `1px solid ${T.borderStrong}`, fontFamily: T.sans, boxShadow: shadowSm,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          Search
          <span style={{ fontFamily: T.mono, fontSize: 10, opacity: 0.6, padding: '1px 5px', border: `1px solid ${T.borderStrong}`, borderRadius: 3, lineHeight: 1 }}>⌘K</span>
        </button>
      </div>

      {/* ── Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 32px' }}>

        {/* Page head */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              SKU Generator
            </h1>
            <div style={{ fontSize: 13, color: T.ink3, marginTop: 5 }}>
              Configure properties to build a unique product identifier
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexShrink: 0, marginLeft: 24 }}>
            {[
              { v: stats.totalSKUs, l: 'Total SKUs' },
              { v: stats.industries, l: 'Industries' },
              { v: `+${stats.thisWeek}`, l: 'This week' },
            ].map(({ v, l }) => (
              <div key={l} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div style={{ fontSize: 11, color: T.ink4, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

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
                ref={builderRef}
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
                  fontFamily: T.mono, fontWeight: 600, fontSize: 48,
                  lineHeight: 1.05, letterSpacing: '-0.01em',
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                  gap: 2, marginBottom: 14,
                }}>
                  {properties.length === 0 ? (
                    <span style={{ color: T.ink4, fontSize: 28, fontWeight: 400 }}>Loading…</span>
                  ) : properties.map(prop => {
                    const code = getSegCode(prop);
                    const isOpen = popover?.propId === prop.id;
                    return (
                      <span
                        key={prop.id}
                        title={prop.caption}
                        onClick={e => openPopover(prop, e.currentTarget)}
                        style={{
                          padding: '2px 8px', borderRadius: 8, cursor: 'pointer',
                          border: `1.5px ${code ? 'solid' : 'dashed'} ${isOpen ? T.accent : (code ? 'transparent' : T.borderStrong)}`,
                          background: isOpen ? T.accentSoft : (code ? 'transparent' : T.bgSubtle),
                          color: isOpen ? T.accentInk : (code ? T.ink : T.ink4),
                          transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                          userSelect: 'none',
                        }}
                      >
                        {code || '?'}
                      </span>
                    );
                  })}
                </div>

                {/* Name / description */}
                {preview ? (
                  <div style={{ fontSize: 13.5, color: T.ink3, marginBottom: 14, lineHeight: 1.4 }}>
                    <strong style={{ color: T.ink2 }}>{preview.name || '—'}</strong>
                    {preview.description && (
                      <span style={{ color: T.ink4 }}>&nbsp;· {preview.description.slice(0, 80)}</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: T.ink4, marginBottom: 14 }}>Click any segment above to configure properties</div>
                )}

                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 4, background: T.bgSubtle, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: T.accent, borderRadius: 4, width: `${progress}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: 12, color: T.ink3, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: T.ink }}>{filledCount}</strong>&nbsp;of {totalCount} properties
                  </div>
                </div>

                {/* ── Popover */}
                {popover && activeProp && (
                  <div
                    ref={popoverRef}
                    style={{
                      position: 'absolute',
                      top: popover.top,
                      left: popover.left,
                      zIndex: 100,
                      width: 280,
                      background: T.bgElev,
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      boxShadow: shadowLg,
                      overflow: 'hidden',
                      animation: 'fadeIn 0.1s ease',
                    }}
                  >
                    {/* Popover header */}
                    <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: T.ink2, marginBottom: 6 }}>
                        {activeProp.caption}
                        {activeProp.unit && <span style={{ fontWeight: 400, color: T.ink4 }}> ({activeProp.unit})</span>}
                      </div>

                      {activeProp.valueType === 'Range' ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            autoFocus
                            type="number"
                            value={popRangeVal}
                            onChange={e => setPopRangeVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && popRangeVal) handleSelect(activeProp.id, popRangeVal);
                            }}
                            min={activeProp.rangeMin ?? undefined}
                            max={activeProp.rangeMax ?? undefined}
                            placeholder={activeProp.rangeMin != null && activeProp.rangeMax != null
                              ? `${activeProp.rangeMin} – ${activeProp.rangeMax}`
                              : 'Enter value'}
                            style={{
                              flex: 1, height: 32, padding: '0 10px',
                              border: `1.5px solid ${T.borderStrong}`,
                              borderRadius: 6, fontFamily: T.sans, fontSize: 13, color: T.ink,
                              outline: 'none', background: T.bgElev,
                            }}
                          />
                          <button
                            onClick={() => popRangeVal && handleSelect(activeProp.id, popRangeVal)}
                            style={{
                              height: 32, padding: '0 12px', borderRadius: 6,
                              background: T.accent, color: '#fff', border: 'none',
                              fontFamily: T.sans, fontSize: 12.5, fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >Set</button>
                        </div>
                      ) : (
                        <div style={{ position: 'relative' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.ink4} strokeWidth="2" strokeLinecap="round"
                            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
                          </svg>
                          <input
                            ref={popSearchRef}
                            value={popQuery}
                            onChange={e => setPopQuery(e.target.value)}
                            placeholder={`Search ${activeProp.caption}…`}
                            style={{
                              width: '100%', height: 32, padding: '0 10px 0 30px',
                              border: `1.5px solid ${T.borderStrong}`,
                              borderRadius: 6, fontFamily: T.sans, fontSize: 13, color: T.ink,
                              outline: 'none', background: T.bgElev, boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Options list (Manual only) */}
                    {activeProp.valueType === 'Manual' && (
                      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                        {popOptions.length === 0 ? (
                          <div style={{ padding: '12px 14px', fontSize: 12.5, color: T.ink4, textAlign: 'center' }}>No matches</div>
                        ) : popOptions.map(v => {
                          const isSelected = String(selections[activeProp.id]) === String(v.id);
                          return (
                            <div
                              key={v.id}
                              onClick={() => handleSelect(activeProp.id, String(v.id))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 12px', cursor: 'pointer',
                                background: isSelected ? T.accentSoft : 'transparent',
                                transition: 'background 0.08s',
                              }}
                              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.bgSubtle; }}
                              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span style={{
                                fontFamily: T.mono, fontWeight: 600, fontSize: 12.5,
                                color: isSelected ? T.accentInk : T.ink,
                                minWidth: 36,
                              }}>{v.sku}</span>
                              <span style={{ fontSize: 12.5, color: isSelected ? T.accentInk : T.ink3, flex: 1 }}>{v.displayValue}</span>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accentInk} strokeWidth="3" strokeLinecap="round">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Popover footer */}
                    <div style={{ padding: '6px 12px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 10, fontSize: 11, color: T.ink4 }}>
                      {(activeProp.valueType === 'Manual'
                        ? [['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']]
                        : [['↵', 'confirm'], ['esc', 'close']]
                      ).map(([k, l]) => (
                        <span key={k}><kbd style={{ fontFamily: T.mono, padding: '1px 4px', border: `1px solid ${T.border}`, borderRadius: 3 }}>{k}</kbd> {l}</span>
                      ))}
                    </div>
                  </div>
                )}
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
            {selectedIndustry && properties.length === 0 && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, padding: '36px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: T.ink4 }}>
                  No properties for <strong style={{ color: T.ink2 }}>{selectedIndustry.name}</strong>
                </div>
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

                  <button
                    onClick={() => toast.success('Submitted to helpdesk')}
                    style={{
                      width: '100%', padding: '9px 14px', borderRadius: 8,
                      fontSize: 13, fontWeight: 500, border: 'none',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'transparent', color: T.ink3, fontFamily: T.sans,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                    Submit to helpdesk
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

            {/* Recent SKUs */}
            {recentSKUs.length > 0 && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: shadowSm }}>
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 10.5, fontWeight: 600, color: T.ink4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Recent SKUs
                </div>
                {recentSKUs.slice(0, 5).map(item => (
                  <div
                    key={item.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = T.bgSubtle}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => navigator.clipboard.writeText(item.sku).then(() => toast.success('SKU copied'))}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontWeight: 600, fontSize: 12.5, color: T.ink }}>{item.sku}</div>
                      <div style={{ fontSize: 11, color: T.ink4, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                      background: item.type === 'Trading' ? T.accentSoft : T.bgSubtle,
                      color: item.type === 'Trading' ? T.accentInk : T.ink3,
                      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                    }}>
                      {item.type ? item.type[0] : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Command Palette */}
      {cmdkOpen && (
        <div
          onClick={() => setCmdkOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
            zIndex: 200, display: 'flex', alignItems: 'flex-start',
            justifyContent: 'center', paddingTop: '12vh',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 560, maxWidth: '90vw',
              background: T.bgElev, border: `1px solid ${T.border}`,
              borderRadius: 12, boxShadow: shadowLg, overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.ink3} strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                autoFocus
                value={cmdkQuery}
                onChange={e => setCmdkQuery(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setCmdkOpen(false)}
                placeholder="Search SKUs, properties, actions…"
                style={{ flex: 1, border: 'none', outline: 'none', fontFamily: T.sans, fontSize: 14.5, color: T.ink, background: 'transparent' }}
              />
              <span style={{ fontSize: 11, color: T.ink4 }}>esc</span>
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: T.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px 6px' }}>Actions</div>
              {[
                { code: '⌘N', label: 'Create new SKU' },
                { code: '⌘B', label: 'Bulk generate from matrix' },
                { code: '⌘I', label: 'Import from CSV' },
              ].map(row => (
                <div
                  key={row.code}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13.5 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bgSubtle}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink3, minWidth: 36 }}>{row.code}</span>
                  <span style={{ color: T.ink2 }}>{row.label}</span>
                </div>
              ))}

              {filteredRecent.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: T.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px 6px', marginTop: 4 }}>Recent SKUs</div>
                  {filteredRecent.slice(0, 5).map(item => (
                    <div
                      key={item.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13.5 }}
                      onMouseEnter={e => e.currentTarget.style.background = T.bgSubtle}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { navigator.clipboard.writeText(item.sku); setCmdkOpen(false); toast.success('SKU copied'); }}
                    >
                      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.accentInk, minWidth: 80 }}>{item.sku}</span>
                      <span style={{ color: T.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={{ padding: '8px 14px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 14, fontSize: 11, color: T.ink4 }}>
              {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([k, l]) => (
                <span key={k}>
                  <kbd style={{ fontFamily: T.mono, padding: '1px 4px', border: `1px solid ${T.border}`, borderRadius: 3 }}>{k}</kbd>
                  {' '}{l}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
