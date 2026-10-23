import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, CRON_SECRET, SAMPLE_FILES, WEB_ORIGIN } from './helpers';
import {
  asOwner,
  eventually,
  issueToken,
  setupRequest,
  tokenFromUrl,
  uploadAndSubmit,
} from './ownerFlow';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const pdf = { name: 'MFA settings.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf };

describe('owner portal: magic links', () => {
  it('shows the request to the link holder, without exposing internal details', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app, { instructions: 'Show the date' });

    const response = await asOwner(app, token).portal().expect(200);

    expect(response.body).toMatchObject({
      request: {
        controlRef: 'CC6.1',
        instructions: 'Show the date',
        status: 'PENDING',
        version: 0,
      },
      auditName: 'SOC 2 Type II',
      canSubmit: true,
      changesComment: null,
      currentSubmission: null,
    });
    expect(JSON.stringify(response.body)).not.toContain('ownerId');
  });

  it('refuses a missing, unknown, revoked or expired link with distinct codes', async () => {
    const app = ctx.makeApp();
    const { agent, auditId, requestId, token } = await setupRequest(app);

    expect((await request(app).get('/e/request').expect(401)).body.error.code).toBe('LINK_INVALID');
    expect((await asOwner(app, 'not-a-real-token').portal().expect(401)).body.error.code).toBe(
      'LINK_INVALID',
    );

    // Changing the owner's email revokes their link (FR-5).
    await agent
      .patch(`/audits/${auditId}/requests/${requestId}`)
      .set('Origin', WEB_ORIGIN)
      .send({ ownerEmail: 'someone.else@example.com' })
      .expect(200);
    expect((await asOwner(app, token).portal().expect(403)).body.error.code).toBe('LINK_REVOKED');

    const fresh = await issueToken(agent, auditId, requestId);
    await ctx.prisma.accessToken.updateMany({
      where: { revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await asOwner(app, fresh).portal().expect(403)).body.error.code).toBe('LINK_EXPIRED');
  });

  it('stores only a hash of the token', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);

    const stored = await ctx.prisma.accessToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rate-limits the public owner routes', async () => {
    const app = ctx.makeApp();
    for (let i = 0; i < 30; i += 1) await asOwner(app, 'guess').portal().expect(401);
    expect((await asOwner(app, 'guess').portal().expect(429)).body.error.code).toBe('RATE_LIMITED');
  });
});

