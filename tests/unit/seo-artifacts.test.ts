import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSitemapArtifacts } from '../../apps/web/src/data/seo-artifacts.ts';

test('empty approved set emits no sitemap index or locale sitemap', () => {
  const output = buildSitemapArtifacts([], 'https://lavbe.com');
  assert.equal(output.indexFile, null);
  assert.equal(output.files.size, 0);
  assert.equal(output.urlFiles.size, 0);
});

test('sitemaps are partitioned by locale and sitemap index lists every submap', () => {
  const output = buildSitemapArtifacts([
    { locale: 'az', path: '/az/group-games/' },
    { locale: 'en', path: '/random-name-picker/' },
    { locale: 'en', path: '/' },
  ], 'https://lavbe.com');
  assert.equal(output.indexFile, 'sitemap-index.xml');
  assert.deepEqual([...output.files.keys()], ['sitemap-index.xml', 'sitemap-az-1.xml', 'sitemap-en-1.xml']);
  assert.match(output.files.get('sitemap-index.xml')!, /sitemap-az-1\.xml/);
  assert.match(output.files.get('sitemap-index.xml')!, /sitemap-en-1\.xml/);
  assert.equal(output.urlFiles.get('https://lavbe.com/'), 'sitemap-en-1.xml');
  assert.match(output.files.get('sitemap-en-1.xml')!, /<loc>https:\/\/lavbe\.com\/random-name-picker\/<\/loc>/);
});

test('sitemap chunks respect the 5,000 URL limit and retain URL-to-file mapping', () => {
  const routes = [...Array.from({ length: 5_000 }, (_, index) => ({ locale: 'en', path: `/tool-${String(index).padStart(4, '0')}/` })), { locale: 'en', path: '/z-last/' }];
  const output = buildSitemapArtifacts(routes, 'https://lavbe.com');
  assert.equal(output.files.get('sitemap-en-1.xml')!.match(/<url>/g)?.length, 5_000);
  assert.equal(output.files.get('sitemap-en-2.xml')!.match(/<url>/g)?.length, 1);
  assert.equal(output.urlFiles.get('https://lavbe.com/z-last/'), 'sitemap-en-2.xml');
});

test('sitemap rejects non-HTTPS origins, unsafe paths, duplicate URLs and query variants', () => {
  assert.throws(() => buildSitemapArtifacts([{ locale: 'en', path: '/' }], 'http://lavbe.com'), /HTTPS/);
  assert.throws(() => buildSitemapArtifacts([{ locale: 'en', path: '/missing-slash' }], 'https://lavbe.com'), /normalized/);
  assert.throws(() => buildSitemapArtifacts([{ locale: 'en', path: '/?q=private' }], 'https://lavbe.com'), /clean absolute/);
  assert.throws(() => buildSitemapArtifacts([{ locale: 'en', path: '/' }, { locale: 'az', path: '/' }], 'https://lavbe.com'), /Duplicate sitemap URL/);
  assert.throws(() => buildSitemapArtifacts([{ locale: '../admin', path: '/' }], 'https://lavbe.com'), /valid locale/);
});
