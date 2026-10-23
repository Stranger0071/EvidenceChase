import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, WEB_ORIGIN } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const credentials = {
  name: 'Priya',
  email: 'priya@example.com',
  password: 'correct-horse-battery',
};

describe('auth', () => {
  it('signs up, reads the session, and signs out', async () => {
    const agent = request.agent(ctx.makeApp());

    const signup = await agent
      .post('/auth/signup')
      .set('Origin', WEB_ORIGIN)
      .send(credentials)
      .expect(201);
    expect(signup.body.user).toMatchObject({ email: 'priya@example.com', name: 'Priya' });
    expect(signup.body.user).not.toHaveProperty('passwordHash');

    const cookie = signup.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^ec_sid=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    await agent.get('/auth/me').expect(200);
    await agent.post('/auth/logout').set('Origin', WEB_ORIGIN).expect(204);
    await agent.get('/auth/me').expect(401);
  });

  it('logs in with the right password', async () => {
    const app = ctx.makeApp();
    await request(app).post('/auth/signup').set('Origin', WEB_ORIGIN).send(credentials).expect(201);

    const agent = request.agent(app);
    await agent
      .post('/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'PRIYA@example.com', password: credentials.password })
      .expect(200);
    const me = await agent.get('/auth/me').expect(200);
    expect(me.body.user.email).toBe('priya@example.com');
  });

  it('gives a wrong password and an unknown email the same response', async () => {
    const app = ctx.makeApp();
    await request(app).post('/auth/signup').set('Origin', WEB_ORIGIN).send(credentials).expect(201);

    const wrongPassword = await request(app)
      .post('/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
    const unknownEmail = await request(app)
      .post('/auth/login')
      .set('Origin', WEB_ORIGIN)
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('refuses a second account with the same email', async () => {
    const app = ctx.makeApp();
    await request(app).post('/auth/signup').set('Origin', WEB_ORIGIN).send(credentials).expect(201);

    const response = await request(app)
      .post('/auth/signup')
      .set('Origin', WEB_ORIGIN)
      .send(credentials)
      .expect(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('returns per-field validation errors', async () => {
    const response = await request(ctx.makeApp())
      .post('/auth/signup')
      .set('Origin', WEB_ORIGIN)
      .send({ name: '', email: 'not-an-email', password: 'short' })
      .expect(422);

    expect(Object.keys(response.body.error.details).sort()).toEqual(['email', 'name', 'password']);
  });

  it('rate-limits the sixth login attempt in a minute', async () => {
    const app = ctx.makeApp();
    const attempt = () =>
      request(app)
        .post('/auth/login')
        .set('Origin', WEB_ORIGIN)
        .send({ email: 'priya@example.com', password: 'wrong-password' });

    for (let i = 0; i < 5; i += 1) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('refuses state-changing requests from another origin', async () => {
    const app = ctx.makeApp();
    await request(app)
      .post('/auth/signup')
      .set('Origin', 'https://evil.example')
      .send(credentials)
      .expect(403);
    await request(app).post('/auth/signup').send(credentials).expect(403);
  });

  it('requires a session for protected routes', async () => {
    const response = await request(ctx.makeApp()).get('/audits').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects malformed JSON with a clear error', async () => {
    const response = await request(ctx.makeApp())
      .post('/auth/login')
      .set('Origin', WEB_ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
  });

  it('reports the database as up', async () => {
    await request(ctx.makeApp()).get('/health').expect(200, { ok: true, db: 'up' });
  });
});
