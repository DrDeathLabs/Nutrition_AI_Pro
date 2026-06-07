import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'o9ekn1WNEaSowxKCsVaBtEvl';

test.describe('Generator view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.fill('#login-password', ADMIN_PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-screen')).toBeHidden();
  });

  test('generator form is visible by default', async ({ page }) => {
    await expect(page.locator('#recipe-form')).toBeVisible();
    await expect(page.locator('#ai-terminal')).toBeVisible();
  });

  test('can submit a generation job', async ({ page }) => {
    await page.selectOption('#goal-select', 'high_protein');
    await page.selectOption('#meal-type', 'lunch');
    await page.fill('#batch-amount', '1');
    await page.click('#recipe-form button[type="submit"]');
    // Terminal should show a system message
    await expect(page.locator('#ai-terminal')).toContainText('Production Run Requested');
  });

  test('draft inbox table is present', async ({ page }) => {
    await expect(page.locator('#draft-table-body')).toBeVisible();
  });
});
