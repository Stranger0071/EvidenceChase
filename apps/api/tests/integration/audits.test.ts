import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, signedInAgent, WEB_ORIGIN } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const newAudit = { name: 'SOC 2 Type II — FY26', framework: 'SOC2', auditDate: '2026-12-01' };

describe('audits', () => {
  it('creates, lists, reads and updates an audit', async () => {
    const { agent } = await signedInAgent(ctx.makeApp());

    const created = await agent
      .post('/audits')
      .set('Origin', WEB_ORIGIN)
      .send(newAudit)
      .expect(201);
    expect(created.body.audit).toMatchObject({
      ...newAudit,
      remindersOn: true,
      archivedAt: null,
      summary: { total: 0, percentComplete: 0 },
    });
    const id = created.body.audit.id;

    const list = await agent.get('/audits').expect(200);
    expect(list.body.audits).toHaveLength(1);

    const updated = await agent
      .patch(`/audits/${id}`)
      .set('Origin', WEB_ORIGIN)
      .send({ name: 'SOC 2 — renamed', auditDate: '' })
      .expect(200);
    expect(updated.body.audit).toMatchObject({
      name: 'SOC 2 — renamed',
      auditDate: null,
      framework: 'SOC2',
    });

    await agent.get(`/audits/${id}`).expect(200);
  });

  it('rejects an unknown framework and an impossible date', async () => {
    const { agent } = await signedInAgent(ctx.makeApp());

    const response = await agent
      .post('/audits')
      .set('Origin', WEB_ORIGIN)
      .send({ name: 'X', framework: 'NOPE', auditDate: '2026-02-30' })
      .expect(422);
    expect(Object.keys(response.body.error.details).sort()).toEqual(['auditDate', 'framework']);
  });

  it("never shows one manager another manager's audit (IDOR)", async () => {
    const app = ctx.makeApp();
    const alice = await signedInAgent(app, 'Alice');
    const bob = await signedInAgent(app, 'Bob');

    const created = await alice.agent
      .post('/audits')
      .set('Origin', WEB_ORIGIN)
      .send(newAudit)
      .expect(201);
    const id = created.body.audit.id;

    await bob.agent.get(`/audits/${id}`).expect(404);
    await bob.agent
      .patch(`/audits/${id}`)
      .set('Origin', WEB_ORIGIN)
      .send({ name: 'Hijacked' })
      .expect(404);
    await bob.agent.post(`/audits/${id}/archive`).set('Origin', WEB_ORIGIN).expect(404);
    await bob.agent.get(`/audits/${id}/requests`).expect(404);
    const bobList = await bob.agent.get('/audits').expect(200);
    expect(bobList.body.audits).toEqual([]);
  });

  it('treats a malformed ID as not found', async () => {
    const { agent } = await signedInAgent(ctx.makeApp());
    await agent.get('/audits/not-a-uuid').expect(404);
  });

  it('makes an archived audit read-only', async () => {
    const { agent } = await signedInAgent(ctx.makeApp());
    const created = await agent
      .post('/audits')
      .set('Origin', WEB_ORIGIN)
      .send(newAudit)
      .expect(201);
    const id = created.body.audit.id;

    const archived = await agent
      .post(`/audits/${id}/archive`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(archived.body.audit.archivedAt).not.toBeNull();

    // Archiving again is a no-op, not an error.
    await agent.post(`/audits/${id}/archive`).set('Origin', WEB_ORIGIN).expect(200);

    const blocked = await agent
      .patch(`/audits/${id}`)
      .set('Origin', WEB_ORIGIN)
      .send({ name: 'New' })
      .expect(409);
    expect(blocked.body.error.code).toBe('AUDIT_ARCHIVED');
    await agent
      .post(`/audits/${id}/requests`)
      .set('Origin', WEB_ORIGIN)
      .send({ controlRef: 'CC1', title: 'T', ownerEmail: 'a@example.com', dueDate: '2026-11-01' })
      .expect(409);
  });
});
