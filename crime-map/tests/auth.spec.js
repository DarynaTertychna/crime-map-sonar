import { test, expect } from '@playwright/test';

function uniqueEmail() {
  return `playwright_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.com`;
}


async function checkBackend(page) {
  await page.goto('http://127.0.0.1:8000/');
  await expect(page.getByText(/Crime API running/i)).toBeVisible();
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


test.beforeEach(async ({ page }) => {
  await checkBackend(page);
});



test('register and login happy path', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await expect(page.getByText(new RegExp(email, 'i'))).toBeVisible();
});

test('login fails with wrong password', async ({ page }) => {
  const email = uniqueEmail();
  const password = 'test123';

  await registerAndLogin(page, email, password);

  await page.getByTestId('logout-button').click();
  await expect(page.getByText('CrimeMap')).toBeVisible();

  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill('wrongpass');
  await page.getByTestId('sign-in-button').click();

  await expect(page.getByText(/invalid credentials|login failed/i)).toBeVisible();
});

test('forgot password UI flow', async ({ page }) => {
  const email = uniqueEmail();

  await page.goto('/');
  await page.getByTestId('toggle-forgot-password').click();
  await page.getByTestId('forgot-email').fill(email);
  await page.getByTestId('send-reset-link').click();

  await expect(
    page.getByText(/reset request processed|password reset email has been sent|if an account with that email exists/i)
  ).toBeVisible();
});

test('apply filters and get prediction', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await page.getByTestId('crime-type').selectOption('Theft');
  await page.getByTestId('time-period').selectOption('Last 12 months');
  await page.getByTestId('county-input').fill('Dublin');
  await page.getByTestId('apply-filters').click();

  await expect(page.getByText(/Risk level:/i)).toBeVisible();

  await expect(
    page.getByText(/High|Medium|Low/i).first()
  ).toBeVisible();
});

test('chat opens and sends a message', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await page.getByTestId('open-chat').click();
  await expect(page.getByText('AI Crime Assistant')).toBeVisible();

  await page.getByTestId('chat-input').fill('Is theft high in Dublin?');
  await page.getByTestId('chat-send').click();

  await expect(page.getByText(/dublin|theft|risk/i).last()).toBeVisible();
});

test('save, load, clear favourite and logout', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await page.getByTestId('crime-type').selectOption('Theft');
  await page.getByTestId('time-period').selectOption('Last 12 months');
  await page.getByTestId('county-input').fill('Cork');

  await page.getByTestId('save-favorite').click();
  await expect(page.getByText(/saved favourite filters|saved locally/i)).toBeVisible();

  await page.getByTestId('county-input').fill('Dublin');
  await page.getByTestId('load-favorite').click();
  await expect(page.getByText(/favourite loaded/i)).toBeVisible();

  await expect(page.getByTestId('county-input')).toHaveValue('Cork');

  await page.getByTestId('clear-favorite').click();
  await expect(page.getByText(/favourite settings cleared|cleared locally/i)).toBeVisible();

  await page.getByTestId('logout-button').click();
  await expect(page.getByText('CrimeMap')).toBeVisible();
});


test('apply filters fails without county', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  await page.getByTestId('apply-filters').click();
  await expect(page.getByText(/enter a county/i)).toBeVisible();
});