/**
 * Memory Engine — persists just enough state (profile, chat, language) so a
 * returning user is recognised, per the Functional Specification's Memory
 * Engine and Module 9. Browser-only (localStorage); a future mobile/USSD
 * channel would swap this for a server-side session store behind the same
 * load()/save()/clear() interface.
 */

const STORAGE_KEY = 'biashara-guide:v1';

export function loadMemory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveMemory(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
  } catch {
    // Storage unavailable (private mode, quota) — guidance still works, just not remembered.
  }
}

export function clearMemory() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export function describeLastVisit(savedAt, lang) {
  if (!savedAt) return null;
  const days = Math.floor((Date.now() - savedAt) / 86400000);
  if (days <= 0) return lang === 'sw' ? 'Leo' : 'Today';
  if (days === 1) return lang === 'sw' ? 'Jana' : 'Yesterday';
  if (days < 14) return lang === 'sw' ? `Siku ${days} zilizopita` : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return lang === 'sw' ? `Wiki ${weeks} zilizopita` : `${weeks} weeks ago`;
}
