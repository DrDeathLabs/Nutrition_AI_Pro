import { test, expect } from '@playwright/test';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'o9ekn1WNEaSowxKCsVaBtEvl';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear any stored session
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
  });

  test('shows login screen on first visit', async ({ page }) => {
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-form')).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.fill('#login-password', 'wrongpassword');
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-error')).toBeVisible();
    await expect(page.locator('#login-screen')).toBeVisible();
  });

  test('logs in with correct password and shows app', async ({ page }) => {
    await page.fill('#login-password', ADMIN_PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-screen')).toBeHidden();
    await expect(page.locator('.navbar')).toBeVisible();
  });

  test('logout button clears session and shows login screen', async ({ page }) => {
    // Log in first
    await page.fill('#login-password', ADMIN_PASSWORD);
    await page.click('#login-form button[type="submit"]');
    await expect(page.locator('#login-screen')).toBeHidden();

    // Log out
    await page.click('#logout-btn');
    await expect(page.locator('#login-screen')).toBeVisible();
  });
});
