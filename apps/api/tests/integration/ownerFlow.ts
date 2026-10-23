import type { Express } from 'express';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import type { MemoryStorageAdapter } from '../../src/adapters/storage.memory';
import { signedInAgent, WEB_ORIGIN } from './helpers';

export interface UploadFile {
  name: string;
  type: string;
  data: Buffer;
}

/** A manager with one audit and one request, plus a magic link for that request. */
export async function setupRequest(app: Express, overrides: Record<string, unknown> = {}) {
  const { agent, email } = await signedInAgent(app);
  const audit = await agent
    .post('/audits')
    .set('Origin', WEB_ORIGIN)
    .send({ name: 'SOC 2 Type II', framework: 'SOC2' })
    .expect(201);
  const auditId: string = audit.body.audit.id;
  const created = await agent
    .post(`/audits/${auditId}/requests`)
    .set('Origin', WEB_ORIGIN)
    .send({
      controlRef: 'CC6.1',
      title: 'MFA enforcement screenshot',
      ownerName: 'Rahul',
      ownerEmail: 'rahul@example.com',
      dueDate: '2099-11-05',
      ...overrides,
    })
    .expect(201);
  const requestId: string = created.body.request.id;
  const token = await issueToken(agent, auditId, requestId);
  return { agent, managerEmail: email, auditId, requestId, token };
}

export async function issueToken(
  agent: TestAgent,
  auditId: string,
  requestId: string,
): Promise<string> {
  const link = await agent
    .post(`/audits/${auditId}/requests/${requestId}/link`)
    .set('Origin', WEB_ORIGIN)
    .expect(201);
  return tokenFromUrl(link.body.url);
}

export function tokenFromUrl(url: string): string {
  return url.split('/e/')[1]!;
}

/** Requests as the owner: the magic-link token goes in a header, with no cookie or origin. */
export function asOwner(app: Express, token: string) {
  return {
    portal: () => request(app).get('/e/request').set('X-Access-Token', token),
    prepare: (files: Array<{ name: string; size: number; type: string }>) =>
      request(app).post('/e/uploads').set('X-Access-Token', token).send({ files }),
    submit: (body: { fileIds: string[]; version: number; note?: string }) =>
      request(app).post('/e/submit').set('X-Access-Token', token).send(body),
  };
}

/**
 * The whole browser side of an upload: get upload links, "upload" each file (the in-memory store
 * stands in for S3's presigned POST), then submit. `upload: false` skips the upload step.
 */
export async function uploadAndSubmit(
  app: Express,
  storage: MemoryStorageAdapter,
  token: string,
  files: UploadFile[],
  options: { version?: number; upload?: boolean; note?: string } = {},
) {
  const owner = asOwner(app, token);
  const version = options.version ?? (await owner.portal().expect(200)).body.request.version;

  const prepared = await owner
    .prepare(files.map((file) => ({ name: file.name, size: file.data.length, type: file.type })))
    .expect(201);
  const uploads: Array<{ fileId: string; upload: { fields: Record<string, string> } }> =
    prepared.body.uploads;

  if (options.upload !== false) {
    uploads.forEach((item, index) => {
      storage.putObject(item.upload.fields.key!, files[index]!.data, files[index]!.type);
    });
  }

  const response = await owner.submit({
    fileIds: uploads.map((item) => item.fileId),
    version,
    ...(options.note && { note: options.note }),
  });
  return {
    response,
    fileIds: uploads.map((item) => item.fileId),
    keys: uploads.map((item) => item.upload.fields.key!),
  };
}

/** Waits for a background job (e.g. the 202 cron run) to reach the expected state. */
export async function eventually(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
