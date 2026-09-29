import { useState, useEffect } from 'react';
import axios from 'axios';
import { Empty } from './MaterialsGrid.jsx';
import { spaced } from './woCommon.jsx';

/**
 * Audit trail (CR-233): the History tab of every record type. Reads
 * GET /api/activity?entityType=&entityId= (ActivityLog, newest first). The
 * Work Order page keeps its own richer HistoryTab and reuses <AuditList>.
 */

// Raw ActivityLog codes → plain-language labels.
const ACTION_LABELS = {
  'txn.confirm.reserve': 'Material reserved',
  'txn.confirm.dereserve': 'Reservation released',
  'txn.confirm.issue': 'Material issued',
  'txn.confirm.return': 'Material returned',
  'txn.draft.reserve': 'Reserve draft created',
  'txn.draft.dereserve': 'Dereserve draft created',
  'txn.draft.issue': 'Issue draft created',
  'txn.draft.return': 'Return draft created',
  'txn.cancel': 'Movement cancelled',
  'wo.create': 'Work order created',
  'wo.update': 'Work order updated',
  'wo.delete': 'Work order deleted',
  'wo.status': 'Status changed',
  'wo.hold': 'Put on hold',
  'wo.resume': 'Resumed from hold',
  'wo.qc': 'Quality check recorded',
  'wo.reopen': 'Work order reopened',
  'bom.revise': 'BOM revised',
  'pr.create': 'Purchase request raised',
  'pr.line.add': 'Purchase request line added',
  'pr.delete': 'Purchase request deleted',
  'pr.line.delete': 'Purchase request line removed',
  'pr.confirm': 'Purchase request confirmed',
  'pr.raise': 'Purchase order raised',
  'pr.raise.fail': 'Purchase order raise failed',
  'po.delete': 'Purchase order deleted',
  'po.edit': 'Purchase order edited',
  'po.sync.deleted': 'Purchase order deleted in Books',
  'po.sync.cancelled': 'Purchase order voided in Books',
  'po.sync.lineRemoved': 'Purchase order line removed in Books',
  'po.sync.qtyChanged': 'Purchase order quantity changed in Books',
  'fg.assemble': 'Assembly created',
  'fg.assemble.delete': 'Assembly deleted',
  // CR-203 defective material · CR-204 SO quantity change
  'defect.raised': 'Defective material replaced',
  'defect.repaired': 'Defect repaired — stock usable again',
  'defect.adjusted': 'Defect written off (inventory adjustment)',
  'defect.returned_to_vendor': 'Defect returned to vendor',
  'so.qty.changed': 'Sales order quantity changed',
  'so.qty.dismissed': 'Sales order quantity change dismissed',
  'wo.fgqty': 'Finished-good quantity applied',
  // CR-250 new SO line
  'so.line.added': 'Sales order line added by Sales',
  'so.line.dismissed': 'New sales order line dismissed',
  'wo.fg.added': 'Finished good added from the sales order',
  // CR-233: designs, SKU items, quotations, masters
  'recipe.create': 'Created',
  'recipe.update': 'Edited',
  'recipe.delete': 'Deleted',
  'recipe.publish': 'Published',
  'recipe.superseded': 'Superseded by a newer version',
  'recipe.new_version': 'New version created',
  'recipe.clone': 'Cloned',
  'recipe.status': 'Status changed',
  'recipe.push_books': 'Pushed to Books',
  'sku.create': 'Created',
  'sku.update': 'Edited',
  'sku.delete': 'Deleted',
  'sku.push_zoho': 'Pushed to Zoho Books',
  'quotation.create': 'Quotation created',
  'quotation.convert': 'Converted to sales order',
};

export function friendlyAction(action = '') {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const m = action.match(/^approval\.l(\d+)\.(\w+)$/);
  if (m) return `Level ${m[1]} ${m[2].toLowerCase()}`;
  if (action.startsWith('po.')) return `Purchase order ${spaced(action.slice(3)).toLowerCase()}`;
  if (action.startsWith('webhook.')) return 'Zoho sync';
  // material.create / sizing_model.update … → "Created" / "Updated"
  const tail = action.split('.').pop();
  const verb = { create: 'Created', update: 'Edited', delete: 'Deleted' }[tail];
  if (verb) return verb;
  return spaced(action.replace(/[._]/g, ' '));
}

// A one-line summary of the detail JSON, when it says something a person wants.
function detailText(d) {
  if (!d) return '';
  try {
    const o = typeof d === 'string' ? JSON.parse(d) : d;
    return Object.entries(o)
      .filter(([k]) => k !== 'keys')
      .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' · ');
  } catch { return ''; }
}

export function AuditList({ log }) {
  if (!log) return <Empty>Loading…</Empty>;
  if (!log.length) return <Empty>Nothing recorded yet.</Empty>;
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
      {log.map((e, i) => (
        <div key={i} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', gap: 12 }}>
          <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>{e.at}</span>
          <b style={{ minWidth: 200 }}>{friendlyAction(e.action)}</b>
          <span style={{ minWidth: 140 }}>{e.userName || 'System'}</span>
          <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailText(e.detail) || e.entityType}</span>
        </div>
      ))}
    </div>
  );
}

export default function HistoryTab({ entityType, entityId }) {
  const [log, setLog] = useState(null);
  useEffect(() => {
    setLog(null);
    axios.get('/api/activity', { params: { entityType, entityId } }).then(({ data }) => setLog(data)).catch(() => setLog([]));
  }, [entityType, entityId]);
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 20px 24px' }}>
      <AuditList log={log} />
    </div>
  );
}
