import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createRepositories } from '../../src/repositories';
import { createNotificationService } from '../../src/services/notificationService';
import { createReminderService } from '../../src/services/reminderService';
import { createTokenService } from '../../src/services/tokenService';
import { createTestContext, CRON_SECRET, SAMPLE_FILES, WEB_ORIGIN } from './helpers';
import { asOwner, eventually, setupRequest, tokenFromUrl, uploadAndSubmit } from './ownerFlow';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const TODAY = '2099-01-10';
let now = new Date(`${TODAY}T03:30:00Z`); // 09:00 IST, when the job runs
const clock = () => now;
beforeEach(() => {
  now = new Date(`${TODAY}T03:30:00Z`);
});

/** The reminder service wired to the test database, with the pinned clock. */
function reminderService() {
  const logger = pino({ level: 'silent' });
  const repos = createRepositories(ctx.prisma);
  const tokens = createTokenService(repos, ctx.env, logger, clock);
  const notifications = createNotificationService(ctx.mailer, tokens, ctx.env, logger);
  return createReminderService(repos, notifications, logger, clock);
}

/** One audit for Rahul with requests due at different points around today. */
async function auditWithDueRequests() {
  const app = ctx.makeApp({ clock });
  const setup = await setupRequest(app, {
    controlRef: 'CC1',
    title: 'Due in a week',
    dueDate: '2099-01-17',
  });
  const add = (body: Record<string, string>) =>
    setup.agent
      .post(`/audits/${setup.auditId}/requests`)
      .set('Origin', WEB_ORIGIN)
      .send({ ownerEmail: 'rahul@example.com', ownerName: 'Rahul', ...body })
      .expect(201);
  await add({ controlRef: 'CC2', title: 'Due in three days', dueDate: '2099-01-13' });
  await add({ controlRef: 'CC3', title: 'Three days late', dueDate: '2099-01-07' });
  await add({ controlRef: 'CC4', title: 'Due in two days', dueDate: '2099-01-12' }); // no reminder today
  return { app, ...setup, add };
}

const emailsTo = (address: string) => ctx.mailer.sent.filter((email) => email.to === address);

