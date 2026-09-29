import { useState, useEffect } from 'react';
import axios from 'axios';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';

/**
 * Push-to-Books config (CR-087): tracking + inventory account, applied on
 * Books create only. Shared by the SKU Items grid (single + bulk) and the SKU
 * item details page (CR-233). `target` = item or 'ALL'; `defaults` = the org's
 * SKU settings (pushTracking / pushAccountId, CR-166).
 */
const labelStyle = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 };
const inputStyle = {
  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '9px 12px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
};

// Edited after the last Books push → the row in Books is out of date. The 5s
// slack absorbs the push handler's own lastPushedAt write bumping MODIFIEDTIME.
export function isStale(item) {
  return Boolean(item.zohoItemId && item.lastPushedAt && item.updatedAt &&
    new Date(item.updatedAt) - new Date(item.lastPushedAt) > 5000);
}

export default function PushZohoDialog({ target, defaults, onClose, onPush }) {
  const [cfg, setCfg] = useState({ tracking: defaults?.pushTracking || 'serial', accountId: defaults?.pushAccountId || '' });
  const [accounts, setAccounts] = useState(null); // null = loading, [] = fetch failed
  useEffect(() => {
    axios.get('/api/sku-items/stock-accounts').then(({ data }) => {
      setAccounts(data);
      const fg = data.find(a => /finished goods/i.test(a.name));
      if (fg && !defaults?.pushAccountId) setCfg(c => ({ ...c, accountId: fg.id }));
    }).catch(() => setAccounts([])); // dropdown falls back to the Books default
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => onPush(cfg);
  return (
    <Modal title={`Push to Zoho Books — ${target === 'ALL' ? 'all unsynced items' : target.sku}`} onClose={onClose} width={420} onSubmit={go}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Track Inventory: <b style={{ color: 'var(--text-secondary)' }}>On</b></div>
      <div>
        <label style={labelStyle}>Inventory Tracking</label>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-primary)' }}>
          {[['none', 'None'], ['serial', 'Serial Number'], ['batch', 'Batch']].map(([val, lab]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="radio" name="pushTracking" checked={cfg.tracking === val} onChange={() => setCfg({ ...cfg, tracking: val })} />
              {lab}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label style={labelStyle}>Inventory Account</label>
        <select style={inputStyle} value={cfg.accountId} onChange={e => setCfg({ ...cfg, accountId: e.target.value })} disabled={accounts === null}>
          {accounts === null ? <option value="">Loading accounts…</option> : <option value="">Books default (Finished Goods)</option>}
          {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      {target !== 'ALL' && target.zohoItemId && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Already linked in Books — tracking and account can't change on a re-push; only name, SKU and description update.
        </div>
      )}
      <ModalFooter>
        <ModalBtn onClick={onClose}>Cancel</ModalBtn>
        <ModalBtn variant="primary" onClick={go}>Push</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}
