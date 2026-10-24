import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { createAudit, expect, samplePdf, signUp, test } from './fixtures';

/**
 * WCAG 2.1 AA checks with axe-core on every screen, including open dialogs (PRD §10). Serious
 * and critical problems fail the test; each one is listed with the elements involved.
 */
async function expectAccessible(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
    );
  expect(blocking, `accessibility problems on ${screen}`).toEqual([]);
}

test('public pages', async ({ page }) => {
  for (const [path, screen] of [
    ['/', 'landing page'],
    ['/login', 'sign in'],
    ['/signup', 'sign up'],
  ]) {
    await page.goto(path!);
    await page.waitForLoadState('networkidle');
    await expectAccessible(page, screen!);
  }
});

test('manager screens, dialogs and the owner portal', async ({ page, browser }) => {
  await signUp(page);
  await expectAccessible(page, 'audits list (empty)');

  await createAudit(page, 'Accessibility audit');
  await page.getByRole('button', { name: 'Add request' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Add evidence request' });
  await expectAccessible(page, 'add request dialog');
  await dialog.getByLabel('Control ID').fill('CC6.1');
  await dialog.getByLabel("What's needed").fill('MFA screenshot');
  await dialog.getByLabel('Owner email').fill('rahul@example.com');
  await dialog.getByLabel('Due date').fill('2099-11-05');
  await dialog.getByRole('button', { name: 'Add request' }).click();
  await expect(page.getByRole('button', { name: 'MFA screenshot' })).toBeVisible();
  await expectAccessible(page, 'audit detail with dashboard and table');

  const linkResponse = page.waitForResponse(
    (response) => response.url().endsWith('/link') && response.ok(),
  );
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy upload link for CC6.1' }).click();
  const ownerUrl: string = (await (await linkResponse).json()).url;

  const owner = await (await browser.newContext()).newPage();
  await owner.goto(ownerUrl);
  await expect(owner.getByRole('heading', { level: 1, name: 'MFA screenshot' })).toBeVisible();
  await expectAccessible(owner, 'owner portal');

  // Keyboard only: the drop zone is a real button, so Tab + Enter opens the file chooser.
  const chooser = owner.waitForEvent('filechooser');
  await owner.getByRole('button', { name: /Drop files here, or click to choose/ }).focus();
  await owner.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles({ name: 'mfa.pdf', mimeType: 'application/pdf', buffer: samplePdf('keyboard') });
  await expect(owner.getByText('mfa.pdf')).toBeVisible();
  await expectAccessible(owner, 'owner portal with a file chosen');

  await page.reload();
  await page.getByRole('button', { name: 'Review evidence for CC6.1' }).click();
  await expect(page.getByRole('dialog', { name: /CC6\.1/ })).toBeVisible();
  await expectAccessible(page, 'review dialog');
});

test('owner portal with an invalid link explains the problem', async ({ page }) => {
  await page.goto('/e#not-a-real-token');
  await expect(page.getByRole('heading', { name: "This link isn't valid" })).toBeVisible();
  await expectAccessible(page, 'invalid link page');
});
