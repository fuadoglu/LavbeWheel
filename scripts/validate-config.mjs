import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function json(file) { return JSON.parse(await readFile(path.join(root, file), 'utf8')); }
const [limits, locales, tokens, map, assets, routes, templates] = await Promise.all([
  json('config/limits.json'), json('config/locales.json'), json('config/design-tokens.json'),
  json('config/icon-map.json'), json('config/icon-assets.json'), json('config/seo/routes.json'), json('config/seo/template-inventory.json'),
]);
const errors = [];
if (locales.locales.length !== locales.launchLocaleCount) errors.push('Locale count does not match launchLocaleCount');
if (!locales.locales.some((locale) => locale.code === locales.defaultLocale)) errors.push('defaultLocale is missing from locale registry');
if (limits.entries.min !== 1 || limits.entries.max < limits.entries.min) errors.push('Entry limits are invalid');
if (limits.motion.minSeconds > limits.motion.defaultSeconds || limits.motion.defaultSeconds > limits.motion.maxSeconds) errors.push('Motion duration defaults are outside configured bounds');
if (tokens.controlMinPx < 44) errors.push('Design controls are below the 44px hit target contract');
const unique = (values) => new Set(values).size === values.length;
if (!unique(routes.routes.map((route) => route.id)) || !unique(routes.routes.map((route) => route.slug))) errors.push('SEO route IDs and slugs must be unique.');
if (!unique(routes.routes.map((route) => route.intent))) errors.push('SEO route intents must have one owner each.');
if (routes.routes.filter((route) => route.id === 'home').length !== 1) errors.push('SEO registry must have exactly one global home intent.');
if (!unique(templates.pages.map((page) => page.file)) || !unique(templates.pages.map((page) => page.path))) errors.push('Implemented SEO template files and paths must be unique.');
for (const page of templates.pages) {
  if (!routes.routes.some((route) => route.id === page.routeId)) errors.push(`Implemented SEO template references unknown intent ${page.routeId}.`);
  if (!page.file.endsWith('.html') || page.file.startsWith('/') || page.file.split('/').includes('..')) errors.push(`Implemented SEO template has an unsafe output path ${page.file}.`);
  if (!page.path.startsWith('/') || page.path !== '/' && !page.path.endsWith('/')) errors.push(`Implemented SEO template path must be absolute and slash-normalized: ${page.path}.`);
}
const available = new Set(assets.assets.filter((item) => item.weight === 'regular' || item.weight === 'fill').map((item) => item.name));
for (const [action, icon] of Object.entries(map.actions)) if (!available.has(icon)) errors.push(`Icon mapping ${action} references unavailable icon ${icon}`);
if (errors.length) { for (const error of errors) console.error(`FAIL: ${error}`); process.exit(1); }
console.log(`PASS: ${locales.locales.length} locale records, ${routes.routes.length} unique SEO intents, ${templates.pages.length} implemented page templates, limits, design tokens and ${Object.keys(map.actions).length} icon mappings are internally consistent.`);
