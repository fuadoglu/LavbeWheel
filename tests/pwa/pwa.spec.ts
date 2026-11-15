import { expect, test } from '@playwright/test';

 test('manifest exposes scoped standalone installation icons', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.display).toBe('standalone');
  const icons = manifest.icons as Array<{ src: string; sizes: string; purpose: string }>;
  for (const size of ['192x192', '512x512']) {
    expect(icons.some((icon) => icon.sizes === size && icon.purpose === 'any')).toBeTruthy();
    expect(icons.some((icon) => icon.sizes === size && icon.purpose === 'maskable')).toBeTruthy();
  }
  for (const icon of icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
});

test('service worker precaches implemented public routes and serves an opened locale offline', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const keys = (await Promise.all(names.filter((name) => name.startsWith('lavbe-core-')).map(async (name) => (await caches.open(name)).keys()))).flat();
    return keys.map((request) => new URL(request.url).pathname);
  });
  expect(cached).toContain('/');
  expect(cached).toContain('/az/');
  expect(cached).toContain('/en/spin-the-bottle/');
  expect(cached.some((path) => path.startsWith('/admin/') || path.startsWith('/api/') || path.startsWith('/s/'))).toBeFalsy();

  await page.context().setOffline(true);
  const offline = await page.goto('/az/group-games/');
  expect(offline?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'az');
  await expect(page.getByRole('heading', { name: 'Birlikdə oynayın' })).toBeVisible();
  await expect(page.getByText('Kart tapşırıqları hazırda ingilis dilindədir.')).toBeVisible();
});

test('uncached routes are not replaced by the home page and private requests bypass caches', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await page.context().setOffline(true);
  const missing = await page.goto('/not-a-real-page/');
  expect(missing?.status()).toBe(503);
  await expect(page.locator('body')).toContainText('This page is not available offline.');
  const privateFetch = await page.evaluate(async () => {
    try { await fetch('/api/health'); return 'unexpected-success'; }
    catch { return 'network-failed'; }
  });
  expect(privateFetch).toBe('network-failed');
  const privateKeys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys().then((keys) => keys.map((key) => new URL(key.url).pathname))))).flat());
  expect(privateKeys.some((path) => path.startsWith('/api/') || path.startsWith('/s/') || path.startsWith('/admin/'))).toBeFalsy();
});
