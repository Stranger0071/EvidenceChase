import JSZip from 'jszip';
import Papa from 'papaparse';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestContext, SAMPLE_FILES, signedInAgent, WEB_ORIGIN } from './helpers';
import { setupRequest, tokenFromUrl, uploadAndSubmit } from './ownerFlow';
import type { Express } from 'express';

const ctx = createTestContext();
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

const pdf = { name: 'MFA settings.pdf', type: 'application/pdf', data: SAMPLE_FILES.pdf };

/** An audit with one accepted request (CC6.1, with a PDF) and one submitted but not yet accepted. */
async function auditWithEvidence(app: Express = ctx.makeApp()) {
  const setup = await setupRequest(app);
  await uploadAndSubmit(app, ctx.storage, setup.token, [pdf]);
  await setup.agent
    .post(`/requests/${setup.requestId}/review`)
    .set('Origin', WEB_ORIGIN)
    .send({ action: 'ACCEPT', version: 1 })
    .expect(200);

  const second = await setup.agent
    .post(`/audits/${setup.auditId}/requests`)
    .set('Origin', WEB_ORIGIN)
    .send({
      controlRef: 'CC7.2',
      title: 'Incident log',
      ownerEmail: 'vikram@example.com',
      dueDate: '2099-11-05',
    })
    .expect(201);
  const link = await setup.agent
    .post(`/audits/${setup.auditId}/requests/${second.body.request.id}/link`)
    .set('Origin', WEB_ORIGIN)
    .expect(201);
  await uploadAndSubmit(app, ctx.storage, tokenFromUrl(link.body.url), [
    { name: 'incidents.csv', type: 'text/csv', data: SAMPLE_FILES.csv },
  ]);

  const exportLink = async (scope?: 'accepted' | 'all') => {
    const response = await setup.agent
      .post(`/audits/${setup.auditId}/export-link`)
      .set('Origin', WEB_ORIGIN)
      .send(scope ? { scope } : {})
      .expect(201);
    return new URL(response.body.url);
  };
  return { app, ...setup, exportLink };
}

/** Downloads a pack (the path of a signed link) and opens it. */
async function download(app: Express, url: URL) {
  const response = await request(app)
    .get(url.pathname + url.search)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  return response;
}

async function openPack(body: Buffer) {
  const zip = await JSZip.loadAsync(body);
  const csv = (await zip.file('index.csv')!.async('string')).replace(/^\uFEFF/, '');
  const index = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  }).data;
  return { zip, index, names: Object.keys(zip.files).sort() };
}