describe('daily reminders', () => {
  it('sends each owner one digest covering every request due a reminder today', async () => {
    const { app } = await auditWithDueRequests();

    const summary = await reminderService().run();

    expect(summary).toMatchObject({
      scanned: 4,
      due: 3,
      emailsSent: 1,
      requestsReminded: 3,
      failed: 0,
    });
    const [digest] = emailsTo('rahul@example.com');
    expect(digest?.subject).toBe('Overdue: evidence for 1 request');
    expect(digest?.text).toContain('CC3: Three days late (SOC 2 Type II): Overdue by 3 days');
    expect(digest?.text).toContain('CC2: Due in three days (SOC 2 Type II): Due in 3 days');
    expect(digest?.text).not.toContain('CC4');

    // Each reminder carries a working link.
    const links = ctx.mailer.linksTo('rahul@example.com');
    expect(links).toHaveLength(3);
    await asOwner(app, tokenFromUrl(links[0]!)).portal().expect(200);

    expect(await ctx.prisma.activityLog.count({ where: { action: 'REMINDER_SENT' } })).toBe(3);
  });

  it('sends nothing more when it runs again the same day', async () => {
    await auditWithDueRequests();
    const service = reminderService();

    await service.run();
    const second = await service.run();

    expect(second).toMatchObject({ emailsSent: 0, skippedOwnerCap: 3 });
    expect(emailsTo('rahul@example.com')).toHaveLength(1);
  });

  it('never sends twice even when two runs overlap', async () => {
    await auditWithDueRequests();
    const service = reminderService();

    const results = await Promise.all([service.run(), service.run()]);

    expect(results.reduce((total, run) => total + run.emailsSent, 0)).toBe(1);
    expect(emailsTo('rahul@example.com')).toHaveLength(1);
  });

  it('retries on the next run when an email fails', async () => {
    await auditWithDueRequests();
    const service = reminderService();
    ctx.mailer.failFor.add('rahul@example.com');

    expect(await service.run()).toMatchObject({ emailsSent: 0, failed: 1 });
    expect(await ctx.prisma.reminderLog.count()).toBe(0); // claims released

    ctx.mailer.failFor.clear();
    expect(await service.run()).toMatchObject({ emailsSent: 1, requestsReminded: 3 });
  });

  it('emails different owners separately', async () => {
    const { add } = await auditWithDueRequests();
    await add({
      controlRef: 'CC5',
      title: 'Vikram, due today',
      dueDate: TODAY,
      ownerEmail: 'vikram@example.com',
      ownerName: 'Vikram',
    });

    expect(await reminderService().run()).toMatchObject({ emailsSent: 2, requestsReminded: 4 });
    expect(emailsTo('vikram@example.com')[0]?.text).toContain('Due today');
  });

  it('skips submitted evidence, archived audits and audits with reminders off', async () => {
    const { app, token } = await auditWithDueRequests();
    // CC1 has evidence in, so it's no longer chased.
    await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'a.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf },
    ]);
    expect(await reminderService().run()).toMatchObject({ scanned: 3, due: 2 });

    await ctx.reset();
    const second = await auditWithDueRequests();
    await second.agent
      .patch(`/audits/${second.auditId}`)
      .set('Origin', WEB_ORIGIN)
      .send({ remindersOn: false })
      .expect(200);
    expect(await reminderService().run()).toMatchObject({ scanned: 0, emailsSent: 0 });

    await ctx.reset();
    const third = await auditWithDueRequests();
    await third.agent
      .post(`/audits/${third.auditId}/archive`)
      .set('Origin', WEB_ORIGIN)
      .expect(200);
    expect(await reminderService().run()).toMatchObject({ scanned: 0, emailsSent: 0 });
  });

  it('runs from the scheduled job, protected by the cron secret', async () => {
    const { app } = await auditWithDueRequests();

    await request(app).post('/internal/cron/reminders').expect(401);
    await request(app)
      .post('/internal/cron/reminders')
      .set('Authorization', `Bearer ${CRON_SECRET}`)
      .expect(202);

    await eventually(async () => emailsTo('rahul@example.com').length === 1);
  });
});

describe('nudge now', () => {
  it('sends an immediate reminder, once per owner per day', async () => {
    const app = ctx.makeApp({ clock });
    const { agent, auditId, requestId } = await setupRequest(app, { dueDate: '2099-01-12' });
    const nudge = () =>
      agent.post(`/audits/${auditId}/requests/${requestId}/nudge`).set('Origin', WEB_ORIGIN);

    await nudge().expect(204);
    expect(emailsTo('rahul@example.com')[0]?.text).toContain('Due in 2 days');
    expect(await ctx.prisma.activityLog.findFirst({ where: { action: 'NUDGED' } })).toMatchObject({
      actorType: 'MANAGER',
    });

    expect((await nudge().expect(409)).body.error.code).toBe('ALREADY_REMINDED_TODAY');
    // …and the daily job respects the same cap.
    now = new Date(`${TODAY}T10:00:00Z`);
    expect(await reminderService().run()).toMatchObject({ emailsSent: 0 });
  });

  it('refuses to chase evidence that is already in, or another manager’s request', async () => {
    const app = ctx.makeApp({ clock });
    const { agent, auditId, requestId, token } = await setupRequest(app, { dueDate: '2099-01-12' });
    await uploadAndSubmit(app, ctx.storage, token, [
      { name: 'a.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf },
    ]);

    const submitted = await agent
      .post(`/audits/${auditId}/requests/${requestId}/nudge`)
      .set('Origin', WEB_ORIGIN)
      .expect(409);
    expect(submitted.body.error.code).toBe('NOTHING_TO_CHASE');

    const other = await setupRequest(app);
    await other.agent
      .post(`/audits/${other.auditId}/requests/${requestId}/nudge`)
      .set('Origin', WEB_ORIGIN)
      .expect(404);
  });
});
