import { useSyncExternalStore } from 'react';

// Theme preference (CR-294): 'light' | 'dark' | 'system', localStorage only.
// Resolved value lands on <html data-theme>; index.html applies the same rule
// before first paint so there is no flash. No provider, no context.
const mq = matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set();

export const getPref = () => localStorage.getItem('theme') || 'system';

function apply() {
  const p = getPref();
  document.documentElement.dataset.theme = p === 'system' ? (mq.matches ? 'dark' : 'light') : p;
  listeners.forEach(l => l());
}

export function setPref(p) {
  if (p === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', p);
  apply();
}

mq.addEventListener('change', () => { if (getPref() === 'system') apply(); });

export function useTheme() {
  const pref = useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, getPref);
  return [pref, setPref];
}
