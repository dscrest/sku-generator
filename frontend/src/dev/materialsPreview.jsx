// Dev-only preview of the redesigned MaterialsGrid — open /materialsPreview.html
// with `npm run dev`, no backend needed. It stubs the axios calls the grid makes
// (grid load, refresh, txn) with the eight sample lines from the mockup so the
// new reservation UI can be seen and clicked through in isolation.
// ponytail: throwaway harness, not shipped — excluded from the app bundle.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import MaterialsGrid from '../components/MaterialsGrid.jsx';
import '../index.css';

// name, sku, uom, bom(total need), stock, reserved, issued, po, received, billed
const SEED = [
  ['Dhiraj Sub item 2', 'DSUB2', 'nos', 1000, 96, 96, 0, 0, 0, 0],
  ['Dhiraj Sub item 1', 'DSUB1', 'nos', 1000, 96, 96, 0, 0, 0, 0],
  ['Bearing 6204 ZZ', 'BRG-6204', 'nos', 24, 0, 0, 0, 0, 0, 0],
  ['Steel plate 4 mm', 'PLT-4MM', 'kg', 120, 120, 96, 0, 0, 0, 0],
  ['Gasket ring 88 mm', 'GSK-88', 'nos', 200, 640, 140, 0, 0, 0, 0],
  ['Hex bolt M6 × 30', 'FAST-M6-30', 'nos', 480, 3000, 480, 0, 0, 0, 0],
  ['Copper wire 2.5 sq', 'WIR-2.5', 'm', 60, 900, 0, 60, 0, 0, 0],
  ['Powder coat, black', 'PC-BLK-20', 'kg', 8, 14, 0, 8, 0, 0, 0],
];

// Mirror the backend formulas so the sample rows behave like real ones.
function row([name, sku, uom, bom, stock, reserved, issued, po, received, billed], i) {
  const needed = Math.max(0, bom - reserved - issued);
  const reservable = Math.max(0, Math.min(bom - reserved - issued - billed, stock - reserved));
  const shortfallQty = Math.max(0, needed - reservable - Math.max(0, po - received));
  return {
    itemId: `it-${i}`, workOrderLineId: `wol-${i}`, name, sku, uom,
    bom, stock, reserved, issued, po, received, billed,
    reservable, extraReserved: bom + reserved - issued - billed,
    needed, short: reservable < needed, shortfallQty,
  };
}

const rows = SEED.map(row);
const grid = {
  workOrderId: 'WO-0009', workOrderFgId: 'fg-1', fgItemId: 'fg-item-1',
  fgName: 'Dhiraj SA Workorder', fgQty: 1, revision: 1,
  lastSyncAt: '07:05 today', warehousesConfigured: true,
  rows, shortCount: rows.filter(r => r.short).length,
};

// Intercept the three endpoints MaterialsGrid talks to.
axios.defaults.adapter = (config) => {
  const { url = '', method = 'get' } = config;
  return new Promise((resolve) => setTimeout(() => {
    if (url.includes('/grid')) return resolve({ data: grid, status: 200, config });
    if (url.endsWith('/refresh')) return resolve({ data: { ok: true }, status: 200, config });
    if (url.endsWith('/txn')) return resolve({ data: { txnNumber: 'TXN-PREVIEW' }, status: 200, config });
    resolve({ data: {}, status: 200, config });
  }, method === 'get' ? 150 : 400));
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MemoryRouter>
      <Toaster position="bottom-right" />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 13, color: 'var(--text-secondary)' }}>
          <b style={{ color: 'var(--text-primary)' }}>WO-0009</b> · Dhiraj SA Workorder · Main → Reserve warehouse
          <span style={{ color: 'var(--text-muted)' }}> — preview (sample data)</span>
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <MaterialsGrid workOrderId="WO-0009" fgs={[{ id: 'fg-1', name: 'Dhiraj SA Workorder', qty: 1 }]} onChanged={() => {}} />
        </div>
      </div>
    </MemoryRouter>
  </StrictMode>,
);
