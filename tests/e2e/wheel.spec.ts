import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

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

test('exports a validated JSON backup of the active local session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' }).fill('Aylin\nMurad');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(page.getByText(/^Bu raundun seçimi: (Aylin|Murad)$/)).toBeVisible({ timeout: 5_000 });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sessiyanı JSON kimi yüklə' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lavbe-session-\d{4}-\d{2}-\d{2}\.json$/);
  const contents = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(contents.schemaVersion).toBe(1);
  expect(contents.results).toHaveLength(1);
  expect(contents.results[0].label).toMatch(/^(Aylin|Murad)$/);
  await expect(page.locator('#import-feedback')).toContainText('JSON faylında iştirakçı adları və sessiya tarixçəsi var');
});

test('offers a JSON backup when local storage fails and pauses further spins', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'wheelDrafts') throw new DOMException('simulated quota exhaustion', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' }).fill('Aylin\nMurad');
  await expect(page.locator('#storage-status')).toContainText('sessiyanı JSON kimi yükləyin');
  await expect(page.getByRole('button', { name: 'Çarxı fırlat' })).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sessiyanı JSON kimi yüklə' }).click();
  const download = await downloadPromise;
  const contents = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(contents.results).toEqual([]);
  await expect(page.locator('#import-feedback')).toContainText('JSON faylında iştirakçı adları və sessiya tarixçəsi var');
});

test('offers an export before pruning and retains the newest 10,000 results', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readwrite');
      const store = transaction.objectStore('sessions');
      const all = store.getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const record = all.result[0];
        if (!record) { reject(new Error('Expected a saved local session')); return; }
        const envelope = record.envelope;
        const wheel = envelope.configRevisions.find((revision: { id: string }) => revision.id === envelope.currentRevisionId).wheel;
        const entry = wheel.entries.find((item: { active: boolean }) => item.active);
        const round = envelope.rounds.at(-1);
        const firstTime = Math.max(Date.now(), Date.parse(round.startedAt));
        envelope.results = Array.from({ length: 10_000 }, (_, index) => ({
          id: `result_seed_${String(index + 1).padStart(5, '0')}`,
          roundId: round.id,
          configRevisionId: envelope.currentRevisionId,
          sequence: index + 1,
          committedAt: new Date(firstTime + index * 1_000).toISOString(),
          presentation: 'acknowledged',
          kind: 'entry',
          entryId: entry.id,
          label: entry.label,
        }));
        store.put(record);
      };
      transaction.oncomplete = () => { database.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }));
  await page.reload();
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tarixçənin yaddaş limiti dolub' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('ən köhnə nəticə silinəcək');
  const dialogA11y = await new AxeBuilder({ page }).include('#history-prune-dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(dialogA11y.violations).toEqual([]);
  await page.getByRole('button', { name: 'Fırlatmanı ləğv et' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Çarxı fırlat' })).toBeEnabled();
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(dialog).toBeVisible();
  const backupPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ehtiyat nüsxəni endir' }).click();
  const backup = await backupPromise;
  const exported = JSON.parse(await readFile((await backup.path())!, 'utf8'));
  expect(exported.results).toHaveLength(10_000);
  expect(exported.results[0].sequence).toBe(1);
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Davam et və ən köhnəni sil' }).click();
  const readPruned = () => page.evaluate(async () => new Promise<{ length: number; first: number; last: number; prunedThrough: number; presentation: string }>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const all = transaction.objectStore('sessions').getAll();
      all.onerror = () => reject(all.error);
      all.onsuccess = () => {
        const envelope = all.result[0].envelope;
        database.close();
        resolve({ length: envelope.results.length, first: envelope.results[0].sequence, last: envelope.results.at(-1).sequence, prunedThrough: envelope.historyPrunedThroughSequence, presentation: envelope.results.at(-1).presentation });
      };
    };
  }));
  await expect.poll(readPruned).toEqual({ length: 10_000, first: 2, last: 10_001, prunedThrough: 1, presentation: 'acknowledged' });
});

