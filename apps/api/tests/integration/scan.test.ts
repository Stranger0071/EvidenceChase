import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { GUARDDUTY_SCAN_TAG, SCAN_TIMEOUT_MINUTES } from '../../src/domain/scanOutcome';
import { createTestContext, CRON_SECRET, SAMPLE_FILES, WEB_ORIGIN } from './helpers';
import { asOwner, eventually, setupRequest, uploadAndSubmit } from './ownerFlow';

/** Malware scanning on, as in production: files wait in quarantine for GuardDuty's verdict. */
const ctx = createTestContext({ MALWARE_SCAN_ENABLED: true });
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const pdf = { name: 'MFA settings.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf };

async function awaitingScan() {
  const app = ctx.makeApp();
  const setup = await setupRequest(app);
  const { response, fileIds, keys } = await uploadAndSubmit(app, ctx.storage, setup.token, [pdf]);
  expect(response.body.submission.files[0].state).toBe('AWAITING_SCAN');
  const submissions = () => setup.agent.get(`/requests/${setup.requestId}/submissions`).expect(200);
  return { app, ...setup, fileId: fileIds[0]!, key: keys[0]!, submissions };
}

describe('malware scanning', () => {
  it('keeps the file in quarantine, and refuses to accept it, until GuardDuty clears it', async () => {
    const { agent, requestId, key, fileId, submissions } = await awaitingScan();

    const blocked = await agent
      .post(`/requests/${requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(409);
    expect(blocked.body.error.code).toBe('FILES_NOT_VERIFIED');
    await agent.get(`/files/${fileId}/url`).expect(409);

    ctx.storage.setTags(key, { [GUARDDUTY_SCAN_TAG]: 'NO_THREATS_FOUND' });
    // Opening the request checks any files still waiting.
    const opened = await submissions();
    expect(opened.body.submissions[0].files[0]).toMatchObject({
      state: 'VERIFIED',
      scanStatus: 'NO_THREATS_FOUND',
    });

    await agent
      .post(`/requests/${requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(200);
  });

  it('refuses a file replaced in quarantine after it was checked', async () => {
    const { key, fileId, submissions } = await awaitingScan();

    // The upload link is still valid, so the owner swaps in different bytes, which GuardDuty clears.
    ctx.storage.putObject(key, Buffer.from('MZ not the PDF that was checked'), 'application/pdf');
    ctx.storage.setTags(key, { [GUARDDUTY_SCAN_TAG]: 'NO_THREATS_FOUND' });
    await submissions();

    expect(await ctx.prisma.evidenceFile.findUnique({ where: { id: fileId } })).toMatchObject({
      state: 'REJECTED',
      rejectReason: 'the file was replaced after it was checked, so please upload it again',
    });
    expect([...ctx.storage.objects.keys()].some((k) => k.startsWith('evidence/'))).toBe(false);
  });

  it('deletes an infected file and sends the request back to the owner automatically', async () => {
    const { app, token, requestId, key, fileId, submissions } = await awaitingScan();

    ctx.storage.setTags(key, { [GUARDDUTY_SCAN_TAG]: 'THREATS_FOUND' });
    await submissions();

    expect(ctx.storage.objects.has(key)).toBe(false);
    expect(await ctx.prisma.evidenceFile.findUnique({ where: { id: fileId } })).toMatchObject({
      state: 'REJECTED',
      scanStatus: 'THREATS_FOUND',
    });
    const saved = await ctx.prisma.evidenceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(saved.status).toBe('CHANGES_REQUESTED');
    expect(
      await ctx.prisma.activityLog.findFirst({ where: { action: 'SCAN_FAILED' } }),
    ).toMatchObject({ actorType: 'SYSTEM' });

    expect(ctx.mailer.sent.find((email) => email.subject.startsWith('File not accepted'))?.to).toBe(
      'rahul@example.com',
    );
    const portal = await asOwner(app, token).portal().expect(200);
    expect(portal.body.changesComment).toContain('malware scan found a threat');
  });

  it('fails closed when the scan never finishes', async () => {
    const { requestId, fileId, submissions } = await awaitingScan();
    await ctx.prisma.evidenceFile.update({
      where: { id: fileId },
      data: { createdAt: new Date(Date.now() - (SCAN_TIMEOUT_MINUTES + 1) * 60_000) },
    });

    await submissions();

    expect(await ctx.prisma.evidenceFile.findUnique({ where: { id: fileId } })).toMatchObject({
      state: 'REJECTED',
      scanStatus: 'FAILED',
    });
    expect(await ctx.prisma.evidenceRequest.findUnique({ where: { id: requestId } })).toMatchObject(
      { status: 'CHANGES_REQUESTED' },
    );
  });

  it('promotes scanned files from the scheduled job', async () => {
    const { app, key, fileId } = await awaitingScan();
    ctx.storage.setTags(key, { [GUARDDUTY_SCAN_TAG]: 'NO_THREATS_FOUND' });

    await request(app)
      .post('/internal/cron/scan-check')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(202);

    await eventually(
      async () =>
        (await ctx.prisma.evidenceFile.findUnique({ where: { id: fileId } }))?.state === 'VERIFIED',
    );
  });

  it('protects the scheduled job with the cron secret', async () => {
    const app = ctx.makeApp();
    await request(app).post('/internal/cron/scan-check').expect(401);
    await request(app)
      .post('/internal/cron/scan-check')
      .set('Authorization', 'Bearer wrong')
      .expect(401);
  });
});

describe('scheduled jobs without a secret', () => {
  it('are switched off', async () => {
    const noSecret = createTestContext({ CRON_SECRET: undefined });
    try {
      const response = await request(noSecret.makeApp())
        .post('/internal/cron/scan-check')
        .expect(503);
      expect(response.body.error.code).toBe('CRON_DISABLED');
    } finally {
      await noSecret.close();
    }
  });
});
