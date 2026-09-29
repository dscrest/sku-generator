import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import Modal, { ModalFooter, ModalBtn } from './Modal.jsx';

/** Create a Zoho Books SERVICE item without leaving the form (CR-254):
 *  Name · SKU · SAC · Rate → POST /api/recipe/service-items → Books item
 *  (product_type service) + SKU-master row. onCreated(item) gets
 *  { id, sku, name, inBooks, service } — the same shape as /api/recipe/products. */
const field = { height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0 10px', fontSize: 13, fontFamily: 'var(--font)', width: '100%', boxSizing: 'border-box', background: 'var(--bg-card)' };
const lbl = { fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };

export default function NewServiceItemModal({ initialName = '', onCreated, onClose }) {
  const [f, setF] = useState({ name: initialName, sku: '', sac: '', rate: '' });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF(v => ({ ...v, [k]: e.target.value }));
  async function create() {
    if (!f.name.trim() || !f.sku.trim()) return toast.error('Name and SKU are required');
    setBusy(true);
    try {
      const { data } = await axios.post('/api/recipe/service-items', f);
      toast.success(`${data.sku} created in Zoho Books`);
      onCreated(data);
    } catch (err) { toast.error(err.response?.data?.error || 'Could not create the service item'); setBusy(false); }
  }
  return (
    <Modal title="New service item in Zoho Books" onClose={onClose} onSubmit={create} width={460}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div><label style={lbl}>Name</label><input style={field} value={f.name} onChange={set('name')} placeholder="e.g. Coating service" autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={lbl}>SKU</label><input style={{ ...field, fontFamily: 'var(--font-mono)' }} value={f.sku} onChange={set('sku')} placeholder="e.g. SVC-COAT" /></div>
          <div><label style={lbl}>SAC (optional)</label><input style={{ ...field, fontFamily: 'var(--font-mono)' }} value={f.sac} onChange={set('sac')} placeholder="e.g. 998873" /></div>
        </div>
        <div><label style={lbl}>Rate (optional)</label><input style={{ ...field, fontFamily: 'var(--font-mono)' }} type="number" min="0" step="0.01" value={f.rate} onChange={set('rate')} /></div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Created as a Service item (sales & purchases, unit nos) in Books and added to the SKU master.</div>
      </div>
      <ModalFooter>
        <ModalBtn onClick={onClose} disabled={busy}>Cancel</ModalBtn>
        <ModalBtn variant="primary" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create in Books'}</ModalBtn>
      </ModalFooter>
    </Modal>
  );
}
