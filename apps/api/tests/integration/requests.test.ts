import { createHash, randomBytes } from 'node:crypto';
import type { Express } from 'express';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, signedInAgent, WEB_ORIGIN } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const request = {
  controlRef: 'CC6.1',
  title: 'MFA enforcement screenshot',
  instructions: 'Show the admin console with the date visible',
  ownerName: 'Rahul',
  ownerEmail: 'Rahul@Example.com',
  dueDate: '2026-11-01',
};

async function setup(app: Express = ctx.makeApp()) {
  const { agent } = await signedInAgent(app);
  const audit = await agent
    .post('/audits')
    .set('Origin', WEB_ORIGIN)
    .send({ name: 'SOC 2', framework: 'SOC2' })
    .expect(201);
  const base = `/audits/${audit.body.audit.id}/requests`;
  return { agent, base, auditId: audit.body.audit.id as string };
}

const CSV_HEADER = 'controlRef,title,instructions,ownerName,ownerEmail,dueDate';

describe('evidence requests', () => {
  it('creates and lists a request with normalized fields', async () => {
    const { agent, base } = await setup();

    const created = await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);
    expect(created.body.request).toMatchObject({
      controlRef: 'CC6.1',
      ownerEmail: 'rahul@example.com',
      dueDate: '2026-11-01',
      status: 'PENDING',
      hasSubmissions: false,
      version: 0,
    });

    const list = await agent.get(base).expect(200);
    expect(list.body.requests).toHaveLength(1);
  });

  it('flags overdue requests and counts them in the audit summary', async () => {
    const { agent, base, auditId } = await setup();
    await agent
      .post(base)
      .set('Origin', WEB_ORIGIN)
      .send({ ...request, dueDate: '2020-01-01' })
      .expect(201);
    await agent
      .post(base)
      .set('Origin', WEB_ORIGIN)
      .send({ ...request, controlRef: 'CC6.2', dueDate: '2999-01-01' })
      .expect(201);

    const list = await agent.get(base).expect(200);
    expect(list.body.requests.map((r: { isOverdue: boolean }) => r.isOverdue)).toEqual([
      true,
      false,
    ]);

    const audit = await agent.get(`/audits/${auditId}`).expect(200);
    expect(audit.body.audit.summary).toMatchObject({ total: 2, pending: 2, overdue: 1 });
  });

  it('refuses a duplicate control ID, ignoring case', async () => {
    const { agent, base } = await setup();
    await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);

    const response = await agent
      .post(base)
      .set('Origin', WEB_ORIGIN)
      .send({ ...request, controlRef: 'cc6.1' })
      .expect(409);
    expect(response.body.error.code).toBe('DUPLICATE_CONTROL_REF');
  });

  it('updates only the fields that were sent', async () => {
    const { agent, base } = await setup();
    const created = await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);

    const updated = await agent
      .patch(`${base}/${created.body.request.id}`)
      .set('Origin', WEB_ORIGIN)
      .send({ title: 'New title' })
      .expect(200);

    expect(updated.body.request).toMatchObject({
      title: 'New title',
      instructions: request.instructions,
      ownerName: 'Rahul',
    });
  });

  it("revokes the old owner's links when the owner email changes", async () => {
    const { agent, base } = await setup();
    const created = await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);
    const requestId = created.body.request.id;

    // Magic links are issued in Phase 3; insert one directly to check the revocation rule.
    await ctx.prisma.accessToken.create({
      data: {
        requestId,
        tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await agent
      .patch(`${base}/${requestId}`)
      .set('Origin', WEB_ORIGIN)
      .send({ title: 'Same owner' })
      .expect(200);
    expect(await ctx.prisma.accessToken.count({ where: { requestId, revokedAt: null } })).toBe(1);

    await agent
      .patch(`${base}/${requestId}`)
      .set('Origin', WEB_ORIGIN)
      .send({ ownerEmail: 'new.owner@example.com' })
      .expect(200);
    expect(await ctx.prisma.accessToken.count({ where: { requestId, revokedAt: null } })).toBe(0);
  });

  it('deletes a request without submissions but keeps one with evidence', async () => {
    const { agent, base } = await setup();
    const a = await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);
    const b = await agent
      .post(base)
      .set('Origin', WEB_ORIGIN)
      .send({ ...request, controlRef: 'CC6.2' })
      .expect(201);

    await agent.delete(`${base}/${a.body.request.id}`).set('Origin', WEB_ORIGIN).expect(204);

    await ctx.prisma.submission.create({ data: { requestId: b.body.request.id } });
    const blocked = await agent
      .delete(`${base}/${b.body.request.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(409);
    expect(blocked.body.error.code).toBe('HAS_SUBMISSIONS');
  });

  it("can't reach a request through another manager's audit", async () => {
    const app = ctx.makeApp();
    const alice = await setup(app);
    const created = await alice.agent
      .post(alice.base)
      .set('Origin', WEB_ORIGIN)
      .send(request)
      .expect(201);
    const bob = await setup(app);

    // Bob uses his own audit ID with Alice's request ID: still not found.
    await bob.agent
      .patch(`${bob.base}/${created.body.request.id}`)
      .set('Origin', WEB_ORIGIN)
      .send({ title: 'Hijacked' })
      .expect(404);
    await bob.agent
      .delete(`${alice.base}/${created.body.request.id}`)
      .set('Origin', WEB_ORIGIN)
      .expect(404);
  });

  describe('CSV import', () => {
    it('imports every row of a valid file', async () => {
      const { agent, base } = await setup();
      const csv = [
        CSV_HEADER,
        'CC6.1,MFA screenshot,,Rahul,rahul@example.com,2026-11-01',
        'CC6.2,Access review,"Q3, signed",,ananya@example.com,2026-11-05',
      ].join('\n');

      const response = await agent
        .post(`${base}/import`)
        .set('Origin', WEB_ORIGIN)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(201);
      expect(response.body).toEqual({ imported: 2 });

      const list = await agent.get(base).expect(200);
      expect(
        list.body.requests.map((r: { instructions: string | null }) => r.instructions),
      ).toEqual([null, 'Q3, signed']);
    });

    it('imports nothing when any row is invalid', async () => {
      const { agent, base } = await setup();
      const csv = [
        CSV_HEADER,
        'CC6.1,MFA screenshot,,,rahul@example.com,2026-11-01',
        'CC6.2,Access review,,,not-an-email,2026-11-05',
      ].join('\n');

      const response = await agent
        .post(`${base}/import`)
        .set('Origin', WEB_ORIGIN)
        .set('Content-Type', 'text/csv')
        .send(csv)
        .expect(422);

      expect(response.body.error.code).toBe('CSV_INVALID');
      expect(response.body.error.details.rows).toEqual([
        { row: 3, field: 'ownerEmail', message: 'Enter a valid email address' },
      ]);
      const list = await agent.get(base).expect(200);
      expect(list.body.requests).toEqual([]);
    });

    it('reports rows whose control ID already exists in the audit', async () => {
      const { agent, base } = await setup();
      await agent.post(base).set('Origin', WEB_ORIGIN).send(request).expect(201);

      const response = await agent
        .post(`${base}/import`)
        .set('Origin', WEB_ORIGIN)
        .set('Content-Type', 'text/csv')
        .send(
          `${CSV_HEADER}\nCC9.9,New,,,a@example.com,2026-11-01\ncc6.1,Dup,,,b@example.com,2026-11-01`,
        )
        .expect(422);

      expect(response.body.error.details.rows).toEqual([
        { row: 3, field: 'controlRef', message: 'Control ID "cc6.1" already exists in this audit' },
      ]);
      expect(await ctx.prisma.evidenceRequest.count()).toBe(1);
    });
  });
});
