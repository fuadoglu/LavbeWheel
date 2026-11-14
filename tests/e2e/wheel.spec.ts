import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('classic wheel can select an entry and save the local list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const entries = page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' });
  await entries.fill('Aylin\nMurad\nLeyla');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(page.getByText(/^Bu raundun seçimi: (Aylin|Murad|Leyla)$/)).toBeVisible({ timeout: 5_000 });
  const selected = await page.locator('#result').textContent();
  await page.reload();
  await expect(entries).toHaveValue('Aylin\nMurad\nLeyla');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await expect(page.locator('#result')).toHaveText(selected!);
  const stored = await page.evaluate(async () => new Promise<{ resultCount: number; presentation: string }>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const sessions = transaction.objectStore('sessions').getAll();
      sessions.onerror = () => reject(sessions.error);
      sessions.onsuccess = () => {
        const result = sessions.result[0].envelope.results.at(-1);
        resolve({ resultCount: sessions.result[0].envelope.results.length, presentation: result.presentation });
        database.close();
      };
    };
  }));
  expect(stored).toEqual({ resultCount: 1, presentation: 'acknowledged' });
});

test('@a11y the root screen has no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('upgrades the WP01 IndexedDB draft store to session stores without losing the saved list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('lavbe-wheel');
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('lavbe-wheel', 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore('wheelDrafts', { keyPath: 'id' });
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const transaction = database.transaction('wheelDrafts', 'readwrite');
        transaction.objectStore('wheelDrafts').put({ id: 'default', text: 'Migration A\nMigration B', updatedAt: new Date().toISOString() });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator('#entries')).toHaveValue('Migration A\nMigration B');
  const stores = await page.evaluate(async () => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { const names = [...request.result.objectStoreNames]; request.result.close(); resolve(names); };
  }));
  expect(stores).toEqual(expect.arrayContaining(['wheelDrafts', 'sessions', 'leases']));
});

test('uses one cross-tab writer and reacquires the lease after that tab closes', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const secondTab = await context.newPage();
  await secondTab.goto('/');
  await expect(secondTab.locator('#storage-status')).toHaveText('Yadda saxlamaq mümkün olmadı. Adlar bu səhifədə qalır.');
  await expect(secondTab.getByRole('button', { name: 'Çarxı fırlat' })).toBeDisabled();
  await page.close();
  await expect(secondTab.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır', { timeout: 5_000 });
  await expect(secondTab.getByRole('button', { name: 'Çarxı fırlat' })).toBeEnabled();
});

test('recovers the committed result after a simulated crash before its reveal animation', async ({ page }) => {
  await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect.poll(() => page.evaluate(async () => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const sessions = transaction.objectStore('sessions').getAll();
      sessions.onerror = () => reject(sessions.error);
      sessions.onsuccess = () => { const state = sessions.result[0].envelope.results.at(-1)?.presentation; database.close(); resolve(state ?? 'none'); };
    };
  }))).toBe('pending');

  await page.reload();
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await expect(page.getByText(/^Bu raundun seçimi: (Aylin|Murad|Leyla|Kamran)$/)).toBeVisible();
  const recovered = await page.evaluate(async () => new Promise<{ count: number; presentation: string }>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const sessions = transaction.objectStore('sessions').getAll();
      sessions.onerror = () => reject(sessions.error);
      sessions.onsuccess = () => { const record = sessions.result[0].envelope.results; database.close(); resolve({ count: record.length, presentation: record.at(-1).presentation }); };
    };
  }));
  expect(recovered).toEqual({ count: 1, presentation: 'acknowledged' });
});
