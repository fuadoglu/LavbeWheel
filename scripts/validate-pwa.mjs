import { access } from 'node:fs/promises';
const candidates = ['apps/web/public/manifest.webmanifest', 'apps/web/public/sw.js'];
const missing = [];
for (const candidate of candidates) {
  try { await access(new URL(`../${candidate}`, import.meta.url)); }
  catch { missing.push(candidate); }
}
if (missing.length) {
  console.error(`BLOCKED: PWA-01 is not implemented (WP10). Missing ${missing.join(', ')}. No offline/update behavior is claimed.`);
  process.exit(1);
}
console.log('PWA artifacts exist. Install/offline/update behavior still requires the WP10 browser/device matrix.');
