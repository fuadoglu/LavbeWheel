import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import localeRegistry from '../config/locales.json' with { type: 'json' };
import routeRegistry from '../config/seo/routes.json' with { type: 'json' };
import localeResearch from '../config/seo/locale-research.json' with { type: 'json' };
import pagePublications from '../config/seo/publications.json' with { type: 'json' };
import urlCases from '../config/seo/url-cases.json' with { type: 'json' };
import { getPublishedAlternates, getSeoPageState, getXDefaultHref, implementedPublicPages } from '../apps/web/src/data/seo.ts';

const root = new URL('../apps/web/dist/', import.meta.url);
const iconLicense = await readFile(new URL('licenses/phosphor-MIT.txt', root), 'utf8');
const routeManifest = JSON.parse(await readFile(new URL('route-manifest.json', root), 'utf8'));
const seoAudit = JSON.parse(await readFile(new URL('seo-audit.json', root), 'utf8'));
const redirectManifest = JSON.parse(await readFile(new URL('redirect-manifest.json', root), 'utf8'));
const robotsTxt = await readFile(new URL('robots.txt', root), 'utf8');
const pages = implementedPublicPages;
const failures = [];
const getMeta = (html, name) => html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i'))?.[1] ?? null;
const canonical = (html) => html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1] ?? null;
const alternates = (html) => [...html.matchAll(/<link\s+rel=["']alternate["']\s+hreflang=["']([^"']+)["']\s+href=["']([^"']+)["']/gi)].map((match) => [match[1], match[2]]);
const xDefault = (html) => [...html.matchAll(/<link\s+rel=["']alternate["']\s+hreflang=["']x-default["']\s+href=["']([^"']+)["']/gi)].map((match) => match[1]);

for (const page of pages) {
  const html = await readFile(new URL(page.file, root), 'utf8');
  const locale = html.match(/<html\s+lang=["']([^"']+)["']/i)?.[1] ?? '';
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const description = getMeta(html, 'description');
  const heading = html.match(/<h1\b[^>]*>(.*?)<\/h1>/is)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const state = getSeoPageState(page.routeId, locale, page.path);
  if (!title) failures.push(`${page.path}: title missing`);
  if (!description) failures.push(`${page.path}: description missing`);
  if (!heading) failures.push(`${page.path}: primary H1 missing`);
  if (getMeta(html, 'robots') !== state.robots) failures.push(`${page.path}: robots directive does not match publication gates`);
  if (canonical(html) !== state.canonical) failures.push(`${page.path}: canonical does not match the approved localized path`);
  const actualAlternates = alternates(html).sort(([a], [b]) => a.localeCompare(b));
  const expectedAlternates = getPublishedAlternates(page.routeId).map(({ locale: code, href }) => [code, href]).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(actualAlternates) !== JSON.stringify(expectedAlternates)) failures.push(`${page.path}: hreflang links do not match published same-intent alternatives`);
  const expectedXDefault = state.robots === 'index,follow' ? getXDefaultHref(page.routeId) : null;
  const actualXDefault = xDefault(html).sort();
  const expectedXDefaults = expectedXDefault ? [expectedXDefault] : [];
  if (JSON.stringify(actualXDefault) !== JSON.stringify(expectedXDefaults)) failures.push(`${page.path}: x-default does not match the approved same-intent route`);
  if (page.routeId === 'group-games' && !html.includes('Kart tapşırıqları hazırda ingilis dilindədir.')) failures.push('Azerbaijani game page does not disclose that its prompt pack is English.');
}

const admin = await readFile(new URL('admin/index.html', root), 'utf8');
if (getMeta(admin, 'robots') !== 'noindex,nofollow,noarchive') failures.push('Admin page is not protected from indexing.');
if (canonical(admin) || alternates(admin).length) failures.push('Admin page must not publish canonical or hreflang metadata.');
if (!iconLicense.includes('Copyright (c) 2023 Phosphor Icons') || !iconLicense.includes('MIT License')) failures.push('Distributed Phosphor SVG asset license is missing from static output.');

const expectedPages = ['admin/index.html', ...pages.map((page) => page.file)];
for (const file of expectedPages) await access(new URL(file, root));
async function collectHtml(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collectHtml(path.join(directory, entry.name), relative));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(relative);
  }
  return files;
}
const actualPages = (await collectHtml(fileURLToPath(root))).sort();
if (JSON.stringify(actualPages) !== JSON.stringify([...expectedPages].sort())) failures.push(`Unexpected built page inventory: ${JSON.stringify(actualPages)}`);
let sitemapExists = true;
try { await access(new URL('sitemap-index.xml', root)); } catch { sitemapExists = false; }
const indexable = pagePublications.pages.filter((page) => {
  const route = routeRegistry.routes.find((item) => item.id === page.routeId);
  const path = route ? (route.id === 'home' ? (page.locale === routeRegistry.defaultLocale ? '/' : `/${page.locale}/`) : `/${page.locale}/${route.slug}/`) : '';
  return getSeoPageState(page.routeId, page.locale, path).robots === 'index,follow';
});
if (indexable.length === 0 && sitemapExists) failures.push('A sitemap exists although no localized page has publication approval.');
if (indexable.length > 0 && !sitemapExists) failures.push('Approved indexable pages exist but sitemap-index.xml is missing.');
if (!robotsTxt.includes('User-agent: *') || !robotsTxt.includes('Allow: /')) failures.push('robots.txt does not allow crawlers to access public assets and routes.');
if ((indexable.length > 0) !== robotsTxt.includes('/sitemap-index.xml')) failures.push('robots.txt sitemap declaration does not match the generated sitemap state.');
if (routeManifest.routes.length !== pages.length || routeManifest.plannedPublicRouteCount !== localeRegistry.locales.length * routeRegistry.routes.length + 1 + routeRegistry.legalSlugs.length) failures.push('route-manifest.json does not match implemented and planned route inventory.');
for (const page of pages) {
  const row = routeManifest.routes.find((route) => route.path === page.path && route.routeId === page.routeId);
  if (!row) failures.push(`${page.path}: route-manifest.json entry is missing.`);
  else if (row.robots !== getSeoPageState(page.routeId, row.locale, page.path).robots || row.canonical !== getSeoPageState(page.routeId, row.locale, page.path).canonical) failures.push(`${page.path}: route-manifest.json indexing state does not match the publication gate.`);
}
if (seoAudit.plannedPublicRouteCount !== routeManifest.plannedPublicRouteCount || seoAudit.implementedPublicRouteCount !== pages.length || seoAudit.indexablePublicRouteCount !== indexable.length) failures.push('seo-audit.json counts do not match the built route manifest.');
if (seoAudit.checks.length !== 12 || seoAudit.checks.some((check, index) => check.requirementId !== `SEO-${String(index + 1).padStart(2, '0')}`)) failures.push('seo-audit.json must report every SEO-01–SEO-12 acceptance row.');
if (seoAudit.checks.find((check) => check.requirementId === 'SEO-02')?.status !== 'pass') failures.push('seo-audit.json must report the locally validated route-intent ownership check.');
if (indexable.length === 0 && seoAudit.checks.find((check) => check.requirementId === 'SEO-06')?.status !== 'pass') failures.push('seo-audit.json must verify sitemap equality for the empty approved URL set.');
if (redirectManifest.status !== 'fixtures-only-host-adapter-not-implemented' || JSON.stringify(redirectManifest.rules) !== JSON.stringify(urlCases.cases)) failures.push('redirect-manifest.json must preserve all URL fixtures and disclose that host behavior is not implemented.');
if (localeRegistry.locales.length !== 110 || localeResearch.locales.length !== localeRegistry.locales.length) failures.push('SEO research queue does not cover the full locale registry.');

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
const planned = localeRegistry.locales.length * routeRegistry.routes.length;
const pendingLocales = localeResearch.locales.filter((record) => record.status !== 'reviewed').length;
console.log(`PASS: audited ${pages.length} implemented public pages and the internal admin route; unapproved pages are noindex with no canonical or hreflang.`);
const plannedPublic = planned + 1 + routeRegistry.legalSlugs.length;
console.log(`READINESS: ${plannedPublic} public routes planned (${planned} locale-route pairs, one global home and ${routeRegistry.legalSlugs.length} legal pages); ${pagePublications.pages.length} localized approvals; ${indexable.length} indexable routes; ${pendingLocales}/${localeRegistry.locales.length} locale research records pending.`);
if (process.argv.includes('--require-complete')) {
  const remaining = plannedPublic - indexable.length;
  console.error(`BLOCKED: release SEO gate has ${indexable.length}/${plannedPublic} published public routes; ${remaining} remain. Native research, route content, legal pages, sitemap and full crawler coverage must be completed before deployment.`);
  process.exit(1);
}
console.log('LIMITATION: public route coverage, sitemap/URL behavior for localized routes and production-origin checks remain incomplete.');
