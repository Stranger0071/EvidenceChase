import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, SAMPLE_FILES, signedInAgent, WEB_ORIGIN } from './helpers';
import { issueToken, setupRequest, uploadAndSubmit } from './ownerFlow';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const TODAY = '2099-01-10';
const clock = () => new Date(`${TODAY}T08:00:00Z`);

describe('audit dashboard', () => {
  it('matches the requests table: per-owner progress, overdue list and scanning files', async () => {
    const app = ctx.makeApp({ clock });
    const { agent, auditId, token } = await setupRequest(app, { dueDate: '2099-01-05' }); // Rahul, CC6.1
    const add = async (body: Record<string, string>) =>
      (
        await agent
          .post(`/audits/${auditId}/requests`)
          .set('Origin', WEB_ORIGIN)
          .send(body)
          .expect(201)
      ).body.request as { id: string };

    await add({
      controlRef: 'CC6.2',
      title: 'Rahul, overdue',
      ownerEmail: 'rahul@example.com',
      dueDate: '2099-01-08',
    });
    const vikram = await add({
      controlRef: 'CC7.2',
      title: 'Vikram',
      ownerEmail: 'vikram@example.com',
      ownerName: 'Vikram',
      dueDate: '2099-01-01',
    });
    await add({
      controlRef: 'A1.2',
      title: 'Infra',
      ownerEmail: 'infra@example.com',
      dueDate: '2099-02-01',
    });

    // Rahul submits CC6.1 (no longer overdue); Vikram's evidence is accepted.
    await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'a.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf },
    ]);
    await uploadAndSubmit(app, ctx.storage, await issueToken(agent, auditId, vikram.id), [
      { name: 'b.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf },
    ]);
    await agent
      .post(`/requests/${vikram.id}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(200);
    // A file still waiting for the malware scan.
    const cc62 = await ctx.prisma.evidenceRequest.findFirstOrThrow({
      where: { controlRef: 'CC6.2' },
    });
    await ctx.prisma.evidenceFile.create({
      data: {
        id: crypto.randomUUID(),
        requestId: cc62.id,
        storageKey: 'quarantine/x',
        originalName: 'c.pdf',
        declaredMime: 'application/pdf',
        sizeBytes: 1,
        state: 'AWAITING_SCAN',
      },
    });

    const { body } = await agent.get(`/audits/${auditId}/dashboard`).expect(200);

    expect(body.dashboard.summary).toEqual({
      total: 4,
      pending: 2,
      submitted: 1,
      changesRequested: 0,
      accepted: 1,
      overdue: 1,
      percentComplete: 25,
    });
    expect(body.dashboard.filesScanning).toBe(1);
    expect(body.dashboard.owners).toEqual([
      {
        ownerEmail: 'rahul@example.com',
        ownerName: 'Rahul',
        total: 2,
        accepted: 0,
        inReview: 1,
        waiting: 1,
        overdue: 1,
      },
      {
        ownerEmail: 'infra@example.com',
        ownerName: null,
        total: 1,
        accepted: 0,
        inReview: 0,
        waiting: 1,
        overdue: 0,
      },
      {
        ownerEmail: 'vikram@example.com',
        ownerName: 'Vikram',
        total: 1,
        accepted: 1,
        inReview: 0,
        waiting: 0,
        overdue: 0,
      },
    ]);
    expect(body.dashboard.overdue).toEqual([
      expect.objectContaining({
        controlRef: 'CC6.2',
        dueDate: '2099-01-08',
        daysOverdue: 2,
        status: 'PENDING',
      }),
    ]);

    // The summary on the audit itself agrees.
    const audit = await agent.get(`/audits/${auditId}`).expect(200);
    expect(audit.body.audit.summary).toEqual(body.dashboard.summary);
  });

  it('is empty, not broken, for an audit with no requests', async () => {
    const app = ctx.makeApp({ clock });
    const { agent } = await signedInAgent(app);
    const audit = await agent
      .post('/audits')
      .set('Origin', WEB_ORIGIN)
      .send({ name: 'Empty', framework: 'SOC2' })
      .expect(201);

    const { body } = await agent.get(`/audits/${audit.body.audit.id}/dashboard`).expect(200);
    expect(body.dashboard).toMatchObject({
      filesScanning: 0,
      owners: [],
      overdue: [],
      summary: { total: 0 },
    });
  });

  it('is never shown to another manager', async () => {
    const app = ctx.makeApp({ clock });
    const { auditId } = await setupRequest(app);
    const { agent: other } = await signedInAgent(app, 'Bob');
    await other.get(`/audits/${auditId}/dashboard`).expect(404);
  });
});