describe('evidence pack export', () => {
  it('builds a ZIP of accepted evidence with an index whose hashes check out', async () => {
    const { app, exportLink, managerEmail, requestId } = await auditWithEvidence();
    const url = await exportLink();
    expect(url.origin).toBe('http://api.test'); // straight to the API, not via the web proxy

    const response = await download(app, url);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="soc-2-type-ii-evidence-\d{4}-\d{2}-\d{2}\.zip"/,
    );

    const { zip, index, names } = await openPack(response.body);
    expect(names).toEqual([
      'CC6.1-mfa-enforcement-screenshot/MFA settings.pdf',
      'README.txt',
      'index.csv',
    ]);
    const bytes = await zip
      .file('CC6.1-mfa-enforcement-screenshot/MFA settings.pdf')!
      .async('nodebuffer');
    expect(bytes.equals(SAMPLE_FILES.pdf)).toBe(true);

    const file = await ctx.prisma.evidenceFile.findFirstOrThrow({ where: { requestId } });
    expect(index).toEqual([
      expect.objectContaining({
        control_ref: 'CC6.1',
        request_status: 'ACCEPTED',
        owner_email: 'rahul@example.com',
        accepted_by: managerEmail,
        path_in_zip: 'CC6.1-mfa-enforcement-screenshot/MFA settings.pdf',
        sha256_recorded_at_upload: file.sha256,
        sha256_in_this_export: file.sha256,
        integrity: 'OK',
        retained_until: file.retainUntil!.toISOString().slice(0, 10),
      }),
    ]);
  });

  it('includes evidence still in review, and requests with nothing yet, when asked for everything', async () => {
    const { app, agent, auditId, exportLink } = await auditWithEvidence();
    await agent
      .post(`/audits/${auditId}/requests`)
      .set('Origin', WEB_ORIGIN)
      .send({
        controlRef: 'A1.2',
        title: 'Backup restore test',
        ownerEmail: 'infra@example.com',
        dueDate: '2099-11-05',
      })
      .expect(201);

    const { names, index } = await openPack((await download(app, await exportLink('all'))).body);

    expect(names).toContain('CC7.2-incident-log/incidents.csv');
    expect(index.map((row) => [row.control_ref, row.request_status, row.integrity])).toEqual([
      ['A1.2', 'PENDING', 'NO_FILES'],
      ['CC6.1', 'ACCEPTED', 'OK'],
      ['CC7.2', 'SUBMITTED', 'OK'],
    ]);
  });

  it('flags a file that changed in storage since it was uploaded', async () => {
    const { app, exportLink, requestId } = await auditWithEvidence();
    const file = await ctx.prisma.evidenceFile.findFirstOrThrow({ where: { requestId } });
    ctx.storage.putObject(file.storageKey, Buffer.from('%PDF-1.4 tampered'));

    const { index } = await openPack((await download(app, await exportLink())).body);

    expect(index[0]).toMatchObject({
      integrity: 'MISMATCH',
      sha256_recorded_at_upload: file.sha256,
    });
    expect(index[0]!.sha256_in_this_export).not.toBe(file.sha256);
  });

  it('still delivers the pack when a file is missing, and says so', async () => {
    const { app, exportLink, requestId } = await auditWithEvidence();
    const file = await ctx.prisma.evidenceFile.findFirstOrThrow({ where: { requestId } });
    ctx.storage.objects.delete(file.storageKey);

    const response = await download(app, await exportLink());
    expect(response.status).toBe(200);
    const { names, index } = await openPack(response.body);
    expect(names).toEqual(['README.txt', 'index.csv']);
    expect(index[0]).toMatchObject({ integrity: 'MISSING', path_in_zip: '' });
  });

  it('defuses spreadsheet formulas typed into titles', async () => {
    const app = ctx.makeApp();
    const setup = await setupRequest(app, { title: '=HYPERLINK("https://evil.example","click")' });
    await uploadAndSubmit(app, ctx.storage, setup.token, [pdf]);
    await setup.agent
      .post(`/requests/${setup.requestId}/review`)
      .set('Origin', WEB_ORIGIN)
      .send({ action: 'ACCEPT', version: 1 })
      .expect(200);
    const link = await setup.agent
      .post(`/audits/${setup.auditId}/export-link`)
      .set('Origin', WEB_ORIGIN)
      .send({})
      .expect(201);

    const { index } = await openPack((await download(app, new URL(link.body.url))).body);
    expect(index[0]!.title).toBe(`'=HYPERLINK("https://evil.example","click")`);
  });
});

describe('export links', () => {
  it('expire after 60 seconds', async () => {
    let now = new Date();
    const app = ctx.makeApp({ clock: () => now });
    const { exportLink } = await auditWithEvidence(app);
    const url = await exportLink();

    now = new Date(now.getTime() + 61_000);
    const response = await download(app, url);
    expect(response.status).toBe(410);
    expect(JSON.parse(response.body.toString()).error.code).toBe('LINK_EXPIRED');
  });

  it('stop working if any part is changed', async () => {
    const { app, exportLink } = await auditWithEvidence();
    const other = await setupRequest(app);
    const url = await exportLink();

    const widened = new URL(url);
    widened.searchParams.set('scope', 'all');
    expect((await download(app, widened)).status).toBe(403);

    const elsewhere = new URL(url);
    elsewhere.pathname = `/exports/${other.auditId}`;
    expect((await download(app, elsewhere)).status).toBe(403);

    const unsigned = new URL(url);
    unsigned.searchParams.delete('sig');
    expect((await download(app, unsigned)).status).toBe(403);
  });

  it("can only be created by the audit's own manager", async () => {
    const { app, auditId } = await auditWithEvidence();
    const { agent: other } = await signedInAgent(app, 'Bob');

    await other
      .post(`/audits/${auditId}/export-link`)
      .set('Origin', WEB_ORIGIN)
      .send({})
      .expect(404);
    await request(app)
      .post(`/audits/${auditId}/export-link`)
      .set('Origin', WEB_ORIGIN)
      .send({})
      .expect(401);
  });

  it('are switched off without a signing secret', async () => {
    const noSecret = createTestContext({ EXPORT_SIGNING_SECRET: undefined });
    try {
      const app = noSecret.makeApp();
      const { agent, auditId } = await setupRequest(app);
      const response = await agent
        .post(`/audits/${auditId}/export-link`)
        .set('Origin', WEB_ORIGIN)
        .send({})
        .expect(503);
      expect(response.body.error.code).toBe('EXPORT_DISABLED');
    } finally {
      await noSecret.close();
    }
  });
});
