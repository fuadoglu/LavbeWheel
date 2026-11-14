import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const previewUrl = process.env.LAVBE_PREVIEW_URL ?? 'http://127.0.0.1:4322';
const output = path.resolve('evidence/wp06/screenshots');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, route, width, height, theme] of [
    ['games-390-setup-light.png', '/games/', 390, 844, 'light'],
    ['bottle-390-setup-light.png', '/bottle/', 390, 844, 'light'],
    ['bottle-1440-setup-dark.png', '/bottle/', 1440, 1000, 'dark'],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript((value) => localStorage.setItem('lavbe.theme', value), theme);
    await page.goto(new URL(route, previewUrl).toString());
    await page.screenshot({ path: path.join(output, name), fullPage: true });
    await page.close();
  }

  const games = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await games.goto(new URL('/games/', previewUrl).toString());
  await games.locator('#game-start').click();
  await games.locator('#game-draw').click();
  await games.locator('#game-done').waitFor({ state: 'visible' });
  await games.waitForTimeout(400);
  await games.screenshot({ path: path.join(output, 'games-390-active-card-light.png'), fullPage: true });
  await games.close();

  const bottle = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await bottle.goto(new URL('/bottle/', previewUrl).toString());
  await bottle.locator('#bottle-start').click();
  await bottle.locator('#bottle-spin').click();
  await bottle.locator('#bottle-result').waitFor({ state: 'visible' });
  await bottle.waitForFunction(() => document.querySelector('#bottle-result')?.textContent?.startsWith('Seçildi:'));
  await bottle.locator('#bottle-spin').waitFor({ state: 'visible' });
  await bottle.waitForFunction(() => !document.querySelector('#bottle-spin')?.hasAttribute('disabled'));
  await bottle.screenshot({ path: path.join(output, 'bottle-390-result-light.png'), fullPage: true });
  await bottle.close();
} finally {
  await browser.close();
}
