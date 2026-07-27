/**
 * Shared original mark for Biashara Guide — a check-in-a-badge motif in the
 * app's own black/yellow palette. Not a reproduction of any organization's
 * registered logo. Used by both the citizen app (app.js) and the officer
 * console (officer.js) so the two front-ends still share one visual identity.
 */
export function brandMarkSvg() {
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Biashara Guide">
    <rect x="4" y="4" width="92" height="92" rx="26" fill="#0A0A0A"/>
    <path d="M28 52 L44 68 L74 34" stroke="#F9E50F" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}
