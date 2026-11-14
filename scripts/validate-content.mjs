import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
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
const limits = JSON.parse(await readFile(path.join(root, 'config/limits.json'), 'utf8'));
const packSchema = JSON.parse(await readFile(path.join(root, 'contracts/pack.schema.json'), 'utf8'));
const validatePack = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(packSchema);
const packRoot = path.join(root, 'content/packs/en');
const packFiles = (await readdir(packRoot)).filter((file) => file.endsWith('.json')).sort();
const packs = await Promise.all(packFiles.map(async (file) => ({ file, value: JSON.parse(await readFile(path.join(packRoot, file), 'utf8')) })));
const families = new Set();
const cardIds = new Set();
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
for (const { file, value } of packs) {
  if (!validatePack(value)) throw new Error(`${file} does not match pack.schema.json: ${JSON.stringify(validatePack.errors)}`);
  if (families.has(value.family)) throw new Error(`Duplicate English source pack family: ${value.family}`);
  families.add(value.family);
  if (value.cards.length < limits.content.minCardsPerFamily) throw new Error(`${file} has fewer than ${limits.content.minCardsPerFamily} cards`);
  for (const card of value.cards) {
    if (cardIds.has(card.id)) throw new Error(`Duplicate content card ID: ${card.id}`);
    cardIds.add(card.id);
    if (/<\/?[a-z][^>]*>/i.test(card.text)) throw new Error(`Markup is not allowed in ${card.id}`);
  }
  const { review, ...source } = value;
  const sourceHash = createHash('sha256').update(stable(source)).digest('hex');
  if (review.sourceHash !== sourceHash) throw new Error(`${file} sourceHash does not match its pack content`);
  if (review.status === 'reviewed') throw new Error(`${file} cannot be marked reviewed without external cultural/content review evidence`);
}
if (families.size !== limits.content.families) throw new Error(`Expected ${limits.content.families} English source pack families, found ${families.size}`);
console.log(`PASS: ${registry.locales.length} locale metadata records are unique; ${catalogs.length} UI catalogs match keys/placeholders (${missing} pending); ${packs.length} English draft packs cover ${families.size} families and ${cardIds.size} cards. Translation, suitability and cultural review are not inferred.`);
