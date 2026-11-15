import { createHash } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import localeRegistry from '../config/locales.json' with { type: 'json' };
import routeRegistry from '../config/seo/routes.json' with { type: 'json' };
import localeResearch from '../config/seo/locale-research.json' with { type: 'json' };
import urlCases from '../config/seo/url-cases.json' with { type: 'json' };
import pagePublications from '../config/seo/publications.json' with { type: 'json' };
import { expectedLocalizedPath, getPublishedAlternates, getSeoPageState, implementedPublicPages } from '../apps/web/src/data/seo.ts';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/dist');
const origin = routeRegistry.origin;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const writeJson = (file, value) => writeFile(path.join(dist, file), `${JSON.stringify(value, null, 2)}\n`);
const htmlText = (html, expression) => html.match(expression)?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '';
const publicRoutes = [];
for (const page of implementedPublicPages) {
  const html = await readFile(path.join(dist, page.file), 'utf8');
  const locale = html.match(/<html\s+lang=["']([^"']+)["']/i)?.[1] ?? '';
  const title = htmlText(html, /<title>([^<]+)<\/title>/i);
  const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1] ?? '';
  const h1 = htmlText(html, /<h1\b[^>]*>(.*?)<\/h1>/is);
  const state = getSeoPageState(page.routeId, locale, page.path);
  publicRoutes.push({
    path: page.path,
    routeId: page.routeId,
    locale,
    contentHash: sha256(html),
    title,
    description,
    h1,
    expectedLocalizedPath: expectedLocalizedPath(page.routeId, locale),
    canonical: state.canonical,
    robots: state.robots,
    httpExpectation: 200,
    alternates: getPublishedAlternates(page.routeId),
    sitemap: null,
    sourceReviewIds: state.robots === 'index,follow'
      ? [`locale-research:${locale}`, `route-intent:${page.routeId}`, `publication:${locale}:${page.routeId}`]
      : [],
    approval: state.robots === 'index,follow'
      ? { copyReviewer: state.approvedCopy ? pagePublications.pages.find((record) => record.locale === locale && record.routeId === page.routeId)?.copyReviewer : null,
          seoReviewer: pagePublications.pages.find((record) => record.locale === locale && record.routeId === page.routeId)?.seoReviewer ?? null }
      : null,
    blockers: state.blockers,
  });
}

const inventory = routeRegistry.routes.length * localeRegistry.locales.length + 1 + routeRegistry.legalSlugs.length;
const available = publicRoutes.filter((route) => route.robots === 'index,follow');
const publicationFiles = new Set();
for (const route of available) {
  const relative = route.path === '/' ? 'index.html' : `${route.path.replace(/^\//, '')}index.html`;
  try { await access(path.join(dist, relative)); publicationFiles.add(relative); }
  catch { route.blockers.push('published-route-html-not-built'); }
}
const indexableRoutes = available.filter((route) => publicationFiles.has(route.path === '/' ? 'index.html' : `${route.path.replace(/^\//, '')}index.html`));
const sitemapFiles = [];
for (const locale of [...new Set(indexableRoutes.map((route) => route.locale))].sort()) {
  const filename = `sitemap-${locale}.xml`;
  const entries = indexableRoutes.filter((route) => route.locale === locale);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((route) => `  <url><loc>${new URL(route.path, origin).href}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(path.join(dist, filename), xml);
  for (const route of entries) route.sitemap = filename;
  sitemapFiles.push(filename);
}
if (sitemapFiles.length) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapFiles.map((filename) => `  <sitemap><loc>${new URL(`/${filename}`, origin).href}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`;
  await writeFile(path.join(dist, 'sitemap-index.xml'), xml);
}
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${sitemapFiles.length ? `Sitemap: ${new URL('/sitemap-index.xml', origin).href}\n` : ''}`);

const buildId = process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'local';
const routeManifest = {
  version: 1,
  buildId,
  origin,
  scope: 'Implemented Astro templates only; planned locale-route combinations are not generated without reviewed content.',
  plannedPublicRouteCount: inventory,
  implementedPublicRouteCount: publicRoutes.length,
  indexablePublicRouteCount: indexableRoutes.length,
  sitemapIndex: sitemapFiles.length ? '/sitemap-index.xml' : null,
  sitemapFiles,
  routes: publicRoutes,
};
await writeJson('route-manifest.json', routeManifest);
await writeJson('redirect-manifest.json', {
  version: 1,
  buildId,
  origin,
  status: 'fixtures-only-host-adapter-not-implemented',
  source: 'config/seo/url-cases.json',
  rules: urlCases.cases,
});
const pendingResearch = localeResearch.locales.filter((record) => record.status !== 'reviewed').length;
const requirementIds = Array.from({ length: 12 }, (_, index) => `SEO-${String(index + 1).padStart(2, '0')}`);
const intentIds = routeRegistry.routes.map((route) => route.id);
const intentRegistryValid = new Set(intentIds).size === intentIds.length
  && new Set(routeRegistry.routes.map((route) => route.intent)).size === routeRegistry.routes.length
  && routeRegistry.routes.filter((route) => route.id === 'home').length === 1;
const checkStatus = (requirementId) => {
  if (requirementId === 'SEO-02') return intentRegistryValid ? 'pass' : 'fail';
  if (requirementId === 'SEO-06' && indexableRoutes.length === 0 && sitemapFiles.length === 0) return 'pass';
  return 'blocked';
};
await writeJson('seo-audit.json', {
  version: 1,
  buildId,
  result: indexableRoutes.length === inventory ? 'pass' : 'blocked',
  plannedPublicRouteCount: inventory,
  implementedPublicRouteCount: publicRoutes.length,
  indexablePublicRouteCount: indexableRoutes.length,
  missingPublicRouteCount: Math.max(0, inventory - indexableRoutes.length),
  localeResearchPending: pendingResearch,
  publicationApprovalCount: pagePublications.pages.length,
  sitemapIndex: sitemapFiles.length ? '/sitemap-index.xml' : null,
  checks: requirementIds.map((requirementId) => ({
    requirementId,
    status: checkStatus(requirementId),
    scope: requirementId === 'SEO-02' ? 'Route registry uniqueness and single generic-home ownership.'
      : requirementId === 'SEO-06' ? 'Current approved-page set only; zero eligible URLs correctly emits no sitemap.'
      : 'Full launch acceptance is not satisfied by this build.',
    reason: checkStatus(requirementId) === 'pass' ? 'The stated local check passed within its explicit scope.' : 'Localized research, route content, publication approvals and/or actual origin evidence are incomplete.',
  })),
});
console.log(`SEO artifacts generated: ${publicRoutes.length} implemented pages, ${indexableRoutes.length} indexable, ${inventory} planned; redirect rules are fixtures only.`);
