import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('classic wheel can select an entry and save the local list', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const entries = page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' });
  await entries.fill('Aylin\nMurad\nLeyla');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(page.locator('#result')).toHaveText(/^Bu raundun seçimi: (Aylin|Murad|Leyla)$/, { timeout: 5_000 });
  const selected = await page.locator('#result').textContent();
  const winnerIndex = ['Aylin', 'Murad', 'Leyla'].indexOf(selected!.split(': ').at(-1)!);
  const palette = ['#5941b8', '#9b5600', '#14725d', '#b3434c', '#315eaa', '#a43f73', '#3d772f', '#a34e12'];
  const getSelectedSectorPixel = async () => page.locator('#wheel-canvas').evaluate((canvas: HTMLCanvasElement) => [...canvas.getContext('2d')!.getImageData(320, 180, 1, 1).data].slice(0, 3));
  const selectedPixel = await getSelectedSectorPixel();
  const expectedPixel = palette[winnerIndex]!.match(/[\da-f]{2}/gi)!.map((channel) => Math.round(parseInt(channel, 16) * .84 + 255 * .16));
  selectedPixel.forEach((channel, index) => expect(Math.abs(channel - expectedPixel[index]!)).toBeLessThanOrEqual(2));
  await page.getByRole('tab', { name: 'Nəticələr' }).click();
  await expect(page.locator('#history-list')).toContainText(selected!);
  await page.reload();
  await expect(entries).toHaveValue('Aylin\nMurad\nLeyla');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await expect(page.locator('#result')).toHaveText(selected!);
  expect(await getSelectedSectorPixel()).toEqual(selectedPixel);
  await page.getByRole('tab', { name: 'Nəticələr' }).click();
  await expect(page.locator('#history-list')).toContainText(selected!);
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

test('reduced-motion preference preserves the same selection with a short reveal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const started = Date.now();
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(page.locator('#result')).toHaveText(/^Bu raundun seçimi: (Aylin|Murad|Leyla|Kamran)$/);
  expect(Date.now() - started).toBeLessThan(1_000);
});

test('@a11y the root screen has no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('mobile board matches the 390px screen contract and theme preference survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const board = await page.locator('#wheel-canvas').boundingBox();
  expect(board?.width).toBeGreaterThanOrEqual(354);
  expect(board?.width).toBeLessThanOrEqual(358);
  const editor = page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' });
  await editor.focus();
  await expect(page.getByRole('button', { name: 'Redaktəni tamamla' })).toBeVisible();
  await page.getByRole('button', { name: 'Redaktəni tamamla' }).click();
  await expect(editor).not.toBeFocused();
  await expect(page.getByRole('button', { name: 'Qaranlıq mövzunu aktivləşdir' })).toHaveCSS('height', '44px');
  await page.getByRole('button', { name: 'Qaranlıq mövzunu aktivləşdir' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Açıq mövzunu aktivləşdir' })).toBeVisible();
  const darkAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(darkAudit.violations).toEqual([]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Açıq mövzunu aktivləşdir' })).toBeVisible();
  await page.getByRole('tab', { name: 'İştirakçılar' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Nəticələr' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Nəticələr' }).press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tənzimləmələr' })).toHaveAttribute('aria-selected', 'true');
  const settingsAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(settingsAudit.violations).toEqual([]);
  await page.locator('#motion-mode').selectOption('reduced');
  await page.reload();
  await expect(page.locator('#motion-mode')).toHaveValue('reduced');
});

test('tablet portrait stacks the editor and landscape preserves the 58/42 board split', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  const portraitBoard = await page.locator('#wheel-canvas').boundingBox();
  expect(portraitBoard?.width).toBe(560);
  expect(portraitBoard?.height).toBe(560);
  const portraitPanels = await page.evaluate(() => {
    const wheel = document.querySelector('#wheel')!.getBoundingClientRect();
    const board = document.querySelector('.wheel-panel')!.getBoundingClientRect();
    const editor = document.querySelector('.participant-panel')!.getBoundingClientRect();
    return { boardTop: board.top, editorTop: editor.top, width: wheel.width };
  });
  expect(portraitPanels.editorTop).toBeGreaterThan(portraitPanels.boardTop);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(50);
  const landscape = await page.evaluate(() => {
    const wheel = document.querySelector('.wheel-panel')!.getBoundingClientRect();
    const editor = document.querySelector('.participant-panel')!.getBoundingClientRect();
    return wheel.width / (wheel.width + editor.width);
  });
  expect(landscape).toBeGreaterThan(0.57);
  expect(landscape).toBeLessThan(0.59);
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
  await expect(page.locator('#result')).toHaveText(/^Bu raundun seçimi: (Aylin|Murad|Leyla|Kamran)$/);
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
