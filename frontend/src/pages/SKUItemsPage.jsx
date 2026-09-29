import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import Toolbar from '../components/Toolbar.jsx';
import Modal, { ModalFooter, ModalBtn } from '../components/Modal.jsx';
import { readDealId } from '../components/CrmInfoCard';
import RowMenu from '../components/RowMenu.jsx';
import GridFooter, { usePager } from '../components/GridFooter.jsx';
import DataTable, { useGridColumns, ColumnChooser } from '../components/DataTable.jsx';
import { fmtDate } from '../format.js';
import PushZohoDialog, { isStale } from '../components/PushZohoDialog.jsx';

const selectStyle = {
  background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none',
};

export default function SKUItemsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false); // first fetch resolved — distinguishes Loading… from empty
  const [industries, setIndustries] = useState([]);
  const [filterIndustry, setFilterIndustry] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [searchParams, setSearchParams] = useSearchParams();
  const [pushingId, setPushingId] = useState(null); // item id (or 'bulk') currently syncing to Zoho
  const [confirmDelete, setConfirmDelete] = useState(null); // item awaiting delete confirmation
  // Push config dialog (CR-087): target is an item or 'ALL' (bulk) — see PushZohoDialog.
  const [pushTarget, setPushTarget] = useState(null);
  const [pushDefaults, setPushDefaults] = useState(null); // org settings: pushTracking/pushAccountId (CR-166), typeLabels (CR-180)
  useEffect(() => {
    axios.get('/api/sku-items/settings').then((r) => setPushDefaults(r.data)).catch(() => {});
  }, []);
  const typeLabel = (t) => pushDefaults?.typeLabels?.[t] || t;
  // Old `?item=` deep links (CR-038) now land on the details page (CR-233).
  useEffect(() => {
    const it = searchParams.get('item');
    if (it) navigate(`/sku/items/${it}`, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Text filters (free-text + SKU), debounced so we don't fire per keystroke.
  // ?q= seeds the box so a global-search hit lands on a filtered grid.
  const initialQ = searchParams.get('q') || '';
  const [q, setQ] = useState(initialQ);
  const [skuFilter, setSkuFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [debounced, setDebounced] = useState({ q: initialQ, sku: '' });
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ q: q.trim(), sku: skuFilter.trim() }), 300);
    return () => clearTimeout(t);
  }, [q, skuFilter]);

  // Mirror the search into the URL so refresh keeps the user's place.
  useEffect(() => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      debounced.q ? p.set('q', debounced.q) : p.delete('q');
      return p;
    }, { replace: true });
  }, [debounced.q, setSearchParams]);

  // Property search
  const [properties, setProperties] = useState([]);
  const [valueOpts, setValueOpts] = useState({});      // propertyId -> PropertyValue[]
  const [filters, setFilters] = useState([]);          // [{ propertyId, valueId?, text?, label }]
  const [draftProp, setDraftProp] = useState('');
  const [draftVal, setDraftVal] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await axios.post('/api/sku-items/search', {
        industryId: filterIndustry || undefined,
        q: debounced.q || undefined,
        sku: debounced.sku || undefined,
        type: typeFilter || undefined,
        filters: filters.map(({ propertyId, valueId, text }) => ({ propertyId, valueId, text })),
      });
      setItems(data);
    } catch { toast.error('Failed to load SKU items'); }
    finally { setLoaded(true); }
  }, [filterIndustry, filters, debounced, typeFilter]);

  useEffect(() => {
    axios.get('/api/industries').then(({ data }) => setIndustries(data));
  }, []);

  // Properties are industry-scoped; reset the property filters when industry changes.
  useEffect(() => {
    setFilters([]); setDraftProp(''); setDraftVal('');
    if (!filterIndustry) { setProperties([]); return; }
    axios.get(`/api/industries/${filterIndustry}/properties`).then(({ data }) => setProperties(data));
  }, [filterIndustry]);

  // Load value options for the property being drafted (list types only).
  useEffect(() => {
    setDraftVal('');
    const prop = properties.find(p => String(p.id) === String(draftProp));
    if (!prop || prop.valueType === 'Range' || valueOpts[draftProp]) return;
    axios.get(`/api/properties/${draftProp}/values`)
      .then(({ data }) => setValueOpts(v => ({ ...v, [draftProp]: data })));
  }, [draftProp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const draftPropObj = properties.find(p => String(p.id) === String(draftProp));

  // Applies immediately (list: on select; range: on Enter/Apply) — no separate Add step.
  function applyFilter(propId, val) {
    const prop = properties.find(p => String(p.id) === String(propId));
    if (!prop || val === '') return;
    if (prop.valueType === 'Range') {
      setFilters(f => [...f, { propertyId: propId, text: val, label: `${prop.caption}: ${val}` }]);
    } else {
      const v = (valueOpts[propId] || []).find(o => String(o.id) === String(val));
      setFilters(f => [...f, { propertyId: propId, valueId: val, label: `${prop.caption}: ${v?.displayValue ?? val}` }]);
    }
    setDraftProp(''); setDraftVal('');
  }

  const anyFilter = q || skuFilter || typeFilter || filterIndustry || filters.length > 0;
  function clearFilters() {
    setQ(''); setSkuFilter(''); setTypeFilter(''); setFilterIndustry('');
    setFilters([]); setDraftProp(''); setDraftVal('');
  }

  function removeFilter(i) {
    setFilters(f => f.filter((_, idx) => idx !== i));
  }

  const sorted = [...items].sort((a, b) => {
    let av = a[sortCol];
    let bv = b[sortCol];
    if (sortCol === 'industry') { av = a.industry?.name || ''; bv = b.industry?.name || ''; }
    const v = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? v : -v;
  });

  const { pageRows: paged, pager } = usePager(sorted);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  // Opens the push config dialog; the actual push happens on its Push button.
  function openPushDialog(target, e) {
    e?.stopPropagation();
    if (pushingId) return;
    if (target === 'ALL' && !items.some(i => !i.zohoItemId)) return toast('Everything is already synced to Books');
    setPushTarget(target);
  }

  async function handlePushZoho(item, cfg) {
    if (pushingId) return; // guard against double-clicks while a push is in flight
    setPushingId(item.id);
    const verb = item.zohoItemId ? 'Re-pushing' : 'Pushing';
    const tid = toast.loading(`${verb} "${item.sku}" to Zoho Books…`);
    try {
      const { data } = await axios.post(`/api/sku-items/${item.id}/push-zoho`, {
        tracking: cfg.tracking, inventoryAccountId: cfg.accountId || undefined,
      });
      toast.success(`Synced to Zoho Books · ID ${data.zohoItemId}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Push failed', { id: tid });
    } finally {
      setPushingId(null);
    }
  }

  // CR-226: Books is the truth — re-sync names / SKUs / composite type, create what is new.
  async function handleRefreshZoho() {
    if (!filterIndustry) return toast.error('Select an industry to refresh into');
    const tid = toast.loading('Refreshing from Zoho Books…');
    try {
      const { data } = await axios.post('/api/sku-items/refresh-zoho', { industryId: filterIndustry });
      toast.success(`Updated ${data.updated}, created ${data.created}, ${data.composites} composites${data.errors?.length ? `, ${data.errors.length} errors` : ''}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Refresh failed', { id: tid });
    }
  }

  async function handleImportZoho() {
    if (!filterIndustry) return toast.error('Select an industry to import into');
    const tid = toast.loading('Importing from Zoho Books…');
    try {
      const { data } = await axios.post('/api/sku-items/import-zoho', { industryId: filterIndustry });
      toast.success(`Imported ${data.imported}, skipped ${data.skipped}${data.valuesMapped ? `, ${data.valuesMapped} values mapped` : ''}`, { id: tid });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed', { id: tid });
    }
  }

  const openDetail = (item) => navigate(`/sku/items/${item.id}`);

  async function handleDelete(item) {
    try {
      const { data } = await axios.delete(`/api/sku-items/${item.id}`);
      toast.success(data?.zohoDeleted ? 'Item deleted here and in Zoho Books' : 'Item deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete item'); }
    finally { setConfirmDelete(null); }
  }

  // Bulk push (CR-038): loop the unsynced items through the existing endpoint.
  // One dialog's settings (cfg) apply to the whole batch (CR-087).
  async function handlePushAll(cfg) {
    const unsynced = items.filter(i => !i.zohoItemId);
    if (!unsynced.length) return toast('Everything is already synced to Books');
    setPushingId('bulk');
    const tid = toast.loading(`Pushing 0/${unsynced.length} to Zoho Books…`);
    let ok = 0; const failed = [];
    for (const item of unsynced) {
      try {
        await axios.post(`/api/sku-items/${item.id}/push-zoho`, {
          tracking: cfg.tracking, inventoryAccountId: cfg.accountId || undefined,
        });
        ok++;
      } catch (err) {
        failed.push(`${item.sku}: ${err.response?.data?.error || 'failed'}`);
      }
      toast.loading(`Pushing ${ok + failed.length}/${unsynced.length} to Zoho Books…`, { id: tid });
    }
    if (failed.length) toast.error(`Pushed ${ok}; ${failed.length} failed — ${failed[0]}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}`, { id: tid, duration: 8000 });
    else toast.success(`Pushed ${ok} item${ok !== 1 ? 's' : ''} to Zoho Books`, { id: tid });
    setPushingId(null);
    load();
  }

  // Columns need page handlers (push, edit, delete), so they're built in-render.
  const COLUMNS = [
    { key: 'name', label: 'Name', lock: true, sortKey: 'name', render: item => <span style={{ fontWeight: 500 }}>{item.name}</span> },
    { key: 'sku', label: 'SKU', sortKey: 'sku', render: item => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--blue)', fontWeight: 500 }}>{item.sku}</span> },
    {
      key: 'description', label: 'Description', sortKey: 'description', render: item => (
        <div style={{ color: 'var(--text-secondary)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description || '—'}</div>
      ),
    },
    {
      key: 'type', label: 'Type', sortKey: 'type', render: item => (
        <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: item.type === 'Trading' ? '#f0fdf4' : '#faf5ff', color: item.type === 'Trading' ? '#16a34a' : '#7c3aed', border: `1px solid ${item.type === 'Trading' ? '#bbf7d0' : '#e9d5ff'}` }}>
          {typeLabel(item.type)}
        </span>
      ),
    },
    { key: 'industry', label: 'Industry', sortKey: 'industry', render: item => <span style={{ color: 'var(--text-secondary)' }}>{item.industry?.name || '—'}</span> },
    { key: 'createdAt', label: 'Created', sortKey: 'createdAt', render: item => <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtDate(item.createdAt)}</span> },
    {
      key: 'zoho', label: 'Zoho', width: 110, render: item => {
        const stale = isStale(item);
        return (
          <button
            onClick={e => openPushDialog(item, e)}
            disabled={pushingId === item.id}
            title={stale ? 'Edited since the last push — Books is out of date. Click to re-push.'
              : item.zohoItemId ? `Synced to Zoho Books (ID ${item.zohoItemId}) — click to re-push updates` : 'Push to Zoho Books'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', fontSize: 11, fontWeight: 600,
              background: stale ? '#fefce8' : item.zohoItemId ? '#f0fdf4' : '#fff7ed',
              color: stale ? '#a16207' : item.zohoItemId ? '#16a34a' : '#ea580c',
              border: `1px solid ${stale ? '#fde68a' : item.zohoItemId ? '#bbf7d0' : '#fed7aa'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: pushingId === item.id ? 'wait' : 'pointer',
              opacity: pushingId === item.id ? 0.6 : 1, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontWeight: 700 }}>Z</span>
            {pushingId === item.id ? 'Pushing…'
              : stale ? 'Edited · Re-push'
              : item.zohoItemId ? '✓ Synced · Re-push' : 'Push'}
          </button>
        );
      },
    },
    {
      key: 'actions', label: '', lock: true, width: 76, render: item => (
        <div onClick={e => e.stopPropagation()}>
          <RowMenu onEdit={() => openDetail(item)} onDelete={() => setConfirmDelete(item)} />
        </div>
      ),
    },
  ];
  const { cols, chooser } = useGridColumns('sku.items', COLUMNS);

  const zBtn = (extra) => ({ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid #fed7aa', background: '#fff7ed', color: '#ea580c', cursor: 'pointer', whiteSpace: 'nowrap', ...extra });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Filter bar: free-text, SKU, Type, Industry (always) + property filters (needs an industry) */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search SKU or name…"
          aria-label="Search SKU or name"
          style={{ ...selectStyle, width: 200 }}
        />
        <input
          value={skuFilter}
          onChange={e => setSkuFilter(e.target.value)}
          placeholder="SKU…"
          aria-label="Filter by SKU"
          style={{ ...selectStyle, width: 130, fontFamily: 'var(--font-mono)' }}
        />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="">All Types</option>
          <option value="Trading">{typeLabel('Trading')}</option>
          <option value="Manufacturing">{typeLabel('Manufacturing')}</option>
        </select>
        <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} style={selectStyle}>
          <option value="">All Industries</option>
          {industries.map(ind => <option key={ind.id} value={ind.id}>{ind.name}</option>)}
        </select>
        {!filterIndustry ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Select an industry to filter by property.</span>
        ) : (
          <>
            <select value={draftProp} onChange={e => setDraftProp(e.target.value)} style={selectStyle}>
              <option value="">Property…</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.caption}</option>)}
            </select>
            {draftPropObj && (draftPropObj.valueType === 'Range' ? (
              <>
                <input
                  value={draftVal} onChange={e => setDraftVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && applyFilter(draftProp, draftVal)}
                  placeholder={`Value${draftPropObj.unit ? ' (' + draftPropObj.unit + ')' : ''} — Enter to apply`}
                  autoFocus
                  style={{ ...selectStyle, width: 180 }}
                />
                <button onClick={() => applyFilter(draftProp, draftVal)} disabled={draftVal === ''}
                  style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer', opacity: draftVal === '' ? 0.5 : 1 }}>
                  Apply
                </button>
              </>
            ) : (
              <select value={draftVal} onChange={e => applyFilter(draftProp, e.target.value)} style={selectStyle}>
                <option value="">Value…</option>
                {(valueOpts[draftProp] || []).map(v => <option key={v.id} value={v.id}>{v.displayValue}</option>)}
              </select>
            ))}
            {filters.map((f, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 14, background: 'var(--blue-light)', color: 'var(--blue)', border: '1px solid var(--border)' }}>
                {f.label}
                <button
                  onClick={() => removeFilter(i)}
                  aria-label={`Remove filter ${f.label}`}
                  style={{ cursor: 'pointer', fontWeight: 700, background: 'none', border: 'none', color: 'inherit', padding: 0, fontSize: 'inherit' }}
                >×</button>
              </span>
            ))}
          </>
        )}
        {anyFilter && (
          <button
            onClick={clearFilters}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e11d48'; e.currentTarget.style.borderColor = '#fecdd3'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
          >
            ✕ Clear filters
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <Toolbar
            onAdd={() => {
              const dealId = readDealId(searchParams);
              navigate(dealId ? `/sku/generator?dealId=${encodeURIComponent(dealId)}` : '/sku/generator');
            }}
            onRefresh={load}
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ColumnChooser chooser={chooser} />
                <button onClick={handleImportZoho} title="Import new items from Zoho Books into the selected industry" style={zBtn()}>
                  <span style={{ fontWeight: 700 }}>Z</span> Import from Zoho
                </button>
                <button onClick={handleRefreshZoho} title="Re-sync names, SKUs and composite type from Zoho Books; new Books items are created in the selected industry" style={zBtn()}>
                  <span style={{ fontWeight: 700 }}>Z</span> Refresh from Zoho
                </button>
                <button onClick={() => openPushDialog('ALL')} disabled={pushingId === 'bulk'} title="Push every SKU not yet in Zoho Books, one by one"
                  style={zBtn({ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#16a34a', cursor: pushingId === 'bulk' ? 'wait' : 'pointer', opacity: pushingId === 'bulk' ? 0.6 : 1 })}>
                  <span style={{ fontWeight: 700 }}>Z</span> {pushingId === 'bulk' ? 'Pushing…' : 'Push all unsynced'}
                </button>
              </div>
            }
          />
          <div style={{ overflowX: 'auto' }}>
            <DataTable cols={cols} rows={paged} onRowClick={openDetail} sort={{ key: sortCol, dir: sortDir }} onSort={toggleSort} />
            {sorted.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>{loaded ? 'No SKU items yet. Click New to generate one.' : 'Loading…'}</div>
            )}
          </div>
        </div>
      </div>
      <GridFooter pager={pager} />

      {pushTarget && (
        <PushZohoDialog target={pushTarget} defaults={pushDefaults} onClose={() => setPushTarget(null)}
          onPush={cfg => { const t = pushTarget; setPushTarget(null); if (t === 'ALL') handlePushAll(cfg); else handlePushZoho(t, cfg); }} />
      )}

      {confirmDelete && (
        <Modal title={`Delete SKU "${confirmDelete.sku}"?`} onClose={() => setConfirmDelete(null)} width={420}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            The SKU and its stored property values are removed. This cannot be undone.
            {confirmDelete.zohoItemId ? ' The linked item in Zoho Books is deleted too — Books refuses if it has transactions.' : ''}
          </div>
          <ModalFooter>
            <ModalBtn onClick={() => setConfirmDelete(null)}>Keep it</ModalBtn>
            <ModalBtn variant="primary" onClick={() => handleDelete(confirmDelete)}>Delete SKU</ModalBtn>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
}
