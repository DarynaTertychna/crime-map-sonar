import { test, expect } from '@playwright/test';
import path from 'path';

test('admin can upload csv', async ({ page }) => {
    const adminEmail = process.env.ADMIN_EMAIL || 'darinayg@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
    test.skip(true, 'ADMIN_PASSWORD not set');
    }

    await page.goto('/');

    await page.getByTestId('auth-email').fill(adminEmail);
    await page.getByTestId('auth-password').fill(adminPassword);
    await page.getByTestId('sign-in-button').click();

    await expect(page.getByText('Crime Risk Analysis and Prediction Map')).toBeVisible();

    await page.goto('/admin');

    const filePath = path.resolve('tests/sample-crime.csv');
    await page.getByTestId('admin-file-input').setInputFiles(filePath);
    await page.getByTestId('admin-upload-button').click();

    await expect(
        page.getByText(/uploaded_and_applied|New dataset is now active/i)
    ).toBeVisible();
});