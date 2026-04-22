import { test, expect } from '@playwright/test';

function uniqueEmail() {
  return `playwright_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
}

async function registerAndLogin(page, email, password = 'test123') {
  await page.goto('/');

  await expect(page.getByText('CrimeMap')).toBeVisible();

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

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 53.3498, longitude: -6.2603 },
});

test('use current location and get prediction', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await page.getByTestId('crime-type').selectOption('Theft');
  await page.getByTestId('time-period').selectOption('Last 12 months');
  await page.getByTestId('use-my-location').check();
  await page.getByTestId('apply-filters').click();

  await expect(page.getByText(/Risk level:/i)).toBeVisible();
  await expect(page.getByText(/High|Medium|Low/i).first()).toBeVisible();
});