test('previews and imports a separate session copy, then restores and switches sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const originalSessionId = await page.locator('#session-picker').inputValue();
  const fixture = await readFile(new URL('../../contracts/examples/session.json', import.meta.url), 'utf8');
  await page.locator('#session-import-file').setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(fixture) });
  await expect(page.locator('#import-feedback')).toContainText('Demo friends');
  await expect(page.getByRole('button', { name: 'Ayrı sessiya kimi əlavə et' })).toBeEnabled();
  await page.getByRole('button', { name: 'Ayrı sessiya kimi əlavə et' }).click();
  const entries = page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' });
  await expect(entries).toHaveValue('Aysel\nMurad\nLeyla');
  await expect(page.locator('#result')).toHaveText('Bu raundun seçimi: Aysel');
  await expect(page.locator('#session-picker option')).toHaveCount(2);
  const copiedSessionId = await page.locator('#session-picker').inputValue();
  expect(copiedSessionId).not.toBe(originalSessionId);

  const identities = await page.evaluate(async () => new Promise<Array<{ sessionId: string; resultId: string }>>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const sessions = transaction.objectStore('sessions').getAll();
      sessions.onerror = () => reject(sessions.error);
      sessions.onsuccess = () => {
        const values = sessions.result.map((item) => ({ sessionId: item.envelope.sessionId, resultId: item.envelope.results[0]?.id ?? '' }));
        database.close();
        resolve(values);
      };
    };
  }));
  expect(identities).toHaveLength(2);
  expect(identities[1]?.sessionId).not.toBe(identities[0]?.sessionId);
  expect(identities[1]?.resultId).not.toBe(identities[0]?.resultId);

  await page.reload();
  await expect(entries).toHaveValue('Aysel\nMurad\nLeyla');
  await page.locator('#session-picker').selectOption(originalSessionId);
  await expect(entries).toHaveValue('Aylin\nMurad\nLeyla\nKamran');
  await expect(entries).toBeEnabled();
  await entries.fill('Original A\nOriginal B');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.locator('#session-picker').selectOption(copiedSessionId);
  await expect(entries).toHaveValue('Aysel\nMurad\nLeyla');
  await page.locator('#session-picker').selectOption(originalSessionId);
  await expect(entries).toHaveValue('Original A\nOriginal B');
});

test('rejects invalid and over-limit backup files without changing saved sessions', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  await page.locator('#session-import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{bad json') });
  await expect(page.locator('#import-feedback')).toHaveText('Bu fayl etibarlı Lavbe sessiya ehtiyatı deyil. Məlumat dəyişdirilmədi.');
  await expect(page.getByRole('button', { name: 'Ayrı sessiya kimi əlavə et' })).toBeDisabled();

  await page.locator('#session-import-file').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.locator('#import-feedback')).toHaveText('Ehtiyat faylı 5 MiB import limitini keçir.');
  await expect(page.locator('#session-picker option')).toHaveCount(1);
});

test('enforces the session cap and requires confirmation before deleting a saved session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#storage-status')).toHaveText('Bu cihazda yadda saxlanır');
  const fixture = JSON.parse(await readFile(new URL('../../contracts/examples/session.json', import.meta.url), 'utf8'));
  await page.evaluate(async (source) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lavbe-wheel');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('sessions', 'readwrite');
        const store = transaction.objectStore('sessions');
        for (let index = 0; index < 19; index += 1) {
          const envelope = structuredClone(source);
          envelope.sessionId = `sessioncap_${index}`;
          envelope.wheelId = `wheelcap_${index}`;
          store.put({ sessionId: envelope.sessionId, envelope, revision: 1, updatedAt: new Date().toISOString() });
        }
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, fixture);
  const originalSessionId = await page.locator('#session-picker').inputValue();
  await page.reload();
  await expect(page.locator('#session-picker option')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Sessiyanı sil' })).toBeEnabled();
  await page.locator('#session-import-file').setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#import-feedback')).toContainText('Demo friends');
  await page.getByRole('button', { name: 'Ayrı sessiya kimi əlavə et' }).click();
  await expect(page.locator('#import-feedback')).toHaveText('Sessiya limiti dolub. Yeni importdan əvvəl bəzi sessiyaları silin.');
  await expect(page.locator('#session-picker option')).toHaveCount(20);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Sessiyanı sil' }).click();
  await expect(page.locator('#session-picker option')).toHaveCount(19);
  await expect(page.locator('#session-picker')).not.toHaveValue(originalSessionId);
  await page.locator('#session-import-file').setInputFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(page.locator('#import-feedback')).toContainText('Demo friends');
  await page.getByRole('button', { name: 'Ayrı sessiya kimi əlavə et' }).click();
  await expect(page.locator('#import-feedback')).toHaveText('Ehtiyat nüsxə ayrıca yerli sessiya kimi əlavə edildi.');
  await expect(page.locator('#session-picker option')).toHaveCount(20);
  const saved = await page.evaluate(async (removedId) => new Promise<{ count: number; deleted: boolean }>((resolve, reject) => {
    const request = indexedDB.open('lavbe-wheel');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('sessions', 'readonly');
      const sessions = transaction.objectStore('sessions').getAll();
      sessions.onerror = () => reject(sessions.error);
      sessions.onsuccess = () => {
        const records = sessions.result;
        database.close();
        resolve({ count: records.length, deleted: records.some((record) => record.sessionId === removedId) });
      };
    };
  }), originalSessionId);
  expect(saved).toEqual({ count: 20, deleted: false });
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
  await expect(secondTab.locator('#storage-status')).toHaveText('Yerli yaddaşa yazmaq mümkün olmadı. Seçimlər bloklandı; tarixçəni qorumaq üçün sessiyanı JSON kimi yükləyin.');
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
