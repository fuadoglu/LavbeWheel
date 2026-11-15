import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function json(file) { return JSON.parse(await readFile(path.join(root, file), 'utf8')); }
const [registry, routes, research, publications, schema] = await Promise.all([
  json('config/locales.json'), json('config/seo/routes.json'), json('config/seo/locale-research.json'),
  json('config/seo/publications.json'), json('contracts/seo-publication.schema.json'),
]);
const catalogFiles = (await readdir(path.join(root, 'content/locales'))).filter((file) => file.endsWith('.json'));
const catalogs = new Map(await Promise.all(catalogFiles.map(async (file) => {
  const value = await json(path.join('content/locales', file));
  return [value.locale, value];
})));
const errors = [];
const validate = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
const locales = new Set(registry.locales.map((item) => item.code));
const routeIds = new Map(routes.routes.map((item) => [item.id, item]));
const researchByLocale = new Map(research.locales.map((item) => [item.locale, item]));
const seen = new Set();
const expectedPath = (route, locale) => route.id === 'home'
  ? (locale === routes.defaultLocale ? '/' : `/${locale}/`)
  : `/${locale}/${route.slug}/`;

if (registry.locales.length !== 110 || research.locales.length !== registry.locales.length || researchByLocale.size !== registry.locales.length) errors.push('Locale SEO research queue must cover every unique registry locale.');
for (const page of publications.pages) {
  const key = `${page.locale}:${page.routeId}`;
  if (seen.has(key)) errors.push(`Duplicate publication record for ${key}.`);
  seen.add(key);
  if (!validate(page)) errors.push(`Publication record ${key} does not match seo-publication.schema.json: ${JSON.stringify(validate.errors)}`);
  const route = routeIds.get(page.routeId);
  if (!route) errors.push(`Publication record ${key} references an unknown route.`);
  if (!locales.has(page.locale)) errors.push(`Publication record ${key} references an unknown locale.`);
  if (route && page.path !== expectedPath(route, page.locale)) errors.push(`Publication record ${key} uses a non-canonical localized path.`);
  if (catalogs.get(page.locale)?.status !== 'reviewed') errors.push(`Publication record ${key} has no reviewed UI catalog.`);
  if (researchByLocale.get(page.locale)?.status !== 'reviewed') errors.push(`Publication record ${key} has no completed locale research.`);
  if (route?.researchStatus !== 'researched') errors.push(`Publication record ${key} has no completed route-intent research.`);
}

if (errors.length) {
  errors.forEach((error) => console.error(`FAIL: ${error}`));
  process.exit(1);
}
console.log(`PASS: ${publications.pages.length} published page approvals satisfy the schema and locale/route/path gates.`);
if (publications.pages.length === 0) console.log('READINESS: no page has copy/SEO approval; every rendered public page must remain noindex.');
