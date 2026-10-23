import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, SAMPLE_FILES, signedInAgent, WEB_ORIGIN } from './helpers';
import { asOwner, setupRequest, tokenFromUrl, uploadAndSubmit } from './ownerFlow';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const pdf = { name: 'MFA settings.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf };

/** A request with one verified submission, ready for review (version 1). */
async function submitted() {
  const app = ctx.makeApp();
  const setup = await setupRequest(app);
  const { response } = await uploadAndSubmit(app, ctx.storage, setup.token, [pdf]);
  expect(response.status).toBe(201);
  const review = (body: Record<string, unknown>) =>
    setup.agent.post(`/requests/${setup.requestId}/review`).set('Origin', WEB_ORIGIN).send(body);
  return { app, ...setup, review, fileId: response.body.submission.files[0].id as string };
}

describe('reviewing evidence', () => {
  it('accepts verified evidence and records who did it', async () => {
    const { review, requestId, managerEmail } = await submitted();

    const response = await review({ action: 'ACCEPT', version: 1 }).expect(200);

    expect(response.body.request).toMatchObject({ status: 'ACCEPTED', version: 2 });
    const log = await ctx.prisma.activityLog.findFirstOrThrow({
      where: { requestId, action: 'ACCEPT' },
    });
    expect(log).toMatchObject({
      actorType: 'MANAGER',
      actorEmail: managerEmail,
      fromStatus: 'SUBMITTED',
      toStatus: 'ACCEPTED',
    });
  });

  it('refuses a review based on an outdated version (optimistic locking)', async () => {
    const { review } = await submitted();

    expect((await review({ action: 'ACCEPT', version: 0 }).expect(409)).body.error.code).toBe(
      'STALE_VERSION',
    );
  });

  it('lets exactly one of two simultaneous reviews win', async () => {
    const { review } = await submitted();

    const results = await Promise.all([
      review({ action: 'ACCEPT', version: 1 }),
      review({ action: 'REQUEST_CHANGES', comment: 'Needs the date visible', version: 1 }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await ctx.prisma.activityLog.count({
        where: { actorType: 'MANAGER', toStatus: { not: null } },
      }),
    ).toBe(1);
  });

  it('sends evidence back with a comment, and the owner sees it and resubmits', async () => {
    const { app, review, requestId } = await submitted();

    expect(
      (await review({ action: 'REQUEST_CHANGES', version: 1 }).expect(422)).body.error.code,
    ).toBe('COMMENT_REQUIRED');

    await review({
      action: 'REQUEST_CHANGES',
      comment: 'The screenshot must show the date',
      version: 1,
    }).expect(200);

    const email = ctx.mailer.sent.find((message) => message.subject.startsWith('Changes needed'));
    expect(email?.text).toContain('The screenshot must show the date');
    const token = tokenFromUrl(ctx.mailer.linksTo('rahul@example.com').at(-1)!);

    const portal = await asOwner(app, token).portal().expect(200);
    expect(portal.body).toMatchObject({
      request: { status: 'CHANGES_REQUESTED' },
      changesComment: 'The screenshot must show the date',
      canSubmit: true,
    });

    const { response } = await uploadAndSubmit(app, ctx.storage, token, [pdf]);
    expect(response.status).toBe(201);
    expect(await ctx.prisma.evidenceRequest.findUnique({ where: { id: requestId } })).toMatchObject(
      { status: 'SUBMITTED' },
    );
  });

  it('re-opens accepted evidence with a comment', async () => {
    const { review } = await submitted();
    await review({ action: 'ACCEPT', version: 1 }).expect(200);

    const response = await review({
      action: 'REOPEN',
      comment: 'Auditor wants Q4 too',
      version: 2,
    }).expect(200);
    expect(response.body.request.status).toBe('CHANGES_REQUESTED');
  });

  it('refuses to accept a request with nothing submitted', async () => {
    const app = ctx.makeApp();
    const { agent, requestId } = await setupRequest(app);

    const response = await agent
      .post(`/requests/${requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 0 })
      .expect(409);
    expect(response.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('makes reviews read-only once the audit is archived', async () => {
    const { agent, auditId, review } = await submitted();
    await agent.post(`/audits/${auditId}/archive`).set('Origin', WEB_ORIGIN).expect(200);

    expect((await review({ action: 'ACCEPT', version: 1 }).expect(409)).body.error.code).toBe(
      'AUDIT_ARCHIVED',
    );
  });
});

describe('evidence history and files', () => {
  it('lists submissions and a timeline without internal details', async () => {
    const { agent, requestId } = await submitted();

    const submissions = await agent.get(`/requests/${requestId}/submissions`).expect(200);
    expect(submissions.body.submissions).toHaveLength(1);
    expect(JSON.stringify(submissions.body)).not.toMatch(/storageKey|quarantine\/|evidence\//);

    const timeline = await agent.get(`/requests/${requestId}/timeline`).expect(200);
    expect(timeline.body.timeline[0]).toMatchObject({ actorType: 'OWNER', action: 'SUBMITTED' });
    expect(timeline.body.timeline[0]).not.toHaveProperty('ip');
  });

  it('gives a short-lived download link, inline only for previewable types, and logs it', async () => {
    const { agent, fileId, requestId } = await submitted();

    const download = await agent.get(`/files/${fileId}/url`).expect(200);
    expect(download.body).toMatchObject({ expiresInSeconds: 60 });
    expect(download.body.url).toContain('disposition=attachment');

    const preview = await agent.get(`/files/${fileId}/url?disposition=inline`).expect(200);
    expect(preview.body.url).toContain('disposition=inline');

    const actions = (await ctx.prisma.activityLog.findMany({ where: { requestId } })).map(
      (entry) => entry.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['DOWNLOADED', 'PREVIEWED']));
  });

  it("never serves another manager's requests or files (IDOR)", async () => {
    const { app, fileId, requestId } = await submitted();
    const { agent: other } = await signedInAgent(app, 'Bob');

    await other.get(`/files/${fileId}/url`).expect(404);
    await other.get(`/requests/${requestId}/submissions`).expect(404);
    await other.get(`/requests/${requestId}/timeline`).expect(404);
    await other
      .post(`/requests/${requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(404);
  });

  it('requires a signed-in manager and a same-origin request', async () => {
    const { app, review, fileId } = await submitted();
    await request(app).get(`/files/${fileId}/url`).expect(401);
    await review({ action: 'ACCEPT', version: 1 })
      .set('Origin', 'https://evil.example')
      .expect(403);
  });
});
