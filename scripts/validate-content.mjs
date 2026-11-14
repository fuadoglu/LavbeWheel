import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registry = JSON.parse(await readFile(path.join(root, 'config/locales.json'), 'utf8'));
const duplicateCodes = registry.locales.map((locale) => locale.code).filter((code, index, all) => all.indexOf(code) !== index);
if (duplicateCodes.length || registry.locales.length !== registry.launchLocaleCount) {
  console.error('FAIL: locale registry count or uniqueness is invalid.');
  process.exit(1);
}
const files = (await readdir(path.join(root, 'content/locales'))).filter((file) => file.endsWith('.json')).sort();
const catalogs = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(root, 'content/locales', file), 'utf8'))));
const byLocale = new Map(catalogs.map((catalog) => [catalog.locale, catalog]));
for (const catalog of catalogs) {
  if (!registry.locales.some((locale) => locale.code === catalog.locale)) throw new Error(`Unknown locale catalog: ${catalog.locale}`);
  if (catalog.status === 'reviewed') throw new Error(`${catalog.locale} cannot be marked reviewed without review evidence.`);
}
const english = byLocale.get('en');
if (!english) throw new Error('English source catalog is required.');
const keys = Object.keys(english.messages).sort();
for (const catalog of catalogs) {
  const actual = Object.keys(catalog.messages).sort();
  if (JSON.stringify(actual) !== JSON.stringify(keys)) throw new Error(`${catalog.locale} catalog keys differ from English.`);
  for (const key of keys) {
    const expected = [...(english.messages[key].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g))].map((match) => match[1]).sort();
    const received = [...(catalog.messages[key].matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g))].map((match) => match[1]).sort();
    if (JSON.stringify(expected) !== JSON.stringify(received)) throw new Error(`${catalog.locale}.${key} placeholder mismatch.`);
  }
}
const missing = registry.locales.length - catalogs.length;
console.log(`PASS: ${registry.locales.length} locale metadata records are unique; ${catalogs.length} draft catalogs have matching keys/placeholders (${missing} catalogs pending). No translation-review status is inferred.`);
