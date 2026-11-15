import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import inventory from '../config/seo/template-inventory.json' with { type: 'json' };

const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const limit = 30 * 1024 * 1024;
const toPublicUrl = (file) => `/${relative(root, file).split(sep).join('/')}`;
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const htmlRoutes = inventory.pages.map((page) => `/${page.file.replace(/(?:^|\/)index\.html$/, (part) => part === 'index.html' ? '' : '/')}`);
const files = await walk(root);
const assets = files.filter((file) => {
  const url = toPublicUrl(file);
  return url.startsWith('/_astro/') && !/\/admin(?:\.|\.astro_)/.test(url) || url.startsWith('/icons/') || url === '/favicon.ico' || url === '/manifest.webmanifest';
}).sort();
const selected = [];
let bytes = 0;
for (const asset of assets) {
  const size = (await stat(asset)).size;
  if (size > limit) continue;
  if (bytes + size > limit) continue;
  selected.push(toPublicUrl(asset));
  bytes += size;
}
const precache = [...new Set([...htmlRoutes, ...selected])].sort();
const buildId = createHash('sha256').update(await Promise.all(precache.map(async (url) => {
  const path = url.endsWith('/') ? join(root, url.replace(/^\//, ''), 'index.html') : join(root, url.replace(/^\//, ''));
  const content = await readFile(path);
  return `${url}\0${createHash('sha256').update(content).digest('hex')}`;
})).then((rows) => rows.join('\n'))).digest('hex').slice(0, 16);
const workerTemplate = await readFile(new URL('../apps/web/public/sw.js', import.meta.url), 'utf8');
const worker = workerTemplate.replace('__LAVBE_BUILD_ID__', buildId).replace('__LAVBE_PRECACHE_URLS__', JSON.stringify(precache));
if (worker.includes('__LAVBE_')) throw new Error('PWA worker build tokens were not replaced.');
await writeFile(join(root, 'sw.js'), worker);
await writeFile(join(root, 'pwa-precache.json'), `${JSON.stringify({ buildId, entries: precache, precacheBytes: bytes, limitBytes: limit }, null, 2)}\n`);
console.log(`PWA artifacts generated: ${precache.length} pre-cache URLs, ${bytes} asset bytes / ${limit} byte asset limit, build ${buildId}.`);
