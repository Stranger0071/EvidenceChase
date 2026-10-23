import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectRetentionCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { contentDisposition } from '../lib/http';
import type { ObjectHead, PresignedPost, StoragePort } from '../ports/storage';

export interface S3StorageConfig {
  region: string;
  bucket: string;
  /** Custom endpoint for S3-compatible stores such as MinIO. Empty for AWS S3. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * AWS S3 (and S3-compatible) implementation of {@link StoragePort}. With a custom endpoint, the
 * client uses path-style addressing (http://host/bucket/key), which MinIO needs.
 */
export class S3StorageAdapter implements StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async presignPost(input: {
    key: string;
    contentType: string;
    minBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedPost> {
    // S3 itself enforces these conditions: a different key, content type or size is refused
    // before a single byte is stored.
    return createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: input.key,
      Expires: input.expiresInSeconds,
      Conditions: [
        ['eq', '$Content-Type', input.contentType],
        ['content-length-range', input.minBytes, input.maxBytes],
      ],
      Fields: { 'Content-Type': input.contentType },
    });
  }

  async presignGet(input: {
    key: string;
    filename: string;
    contentType: string;
    disposition: 'attachment' | 'inline';
    expiresInSeconds: number;
  }): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ResponseContentDisposition: contentDisposition(input.disposition, input.filename),
      ResponseContentType: input.contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: input.expiresInSeconds });
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: response.ContentLength ?? 0, contentType: response.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    // In Node.js the SDK returns the body as a Readable stream.
    return response.Body as Readable;
  }

  async getTags(key: string): Promise<Record<string, string>> {
    const response = await this.client.send(
      new GetObjectTaggingCommand({ Bucket: this.bucket, Key: key }),
    );
    return Object.fromEntries(
      (response.TagSet ?? []).flatMap((tag) =>
        tag.Key && tag.Value ? [[tag.Key, tag.Value]] : [],
      ),
    );
  }

  /** Server-side copy within the bucket: the bytes never pass through the API. */
  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey).replaceAll('%2F', '/')}`,
        Key: destinationKey,
      }),
    );
  }

  async putRetention(key: string, retainUntil: Date): Promise<void> {
    await this.client.send(
      new PutObjectRetentionCommand({
        Bucket: this.bucket,
        Key: key,
        Retention: { Mode: 'GOVERNANCE', RetainUntilDate: retainUntil },
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** HeadObject reports a missing key as "NotFound"; other calls use "NoSuchKey". */
function isNotFound(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotFound' || name === 'NoSuchKey';
}
