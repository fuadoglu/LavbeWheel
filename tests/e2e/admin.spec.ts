import { expect, test } from '@playwright/test';

const session = { userId: 'owner-test', role: 'owner', csrfToken: 'csrf-token-that-is-long-enough-for-the-client', expiresAt: '2026-11-15T12:00:00Z' };
const version = { id: '0123456789abcdef0123456789abcdef', kind: 'ui-catalog', state: 'reviewed', sourceHash: 'a'.repeat(64), revision: 1 };
const payload = {
  kind: 'ui-catalog', locale: 'en', sourceHash: 'a'.repeat(64), expectedRevision: 0,
  records: [{ key: 'siteTitle', message: 'Lavbe', sourceHash: 'b'.repeat(64), status: 'reviewed' }],
};

test('admin sign-in reveals role gated workspace and computes a publish digest', async ({ page }) => {
  const publishRequests: Array<{ versionIds: string[]; manifestHash: string }> = [];
  await page.route('**/api/admin/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/session') && request.method() === 'GET') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED' } }) });
      return;
    }
    if (url.pathname.endsWith('/session') && request.method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'set-cookie': 'lavbe_admin=synthetic-session; Path=/api/admin/v1; HttpOnly; SameSite=Lax' }, body: JSON.stringify(session) });
      return;
    }
    if (url.pathname.endsWith('/versions') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([version]) });
      return;
    }
    if (url.pathname.endsWith('/audit') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.pathname.endsWith('/publication') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: null, knownGood: [] }) });
      return;
    }
    if (url.pathname.endsWith('/publish-jobs') && request.method() === 'POST') {
      publishRequests.push(request.postDataJSON());
      await route.fulfill({ status: 202, contentType: 'application/json', headers: { 'X-Runner-Credential': 'r'.repeat(43) }, body: JSON.stringify({ id: 'job-12345678', state: 'queued', artifactHash: null, errorCode: null, mode: 'publish', rollbackTargetHash: null }) });
      return;
    }
    if (url.pathname.includes('/versions/') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version, payload }) });
      return;
    }
    if (url.pathname.endsWith('/publish-jobs/job-12345678') && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'job-12345678', state: 'queued', artifactHash: null, errorCode: null, mode: 'publish', rollbackTargetHash: null }) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'NOT_FOUND' } }) });
  });

  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.locator('#admin-username').fill('owner');
  await page.locator('#admin-password').fill('synthetic-password');
  await page.locator('#admin-mfa').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Content versions' })).toBeVisible();
  await page.getByLabel(/ui-catalog · 0123456789abcdef/).check();
  await expect(page.getByRole('button', { name: 'Create publish job' })).toBeEnabled();
  await page.getByRole('button', { name: 'Create publish job' }).click();
  await expect(page.getByText('r'.repeat(43))).toBeVisible();
  expect(publishRequests).toHaveLength(1);
  expect(publishRequests[0]?.versionIds).toEqual([version.id]);
  expect(publishRequests[0]?.manifestHash).toMatch(/^[a-f0-9]{64}$/);
});
