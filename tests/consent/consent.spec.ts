import { expect, test } from '@playwright/test';

const analyticsOrigin = 'https://www.googletagmanager.com';

test('configured analytics loads only after opt-in and is denied again on withdrawal', async ({ page }) => {
  const requests: string[] = [];
  await page.route(`${analyticsOrigin}/**`, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__lavbeTestAnalyticsLoaded = true;' });
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Your privacy choices' })).toBeVisible();
  await page.waitForTimeout(100);
  expect(requests).toEqual([]);

  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByLabel('Optional analytics').check();
  await page.getByRole('button', { name: 'Save choices' }).click();
  await expect.poll(() => requests.length).toBe(1);
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __lavbeTestAnalyticsLoaded?: boolean }).__lavbeTestAnalyticsLoaded))).toBe(true);
  const consentBeforeWithdrawal = await page.evaluate(() => (window.dataLayer ?? []).some((entry) => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update' && (entry[2] as Record<string, string>).analytics_storage === 'granted'));
  expect(consentBeforeWithdrawal).toBe(true);

  await page.getByRole('button', { name: 'Privacy choices' }).click();
  await page.getByRole('button', { name: 'Reject optional' }).click();
  const consentAfterWithdrawal = await page.evaluate(() => (window.dataLayer ?? []).some((entry) => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update' && (entry[2] as Record<string, string>).analytics_storage === 'denied'));
  expect(consentAfterWithdrawal).toBe(true);
});

test('advertising choice alone does not load analytics when ad units and a CMP are absent', async ({ page }) => {
  const requests: string[] = [];
  await page.route(/^https:\/\//, async (route) => { requests.push(route.request().url()); await route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByLabel('Advertising').check();
  await page.getByRole('button', { name: 'Save choices' }).click();
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lavbe.consent.v1')!).advertising)).toBe(true);
});

test('GPC forces categories off even when an older local choice granted them', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
    localStorage.setItem('lavbe.consent.v1', JSON.stringify({
      version: 1,
      policyFingerprint: JSON.stringify({ id: 'optional_tags', enabled: true, gtmId: null, ga4Id: 'G-TEST1234', publisherId: null, cmpProvider: null, placements: [] }),
      analytics: true, advertising: true, savedAt: new Date().toISOString(),
    }));
  });
  const requests: string[] = [];
  await page.route(`${analyticsOrigin}/**`, async (route) => { requests.push(route.request().url()); await route.abort(); });
  await page.goto('/');
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lavbe.consent.v1')!).analytics)).toBe(true);
  await page.getByRole('button', { name: 'Privacy choices' }).click();
  await page.getByRole('button', { name: 'Customize' }).click();
  await expect(page.getByLabel('Optional analytics')).toBeDisabled();
  await expect(page.getByLabel('Advertising')).toBeDisabled();
});
