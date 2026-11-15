import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unknown paths return a useful noindex 404 instead of the home page', async ({ page }) => {
  const response = await page.goto('/zz/unknown/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Səhifə tapılmadı' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow,noarchive');
  await expect(page.getByRole('link', { name: 'Əsas səhifəyə keç' })).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: 'Şüşə seçimini aç' })).toHaveAttribute('href', '/bottle/');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
});

test('classic wheel can select an entry and save the local list', async ({ page }, testInfo) => {
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
  await page.getByRole('tab', { name: /Nəticələr|Results/ }).click();
  await expect(page.locator('#report-summary')).toContainText('1 seçim');
  await expect(page.locator('#report-table-scroll')).toBeVisible();
  await expect(page.locator('#report-rows')).toContainText(selected!.split(': ').at(-1)!);
  await expect(page.locator('#report-export')).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#report-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/round-report|raund-hesabati/);
  const reportPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(reportPath);
  const csv = await (await import('node:fs/promises')).readFile(reportPath, 'utf8');
  expect(csv).toContain('observed_share');
  expect(csv).toContain('next_chance');
  await page.reload();
  await expect(entries).toHaveValue('Aylin\nMurad\nLeyla');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await expect(page.locator('#result')).toHaveText(selected!);
  expect(await getSelectedSectorPixel()).toEqual(selectedPixel);
  await page.getByRole('tab', { name: 'Nəticələr' }).click();
  await expect(page.locator('#history-list')).toContainText(selected!);
  await expect(page.locator('#history-list')).toContainText('#1');
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
  await page.getByRole('tab', { name: 'Nəticələr' }).click();
  const reportResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(reportResults.violations).toEqual([]);
});

test('game session saves card, skip, pause and completion state locally', async ({ page }) => {
  await page.goto('/games/');
  await page.getByLabel('İştirakçılar, hər sətrə bir ad').fill('Aylin\nMurad\nLeyla');
  await page.locator('#game-start').click();
  await expect(page.locator('#game-play')).toBeVisible();
  await expect(page.locator('#game-draw')).toBeVisible();
  await page.locator('#game-draw').click();
  await expect(page.locator('#game-card-text')).toBeVisible();
  await expect(page.locator('#game-player')).toHaveText('Seçilən iştirakçı: Aylin');
  await expect(page.locator('#game-done')).toBeVisible();
  await page.reload();
  await expect(page.locator('#game-card-text')).toBeVisible();
  await expect(page.locator('#game-player')).toHaveText('Seçilən iştirakçı: Aylin');
  await page.locator('#game-skip').click();
  await expect(page.locator('#game-draw')).toBeVisible();
  await expect(page.locator('#game-history')).toContainText('skipped');
  await page.locator('#game-pause').click();
  await expect(page.locator('#game-resume')).toBeVisible();
  await page.locator('#game-resume').click();
  await expect(page.locator('#game-draw')).toBeVisible();
  const session = await page.evaluate(async () => new Promise<{ phase: string; used: number; status: string }>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const query = transaction.objectStore('sessions').getAll();
      query.onerror = () => reject(query.error);
      query.onsuccess = () => {
        const saved = query.result.find((record) => record.envelope.game);
        resolve({ phase: saved.envelope.game.phase, used: saved.envelope.game.usedCardIds.length, status: saved.envelope.results[0].status });
        database.close();
      };
    };
  }));
  expect(session).toEqual({ phase: 'ready', used: 1, status: 'skipped' });
});

test('@a11y game setup and active-card screen have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/games/');
  const setupAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(setupAudit.violations).toEqual([]);
  await page.locator('#game-start').click();
  await page.locator('#game-draw').click();
  await expect(page.locator('#game-card-text')).toBeVisible();
  const activeAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(activeAudit.violations).toEqual([]);
});

test('bottle uses fixed ordered seats and persists explicit no-repeat cycle reset', async ({ page }) => {
  await page.goto('/bottle/');
  await page.locator('#bottle-names').fill('Aylin\nMurad');
  await page.locator('#bottle-mode').selectOption('remove-winner');
  await page.locator('#bottle-start').click();
  await expect(page.locator('#bottle-spin')).toBeVisible();
  const canvas = await page.locator('#bottle-wheel').boundingBox();
  expect(canvas?.width).toBeGreaterThan(300);
  await page.locator('#bottle-spin').click();
  await expect(page.locator('#bottle-result')).toHaveText(/^Seçildi: (Aylin|Murad)$/);
  const firstPick = await page.locator('#bottle-result').textContent();
  await page.locator('#bottle-spin').click();
  await expect(page.locator('#bottle-result')).not.toHaveText(firstPick!, { timeout: 5_000 });
  await expect(page.locator('#bottle-spin')).toBeDisabled();
  await expect(page.locator('#bottle-cycle')).toContainText('hər iştirakçı seçilib');
  await page.locator('#bottle-reset-cycle').click();
  await expect(page.locator('#bottle-spin')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#bottle-spin')).toBeEnabled();
  await expect(page.locator('#bottle-history')).toContainText('Aylin');
});

test('bottle and games routes fit the mobile viewport without horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/bottle/', '/games/']) {
    await page.goto(route);
    const metrics = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
    expect(metrics.page).toBeLessThanOrEqual(metrics.viewport);
    await expect(page.getByRole('link', { name: 'Şüşə' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Oyunlar' })).toBeVisible();
  }
});

test('@a11y bottle setup and spinning surface have no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/bottle/');
  const setupAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(setupAudit.violations).toEqual([]);
  await page.locator('#bottle-start').click();
  await page.locator('#bottle-spin').click();
  await expect(page.locator('#bottle-result')).toContainText('Seçildi:');
  const activeAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(activeAudit.violations).toEqual([]);
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
