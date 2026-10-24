import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAudit, expect, samplePdf, signUp, test } from './fixtures';

const SAMPLE_CSV = join(__dirname, '../apps/web/public/sample-requests.csv');

/**
 * The whole product, as people use it (PRD §12.3): a manager sets up an audit from a CSV, an owner
 * with no account uploads through their link, the manager sends it back, the owner fixes it, the
 * manager accepts, and the evidence pack downloads with a verified hash.
 */
test('evidence lifecycle: import → upload → changes → resubmit → accept → export', async ({
  page,
  browser,
}) => {
  await signUp(page);
  await createAudit(page, 'SOC 2 Type II E2E');

  // 1. Import the sample CSV of five requests.
  await page.getByRole('button', { name: 'Import CSV' }).first().click();
  const importDialog = page.getByRole('dialog', { name: 'Import requests from CSV' });
  await importDialog.locator('input[type="file"]').setInputFiles(SAMPLE_CSV);
  await expect(importDialog.getByText('5 requests ready to import')).toBeVisible();
  await importDialog.getByRole('button', { name: /^Import 5 requests$/ }).click();
  await expect(page.getByText('Imported 5 requests')).toBeVisible();
  await expect(page.getByRole('button', { name: 'MFA enforcement screenshot' })).toBeVisible();

  // 2. Copy the owner's link for CC6.1 (the response carries the link the clipboard gets).
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const linkResponse = page.waitForResponse(
    (response) => response.url().endsWith('/link') && response.ok(),
  );
  await page.getByRole('button', { name: 'Copy upload link for CC6.1' }).click();
  const ownerUrl: string = (await (await linkResponse).json()).url;
  expect(ownerUrl).toMatch(/\/e#[\w-]{43}$/);
  await expect(page.getByText(/Upload link for CC6\.1 copied/)).toBeVisible();

  // 3. The owner (a fresh browser: no account, no cookies) uploads a PDF.
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto(ownerUrl);
  await expect(
    owner.getByRole('heading', { level: 1, name: 'MFA enforcement screenshot' }),
  ).toBeVisible();
  await owner.locator('input[type="file"]').setInputFiles({
    name: 'MFA settings.pdf',
    mimeType: 'application/pdf',
    buffer: samplePdf('first attempt'),
  });
  await owner
    .getByLabel(/Note for your compliance manager/)
    .fill('Screenshot from the admin console');
  await owner.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(
    owner.getByText(/Submitted\. Your compliance manager has been notified/),
  ).toBeVisible();

  // 4. The manager reviews and sends it back with a comment.
  await page.reload();
  await page.getByRole('button', { name: 'Review evidence for CC6.1' }).click();
  const review = page.getByRole('dialog', { name: /CC6\.1/ });
  await expect(review.getByText('MFA settings.pdf')).toBeVisible();
  await expect(review.getByText('Verified')).toBeVisible();
  await review.getByRole('button', { name: 'Request changes' }).click();
  await review
    .getByLabel('What needs to change?')
    .fill('The date must be visible in the screenshot.');
  await review.getByRole('button', { name: 'Send to owner' }).click();
  await expect(page.getByText('Sent back to the owner with your comment')).toBeVisible();
  await page.keyboard.press('Escape');

  // 5. The owner sees the comment and uploads a corrected file.
  await owner.reload();
  await expect(owner.getByText('Changes needed')).toBeVisible();
  await expect(owner.getByText('The date must be visible in the screenshot.')).toBeVisible();
  await owner.locator('input[type="file"]').setInputFiles({
    name: 'MFA settings - dated.pdf',
    mimeType: 'application/pdf',
    buffer: samplePdf('second attempt, with the date'),
  });
  await owner.getByRole('button', { name: 'Submit evidence' }).click();
  await expect(
    owner.getByText(/Submitted\. Your compliance manager has been notified/),
  ).toBeVisible();
  await ownerContext.close();

  // 6. The manager accepts the new version.
  await page.reload();
  await page.getByRole('button', { name: 'Review evidence for CC6.1' }).click();
  await expect(review.getByText('MFA settings - dated.pdf')).toBeVisible();
  await review.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText('Evidence accepted')).toBeVisible();
  await page.keyboard.press('Escape');

  // 7. The dashboard reflects it.
  await expect(page.getByText('1 of 5 requests accepted')).toBeVisible();
  await expect(page.getByText('20%', { exact: true })).toBeVisible();

  // 8. Export the evidence pack and check what's inside.
  await page.getByRole('button', { name: 'Export' }).click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Export evidence pack' })
    .getByRole('button', { name: 'Download ZIP' })
    .click();
  const zipPath = await (await download).path();
  const zip = await JSZip.loadAsync(await readFile(zipPath));
  const files = Object.keys(zip.files).filter((name) => !zip.files[name]!.dir);
  expect(files.sort()).toEqual([
    'CC6.1-mfa-enforcement-screenshot/MFA settings - dated.pdf',
    'README.txt',
    'index.csv',
  ]);
  const index = await zip.file('index.csv')!.async('string');
  expect(index).toContain('"MFA settings - dated.pdf"');
  expect(index).toContain('"OK"');
});
