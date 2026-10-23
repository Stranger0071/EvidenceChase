/**
 * Creates the local development bucket the way production's is configured (infra/aws/): Object
 * Lock on (which turns on versioning), CORS for the web app, and the quarantine lifecycle rule.
 * Safe to run more than once.
 *
 *   docker compose up -d s3 && pnpm storage:setup
 */
import {
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env';

const env = loadEnv();
if (!env.S3_ENDPOINT || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
  throw new Error(
    'This script is for the local S3 server: set S3_ENDPOINT and the access keys in .env',
  );
}

const client = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});
const Bucket = env.S3_BUCKET;

try {
  await client.send(new CreateBucketCommand({ Bucket, ObjectLockEnabledForBucket: true }));
  console.log(`Created bucket ${Bucket} with Object Lock`);
} catch (error) {
  if (
    !(error instanceof BucketAlreadyOwnedByYou) &&
    (error as Error).name !== 'BucketAlreadyExists'
  )
    throw error;
  console.log(`Bucket ${Bucket} already exists`);
}

await client.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: [env.WEB_ORIGIN],
          AllowedMethods: ['POST', 'GET'],
          AllowedHeaders: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    },
  }),
);
console.log(`CORS: browser uploads allowed from ${env.WEB_ORIGIN}`);

const lifecycle = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../infra/aws/lifecycle.json', import.meta.url)),
    'utf8',
  ),
);
try {
  await client.send(
    new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: lifecycle }),
  );
  console.log('Lifecycle: quarantine/ is cleaned up after 1 day');
} catch (error) {
  // Not essential locally: the scan-check job also rejects abandoned uploads.
  console.warn(`Lifecycle rule not applied (${(error as Error).name}); continuing`);
}
