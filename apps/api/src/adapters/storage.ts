import type { Env } from '../config/env';
import type { StoragePort } from '../ports/storage';
import { S3StorageAdapter } from './storage.s3';

/**
 * Builds the real storage adapter from configuration. There is deliberately no silent in-memory
 * fallback: losing uploaded evidence because a variable was missing is far worse than failing to
 * start. Tests inject `MemoryStorageAdapter` instead.
 */
export function createStorage(env: Env): StoragePort {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      'Storage is not configured: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (MinIO locally, see .env.example)',
    );
  }
  return new S3StorageAdapter({
    region: env.AWS_REGION,
    bucket: env.S3_BUCKET,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  });
}
