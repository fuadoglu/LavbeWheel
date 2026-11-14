import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function json(file) { return JSON.parse(await readFile(path.join(root, file), 'utf8')); }
const [limits, locales, tokens, map, assets] = await Promise.all([
  json('config/limits.json'), json('config/locales.json'), json('config/design-tokens.json'),
  json('config/icon-map.json'), json('config/icon-assets.json'),
]);
const errors = [];
if (locales.locales.length !== locales.launchLocaleCount) errors.push('Locale count does not match launchLocaleCount');
if (!locales.locales.some((locale) => locale.code === locales.defaultLocale)) errors.push('defaultLocale is missing from locale registry');
if (limits.entries.min !== 1 || limits.entries.max < limits.entries.min) errors.push('Entry limits are invalid');
if (limits.motion.minSeconds > limits.motion.defaultSeconds || limits.motion.defaultSeconds > limits.motion.maxSeconds) errors.push('Motion duration defaults are outside configured bounds');
if (tokens.controlMinPx < 44) errors.push('Design controls are below the 44px hit target contract');
const available = new Set(assets.assets.filter((item) => item.weight === 'regular' || item.weight === 'fill').map((item) => item.name));
for (const [action, icon] of Object.entries(map.actions)) if (!available.has(icon)) errors.push(`Icon mapping ${action} references unavailable icon ${icon}`);
if (errors.length) { for (const error of errors) console.error(`FAIL: ${error}`); process.exit(1); }
console.log(`PASS: ${locales.locales.length} locale records, limits, design tokens and ${Object.keys(map.actions).length} icon mappings are internally consistent.`);
