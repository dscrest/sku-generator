// Shared display formatters (CR-038) — one place for money/number/date so every
// page renders them the same way (en-IN lakh/crore grouping, ₹, dd/mm/yyyy).
const moneyFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('en-IN');

export function fmtMoney(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `₹${moneyFmt.format(n)}`;
}

export function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : numFmt.format(n);
}

// Accepts Data Store datetimes ("2026-08-21 12:00:00"), ISO strings and Dates.
export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10) : d.toLocaleDateString('en-IN');
}

// Whole days from today to `v` (CR-110): positive = days left, negative = overdue.
export function dueDays(v) {
  if (!v) return null;
  const d = new Date(String(v).slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d - new Date(new Date().toDateString())) / 86400000);
}
