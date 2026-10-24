import { test as base, expect, type Page } from '@playwright/test';

/**
 * Every test fails if the browser reports an error: an uncaught exception, a React error, or a
 * Content-Security-Policy violation. The one exception is the browser's own "Failed to load
 * resource" line for a 4xx response, which the app handles and shows to the user.
 */
function watchForErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(text)) return;
    errors.push(`Console: ${text}`);
  });
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page, context }, use) => {
      const errors: string[] = [];
      watchForErrors(page, errors);
      // Pages opened later in the same context (e.g. the owner's) are watched too.
      context.on('page', (opened) => watchForErrors(opened, errors));
      await use(errors);
      expect(errors, 'browser errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** A minimal real PDF, so the API's magic-byte check sees a genuine signature. */
export function samplePdf(label: string): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${label}\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
  );
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Signs up a fresh manager in the UI and lands on the audits page. */
export async function signUp(page: Page, name = 'Priya Sharma'): Promise<string> {
  const email = uniqueEmail('manager');
  await page.goto('/signup');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/audits$/);
  return email;
}

/** Creates an audit from the audits page and lands on its detail page. */
export async function createAudit(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New audit' }).click();
  const dialog = page.getByRole('dialog', { name: 'New audit' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create audit' }).click();
  await expect(page).toHaveURL(/\/audits\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}