describe('owner portal: uploading evidence', () => {
  it('verifies, promotes and locks a valid upload, then notifies the manager', async () => {
    const app = ctx.makeApp();
    const { token, requestId, auditId, managerEmail } = await setupRequest(app);

    const { response, fileIds, keys } = await uploadAndSubmit(app, ctx.storage, token, [pdf], {
      note: 'Q3 export',
    });

    expect(response.status).toBe(201);
    expect(response.body.submission).toMatchObject({
      note: 'Q3 export',
      isCurrent: true,
      files: [
        {
          originalName: 'MFA settings.pdf',
          contentType: 'application/pdf',
          state: 'VERIFIED',
          previewable: true,
        },
      ],
    });

    const file = await ctx.prisma.evidenceFile.findUniqueOrThrow({ where: { id: fileIds[0]! } });
    expect(file.storageKey).toBe(
      `evidence/${auditId}/${requestId}/${file.submissionId}/${file.id}`,
    );
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(file.retainUntil!.getTime()).toBeGreaterThan(Date.now() + 89 * 24 * 60 * 60 * 1000);
    expect(ctx.storage.objects.has(keys[0]!)).toBe(false); // quarantine copy removed
    expect(ctx.storage.objects.get(file.storageKey)?.retainUntil).toEqual(file.retainUntil);

    const saved = await ctx.prisma.evidenceRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(saved).toMatchObject({ status: 'SUBMITTED', version: 1 });
    const log = await ctx.prisma.activityLog.findFirstOrThrow({ where: { action: 'SUBMITTED' } });
    expect(log).toMatchObject({ actorType: 'OWNER', fromStatus: 'PENDING', toStatus: 'SUBMITTED' });

    expect(ctx.mailer.sent.find((email) => email.to === managerEmail)?.subject).toBe(
      'Evidence to review: CC6.1 MFA enforcement screenshot',
    );
  });

  it('accepts a plain-text CSV and rejects one that is not UTF-8', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);
    const owner = asOwner(app, token);

    const bad = await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'users.csv', type: 'text/csv', data: Buffer.from([0x61, 0x2c, 0xff, 0xfe, 0x0a]) },
    ]);
    expect(bad.response.status).toBe(422);
    expect(bad.response.body.error.details.files[0].reason).toContain('UTF-8');

    const good = await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'users.csv', type: 'text/csv', data: SAMPLE_FILES.csv },
    ]);
    expect(good.response.status).toBe(201);
    expect((await owner.portal()).body.request.status).toBe('SUBMITTED');
  });

  it('catches a program renamed to .pdf, deletes it, and changes nothing else', async () => {
    const app = ctx.makeApp();
    const { token, requestId } = await setupRequest(app);

    const { response, fileIds, keys } = await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'invoice.pdf', type: 'application/pdf', data: SAMPLE_FILES.exe },
    ]);

    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: 'FILES_REJECTED' });
    expect(response.body.error.details.files[0]).toMatchObject({ name: 'invoice.pdf' });
    expect(response.body.error.details.files[0].reason).toContain(
      'really application/x-msdownload',
    );

    expect(ctx.storage.objects.has(keys[0]!)).toBe(false);
    expect(await ctx.prisma.evidenceFile.findUnique({ where: { id: fileIds[0]! } })).toMatchObject({
      state: 'REJECTED',
    });
    expect(await ctx.prisma.evidenceRequest.findUnique({ where: { id: requestId } })).toMatchObject(
      {
        status: 'PENDING',
        version: 0,
      },
    );
    expect(await ctx.prisma.submission.count()).toBe(0);
  });

  it('refuses disallowed files before issuing any upload link', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);

    const response = await asOwner(app, token)
      .prepare([
        { name: 'setup.exe', size: 1000, type: 'application/x-msdownload' },
        { name: 'ok.pdf', size: 1000, type: 'application/pdf' },
      ])
      .expect(422);

    expect(response.body.error.details.files).toEqual([
      { name: 'setup.exe', reason: ".exe files aren't accepted" },
    ]);
    expect(await ctx.prisma.evidenceFile.count()).toBe(0);
  });

  it('pins each upload link to the exact size declared', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);

    const prepared = await asOwner(app, token)
      .prepare([{ name: 'a.pdf', size: 1234, type: 'application/pdf' }])
      .expect(201);
    expect(prepared.body.uploads[0]).toMatchObject({
      originalName: 'a.pdf',
      upload: { url: expect.any(String) },
    });
    expect(JSON.stringify(prepared.body)).not.toContain('storageKey');
  });

  it('reports a file that was never uploaded, or does not match what was declared', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);

    const missing = await uploadAndSubmit(app, ctx.storage, token, [pdf], { upload: false });
    expect(missing.response.status).toBe(422);
    expect(missing.response.body.error.details.files[0].reason).toContain("didn't finish");

    const owner = asOwner(app, token);
    const prepared = await owner
      .prepare([{ name: 'a.pdf', size: 999, type: 'application/pdf' }])
      .expect(201);
    ctx.storage.putObject(prepared.body.uploads[0].upload.fields.key, SAMPLE_FILES.pdf);
    const mismatch = await owner
      .submit({ fileIds: [prepared.body.uploads[0].fileId], version: 0 })
      .expect(422);
    expect(mismatch.body.error.details.files[0].reason).toContain("doesn't match");
  });

  it("can't submit another request's files", async () => {
    const app = ctx.makeApp();
    const first = await setupRequest(app);
    const second = await setupRequest(app);

    const prepared = await asOwner(app, first.token)
      .prepare([{ name: 'a.pdf', size: 10, type: 'application/pdf' }])
      .expect(201);
    await asOwner(app, second.token)
      .submit({ fileIds: [prepared.body.uploads[0].fileId], version: 0 })
      .expect(404);
  });

  it('refuses a submit based on an outdated version of the request', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);
    await uploadAndSubmit(app, ctx.storage, token, [pdf]);

    const { response } = await uploadAndSubmit(app, ctx.storage, token, [pdf], { version: 0 });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('STALE_VERSION');
  });

  it('lets the owner replace a submission that is still awaiting review', async () => {
    const app = ctx.makeApp();
    const { token, requestId } = await setupRequest(app);
    await uploadAndSubmit(app, ctx.storage, token, [pdf]);

    const { response } = await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'better.png', type: 'image/png', data: SAMPLE_FILES.png },
    ]);
    expect(response.status).toBe(201);

    const submissions = await ctx.prisma.submission.findMany({
      where: { requestId },
      orderBy: { submittedAt: 'asc' },
    });
    expect(submissions.map((s) => s.isCurrent)).toEqual([false, true]);
  });

  it('makes accepted evidence and archived audits read-only', async () => {
    const app = ctx.makeApp();
    const { agent, token, requestId } = await setupRequest(app);
    await uploadAndSubmit(app, ctx.storage, token, [pdf]);
    await agent
      .post(`/requests/${requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(200);

    const owner = asOwner(app, token);
    expect((await owner.portal()).body.canSubmit).toBe(false);
    expect(
      (await owner.prepare([{ name: 'a.pdf', size: 10, type: 'application/pdf' }]).expect(409)).body
        .error.code,
    ).toBe('ALREADY_ACCEPTED');

    const other = await setupRequest(app);
    await other.agent
      .post(`/audits/${other.auditId}/archive`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(
      (
        await asOwner(app, other.token)
          .prepare([{ name: 'a.pdf', size: 10, type: 'application/pdf' }])
          .expect(409)
      ).body.error.code,
    ).toBe('AUDIT_ARCHIVED');
  });

  it('retries a promotion that failed half-way, through the scan-check job', async () => {
    const app = ctx.makeApp();
    const { token } = await setupRequest(app);
    const owner = asOwner(app, token);

    const prepared = await owner
      .prepare([{ name: 'a.pdf', size: SAMPLE_FILES.pdf.length, type: 'application/pdf' }])
      .expect(201);
    const { fileId, upload } = prepared.body.uploads[0];
    ctx.storage.putObject(upload.fields.key, SAMPLE_FILES.pdf);
    ctx.storage.failNextCopy.add(upload.fields.key);

    const submitted = await owner.submit({ fileIds: [fileId], version: 0 }).expect(201);
    expect(submitted.body.submission.files[0].state).toBe('AWAITING_SCAN');

    await request(app)
      .post('/internal/cron/scan-check')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(202);
    await eventually(
      async () =>
        (await ctx.prisma.evidenceFile.findUnique({ where: { id: fileId } }))?.state === 'VERIFIED',
    );
  });
});

describe('sending requests', () => {
  it('sends each owner one email with a working link per request', async () => {
    const app = ctx.makeApp();
    const { agent, auditId } = await setupRequest(app);
    await agent
      .post(`/audits/${auditId}/requests`)
      .set('Origin', WEB_ORIGIN)
      .send({
        controlRef: 'CC6.2',
        title: 'Access review',
        ownerEmail: 'rahul@example.com',
        dueDate: '2099-11-10',
      })
      .expect(201);
    await agent
      .post(`/audits/${auditId}/requests`)
      .set('Origin', WEB_ORIGIN)
      .send({
        controlRef: 'CC7.2',
        title: 'Incident log',
        ownerEmail: 'vikram@example.com',
        dueDate: '2099-11-10',
      })
      .expect(201);

    const result = await agent
      .post(`/audits/${auditId}/requests/send`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(result.body).toEqual({ emailsSent: 2, requestsIncluded: 3, failedRecipients: [] });

    const rahulLinks = ctx.mailer.linksTo('rahul@example.com');
    expect(rahulLinks).toHaveLength(2);
    const portal = await asOwner(app, tokenFromUrl(rahulLinks[1]!)).portal().expect(200);
    expect(portal.body.request.controlRef).toBe('CC6.2');
  });

  it('reports owners whose email failed', async () => {
    const app = ctx.makeApp();
    const { agent, auditId } = await setupRequest(app);
    ctx.mailer.failFor.add('rahul@example.com');

    const result = await agent
      .post(`/audits/${auditId}/requests/send`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(result.body).toMatchObject({ emailsSent: 0, failedRecipients: ['rahul@example.com'] });
  });

  it('has nothing to send once all evidence is in', async () => {
    const app = ctx.makeApp();
    const { agent, auditId, token } = await setupRequest(app);
    await uploadAndSubmit(app, ctx.storage, token, [pdf]);

    const result = await agent
      .post(`/audits/${auditId}/requests/send`)
      .set('Origin', WEB_ORIGIN)
      .expect(422);
    expect(result.body.error.code).toBe('NOTHING_TO_SEND');
  });
});
