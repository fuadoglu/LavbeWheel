import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import inventory from '../config/seo/template-inventory.json' with { type: 'json' };

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const failures = [];
const manifest = JSON.parse(await readFile(join(root, 'manifest.webmanifest'), 'utf8'));
const precache = JSON.parse(await readFile(join(root, 'pwa-precache.json'), 'utf8'));
const worker = await readFile(join(root, 'sw.js'), 'utf8');
if (manifest.start_url !== '/' || manifest.scope !== '/' || manifest.display !== 'standalone') failures.push('Manifest must use a root-scoped standalone public app entry.');
if (!/^[a-f0-9]{16}$/.test(precache.buildId) || !worker.includes(`const BUILD_ID = '${precache.buildId}'`)) failures.push('Generated worker and manifest build IDs do not match.');
if (precache.precacheBytes > precache.limitBytes || precache.limitBytes > 30 * 1024 * 1024) failures.push('Precache asset budget exceeds 30 MiB.');
if (new Set(precache.entries).size !== precache.entries.length) failures.push('Precache contains duplicate URLs.');
if (precache.entries.some((url) => /^(?:https?:)?\/\//i.test(url) || /(?:^|\/)(?:api|s|admin|preview)(?:\/|$)/i.test(url) || /[?&](?:token|key|capability|share|auth)=/i.test(url))) failures.push('Precache includes an external, private or token-bearing URL.');
for (const icon of manifest.icons ?? []) {
  if (!icon.src.startsWith('/') || icon.type !== 'image/png') failures.push(`Manifest icon ${icon.src} must be a same-origin PNG.`);
  try { await access(join(root, icon.src.replace(/^\//, ''))); }
  catch { failures.push(`Manifest icon is missing: ${icon.src}`); }
}
for (const file of ['favicon.ico', 'icons/apple-touch-icon.png']) {
  try { await access(join(root, file)); }
  catch { failures.push(`PWA icon is missing: ${file}`); }
}
for (const page of inventory.pages) {
  const html = await readFile(join(root, page.file), 'utf8');
  if (!html.includes('rel="manifest"') || !/type="module" src="\/_astro\/[^" ]+\.js"/.test(html)) failures.push(`${page.path} is missing manifest or bundled client script wiring.`);
}
if (!precache.entries.some((url) => /\/pwa-client\.[^/]+\.js$/.test(url))) failures.push('Precache does not include the locale-aware update client.');
if (!worker.includes('const PRIVATE_PATH') || !worker.includes('PRIVATE_PATH.test(url.pathname)') || !worker.includes('url.searchParams.keys()') || !worker.includes('PRIVATE_QUERY_KEYS.has(key.toLowerCase())')) failures.push('Worker does not explicitly bypass private and capability routes.');
if (!worker.includes("event.data?.type === 'LAVBE_ACTIVATE_UPDATE'") || !worker.includes('self.skipWaiting()')) failures.push('Worker has no explicit user-message update activation boundary.');
if (worker.includes("self.addEventListener('install'") && /self\.skipWaiting\(\)/.test(worker.slice(0, worker.indexOf("self.addEventListener('activate'")))) failures.push('Worker must not skip waiting during installation.');
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`PASS: manifest, ${manifest.icons.length} install icon variants, ${precache.entries.length} same-origin precache URLs, route registration wiring and private-cache exclusions.`);
console.log('LIMITATION: browser simulation covers only current built routes; native install UX, physical-device storage eviction, CDN headers and old-client/two-release compatibility still need acceptance.');
