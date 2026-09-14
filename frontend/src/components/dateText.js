// dd/mm/yyyy <-> yyyy-MM-dd helpers for DateInput. Pure + JSX-free so the
// node test can import them directly.
export const pad = n => String(n).padStart(2, '0');

export function toDMY(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function parseDMY(s) {
  const m = /^\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*$/.exec(s || '');
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, d); // local; never parse iso strings (UTC shift)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
