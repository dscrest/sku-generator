// Pure merge of code-defined columns with saved org prefs. JSX-free so the
// node self-check can import it.
// Saved order first (unknown saved keys dropped), then any column the code
// knows but the saved order doesn't — newly added columns always surface.
// lock:true columns ignore hidden.
export function orderCols(columns, prefs) {
  const byKey = new Map(columns.map(c => [c.key, c]));
  const seen = new Set();
  const ordered = [];
  for (const k of prefs?.order || []) {
    const c = byKey.get(k);
    if (c && !seen.has(k)) { ordered.push(c); seen.add(k); }
  }
  for (const c of columns) if (!seen.has(c.key)) ordered.push(c);
  const hidden = new Set(prefs?.hidden || []);
  return ordered.filter(c => c.lock || !hidden.has(c.key));
}
