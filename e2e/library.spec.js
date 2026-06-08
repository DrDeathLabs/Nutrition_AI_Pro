import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-test-password';

async function login({ page }) {
  await page.goto('/');
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.fill('#login-username', 'admin');
  await page.fill('#login-password', ADMIN_PASSWORD);
  await page.click('#login-form button[type="submit"]');
  await expect(page.locator('#login-screen')).toBeHidden();
}

test.describe('Library view', () => {
  test.beforeEach(login);

  test('library tab is clickable and shows filter bar', async ({ page }) => {
    await page.click('[data-target="view-library"]');
    await expect(page.locator('#lib-search')).toBeVisible();
    await expect(page.locator('#lib-filter-meal')).toBeVisible();
    await expect(page.locator('#lib-sort')).toBeVisible();
    await expect(page.locator('#view-library .cms-table-container')).toBeVisible();
    await expect(page.locator('#page-info')).toBeVisible();
  });

  test('search filter is interactive', async ({ page }) => {
    await page.click('[data-target="view-library"]');
    await page.fill('#lib-search', 'chicken');
    await page.keyboard.press('Enter');
    await expect(page.locator('#lib-search')).toHaveValue('chicken');
    await expect(page.locator('#view-library .cms-table-container')).toBeVisible();
  });

  test('pagination controls are present', async ({ page }) => {
    await page.click('[data-target="view-library"]');
    await expect(page.locator('#page-prev-btn')).toBeVisible();
    await expect(page.locator('#page-next-btn')).toBeVisible();
  });
});
