import { test, expect } from '@playwright/test';

function uniqueEmail() {
  return `playwright_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
}

async function registerAndLogin(page, email, password = 'test123') {
  await page.goto('/');
  await page.getByTestId('tab-create-account').click();
  await page.getByTestId('register-name').fill('Playwright User');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('register-confirm-password').fill(password);
  await page.getByTestId('create-account-button').click();
  await expect(page.getByText(/Account created\. You can sign in now\./i)).toBeVisible();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('sign-in-button').click();
  await expect(page.getByText('Crime Risk Analysis and Prediction Map')).toBeVisible();
}

test('clicking map triggers county details', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  const map = page.getByTestId('map-view');
  await expect(map).toBeVisible();

  await map.click({ position: { x: 350, y: 250 } });

  await expect(page.getByText(/Risk level:/i)).toBeVisible();
});