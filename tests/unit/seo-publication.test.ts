import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessSeoPublication,
  expectedLocalizedPath,
  getPublishedAlternates,
  getSeoPageState,
  getXDefaultHref,
} from '../../apps/web/src/data/seo.ts';

const approved = {
  locale: 'en', routeId: 'home', path: '/', sourceHash: 'a'.repeat(64),
  title: 'Choose with a random wheel', description: 'A useful wheel description.', h1: 'Choose together',
  modules: ['tool', 'how-to', 'rules', 'examples', 'privacy', 'related-links'],
  copyReviewer: 'reviewer-one', copyReviewedAt: '2026-11-15T10:00:00Z',
  seoReviewer: 'reviewer-two', seoReviewedAt: '2026-11-15T11:00:00Z', status: 'published' as const,
};

test('SEO pages stay noindex and omit canonical/hreflang until every review gate clears', () => {
  const state = assessSeoPublication({
    locale: 'en', routeId: 'home', actualPath: '/', expectedPath: '/', catalogStatus: 'draft',
    localeResearchStatus: 'pending', routeResearchStatus: 'pending', publication: null,
  });
  assert.equal(state.robots, 'noindex,follow');
  assert.equal(state.canonical, null);
  assert.deepEqual(state.blockers, [
    'locale-catalog-not-reviewed', 'locale-research-not-reviewed',
    'route-intent-not-researched', 'page-copy-and-seo-review-pending',
  ]);
});

test('a reviewed page receives only its self canonical after exact localized-path approval', () => {
  const state = assessSeoPublication({
    locale: 'en', routeId: 'home', actualPath: '/', expectedPath: '/', catalogStatus: 'reviewed',
    localeResearchStatus: 'reviewed', routeResearchStatus: 'researched', publication: approved,
  });
  assert.equal(state.robots, 'index,follow');
  assert.equal(state.canonical, 'https://lavbe.com/');
  assert.deepEqual(state.blockers, []);
  assert.deepEqual(state.approvedCopy, { title: approved.title, description: approved.description, h1: approved.h1 });
});

test('path mismatch, unknown locale and absent route approval fail closed', () => {
  const state = assessSeoPublication({
    locale: 'xx', routeId: 'home', actualPath: '/en/', expectedPath: '/', catalogStatus: 'reviewed',
    localeResearchStatus: 'reviewed', routeResearchStatus: 'researched', publication: { ...approved, locale: 'xx' },
  });
  assert.equal(state.robots, 'noindex,follow');
  assert.equal(state.canonical, null);
  assert.ok(state.blockers.includes('locale-not-in-registry'));
  assert.ok(state.blockers.includes('published-path-mismatch'));
});

test('localized URLs follow the registry spelling and alternates are emitted only for published pages', () => {
  assert.equal(expectedLocalizedPath('home', 'en'), '/');
  assert.equal(expectedLocalizedPath('home', 'az'), '/az/');
  assert.equal(expectedLocalizedPath('spin-the-bottle', 'zh-Hans'), '/zh-Hans/spin-the-bottle/');
  assert.deepEqual(getPublishedAlternates('home'), []);
  assert.equal(getXDefaultHref('home'), null);
  for (const [route, path] of [['home', '/'], ['spin-the-bottle', '/bottle/'], ['group-games', '/games/']] as const) {
    const page = getSeoPageState(route, 'az', path);
    assert.equal(page.robots, 'noindex,follow');
    assert.equal(page.canonical, null);
    assert.ok(page.blockers.includes('published-path-mismatch'));
  }
});
