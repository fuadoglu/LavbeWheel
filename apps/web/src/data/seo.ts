import localeRegistry from '../../../../config/locales.json' with { type: 'json' };
import routeRegistry from '../../../../config/seo/routes.json' with { type: 'json' };
import localeResearch from '../../../../config/seo/locale-research.json' with { type: 'json' };
import pagePublications from '../../../../config/seo/publications.json' with { type: 'json' };
import templateInventory from '../../../../config/seo/template-inventory.json' with { type: 'json' };
import azCatalog from '../../../../content/locales/az.json' with { type: 'json' };
import enCatalog from '../../../../content/locales/en.json' with { type: 'json' };

export type SeoPublication = {
  locale: string;
  routeId: string;
  path: string;
  sourceHash: string;
  title: string;
  description: string;
  h1: string;
  modules: string[];
  copyReviewer: string;
  copyReviewedAt: string;
  seoReviewer: string;
  seoReviewedAt: string;
  status: 'published';
};
export type SeoGateInput = {
  locale: string;
  routeId: string;
  actualPath: string;
  expectedPath: string;
  catalogStatus: string | null;
  localeResearchStatus: string | null;
  routeResearchStatus: string | null;
  publication: SeoPublication | null;
};

const origin = routeRegistry.origin;
const publications = pagePublications.pages as SeoPublication[];
const catalogs: Record<string, { status: string }> = {
  az: azCatalog,
  en: enCatalog,
};

export function expectedLocalizedPath(routeId: string, locale: string): string | null {
  const route = routeRegistry.routes.find((item) => item.id === routeId);
  if (!route) return null;
  if (route.id === 'home') return locale === routeRegistry.defaultLocale ? '/' : `/${locale}/`;
  return `/${locale}/${route.slug}/`;
}

export function assessSeoPublication(input: SeoGateInput): { robots: 'index,follow' | 'noindex,follow'; canonical: string | null; blockers: string[]; approvedCopy: { title: string; description: string; h1: string } | null } {
  const blockers: string[] = [];
  if (!localeRegistry.locales.some((item) => item.code === input.locale)) blockers.push('locale-not-in-registry');
  if (!routeRegistry.routes.some((item) => item.id === input.routeId)) blockers.push('route-not-in-registry');
  if (input.catalogStatus !== 'reviewed') blockers.push(input.catalogStatus === null ? 'locale-catalog-missing' : 'locale-catalog-not-reviewed');
  if (input.localeResearchStatus !== 'reviewed') blockers.push('locale-research-not-reviewed');
  if (input.routeResearchStatus !== 'researched') blockers.push('route-intent-not-researched');
  if (input.actualPath !== input.expectedPath) blockers.push('published-path-mismatch');
  if (!input.publication) blockers.push('page-copy-and-seo-review-pending');
  else {
    if (input.publication.status !== 'published') blockers.push('page-not-published');
    if (input.publication.path !== input.expectedPath) blockers.push('approval-path-mismatch');
  }
  return blockers.length === 0
    ? { robots: 'index,follow', canonical: new URL(input.expectedPath, origin).href, blockers, approvedCopy: input.publication ? { title: input.publication.title, description: input.publication.description, h1: input.publication.h1 } : null }
    : { robots: 'noindex,follow', canonical: null, blockers, approvedCopy: null };
}

export function getSeoPageState(routeId: string, locale: string, actualPath: string): ReturnType<typeof assessSeoPublication> {
  const route = routeRegistry.routes.find((item) => item.id === routeId);
  const researchEntry = localeResearch.locales.find((item) => item.locale === locale);
  const publication = publications.find((item) => item.locale === locale && item.routeId === routeId) ?? null;
  const expectedPath = expectedLocalizedPath(routeId, locale) ?? '';
  return assessSeoPublication({
    locale,
    routeId,
    actualPath,
    expectedPath,
    catalogStatus: catalogs[locale]?.status ?? null,
    localeResearchStatus: researchEntry?.status ?? null,
    routeResearchStatus: route?.researchStatus === 'researched' ? 'researched' : 'pending',
    publication,
  });
}

export function getPublishedAlternates(routeId: string): Array<{ locale: string; href: string }> {
  return publications
    .filter((page) => page.routeId === routeId)
    .filter((page) => {
      const path = expectedLocalizedPath(routeId, page.locale);
      if (path === null || path !== page.path) return false;
      const state = assessSeoPublication({
        locale: page.locale,
        routeId,
        actualPath: page.path,
        expectedPath: path,
        catalogStatus: catalogs[page.locale]?.status ?? null,
        localeResearchStatus: localeResearch.locales.find((item) => item.locale === page.locale)?.status ?? null,
        routeResearchStatus: routeRegistry.routes.find((item) => item.id === routeId)?.researchStatus === 'researched' ? 'researched' : 'pending',
        publication: page,
      });
      return state.robots === 'index,follow';
    })
    .map((page) => ({ locale: page.locale, href: new URL(page.path, origin).href }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
}

export function getXDefaultHref(routeId: string): string | null {
  const path = expectedLocalizedPath(routeId, routeRegistry.defaultLocale);
  if (!path) return null;
  const state = getSeoPageState(routeId, routeRegistry.defaultLocale, path);
  return state.robots === 'index,follow' ? state.canonical : null;
}

export const implementedPublicPages = templateInventory.pages;
