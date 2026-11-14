import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('classic wheel can select an entry and save the local list', async ({ page }) => {
  await page.goto('/');
  const entries = page.getByRole('textbox', { name: 'İştirakçı adları, hər sətirdə bir ad' });
  await entries.fill('Aylin\nMurad\nLeyla');
  await page.getByRole('button', { name: 'Çarxı fırlat' }).click();
  await expect(page.getByText(/^Bu raundun seçimi: (Aylin|Murad|Leyla)$/)).toBeVisible({ timeout: 5_000 });
  await page.reload();
  await expect(entries).toHaveValue('Aylin\nMurad\nLeyla');
});

test('@a11y the root screen has no automated WCAG A/AA violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
