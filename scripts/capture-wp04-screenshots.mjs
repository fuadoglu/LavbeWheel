import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const previewUrl = process.env.LAVBE_PREVIEW_URL ?? 'http://127.0.0.1:4322';
const output = path.resolve('evidence/wp04/screenshots');
await mkdir(output, { recursive: true });

const views = [
  { name: 'classic-390-light.png', width: 390, height: 844, theme: 'light' },
  { name: 'classic-390-dark.png', width: 390, height: 844, theme: 'dark' },
  { name: 'classic-768-portrait-light.png', width: 768, height: 1024, theme: 'light' },
  { name: 'classic-1024-landscape-light.png', width: 1024, height: 768, theme: 'light' },
  { name: 'classic-1440-desktop-light.png', width: 1440, height: 1000, theme: 'light' },
  { name: 'classic-1440-desktop-dark.png', width: 1440, height: 1000, theme: 'dark' },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const view of views) {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
    await page.addInitScript((theme) => localStorage.setItem('lavbe.theme', theme), view.theme);
    await page.goto(previewUrl);
    await page.waitForFunction(() => document.querySelector('#storage-status')?.textContent === 'Bu cihazda yadda saxlanır');
    await page.screenshot({ path: path.join(output, view.name), fullPage: true });
    await page.close();
  }

  const resultPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await resultPage.goto(previewUrl);
  await resultPage.waitForFunction(() => document.querySelector('#storage-status')?.textContent === 'Bu cihazda yadda saxlanır');
  await resultPage.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await resultPage.waitForFunction(() => document.querySelector('#result')?.textContent?.startsWith('Bu raundun seçimi:'));
  await resultPage.screenshot({ path: path.join(output, 'classic-390-light-result.png'), fullPage: true });
  await resultPage.getByRole('tab', { name: 'Nəticələr' }).click();
  await resultPage.screenshot({ path: path.join(output, 'classic-390-light-history.png'), fullPage: true });

  const settingsPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await settingsPage.addInitScript(() => localStorage.setItem('lavbe.theme', 'dark'));
  await settingsPage.goto(previewUrl);
  await settingsPage.waitForFunction(() => document.querySelector('#storage-status')?.textContent === 'Bu cihazda yadda saxlanır');
  await settingsPage.getByRole('tab', { name: 'Tənzimləmələr' }).click();
  await settingsPage.screenshot({ path: path.join(output, 'classic-390-dark-settings.png'), fullPage: true });
} finally {
  await browser.close();
}
