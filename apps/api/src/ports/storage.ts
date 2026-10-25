import type { Readable } from 'node:stream';

/**
 * Object storage for evidence files (PRD §8.4). Implemented by the S3 adapter (AWS S3 in
 * production, MinIO locally) and an in-memory fake in tests. Services depend on this interface,
 * never on the AWS SDK directly.
 */
export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
}

export interface ObjectHead {
  sizeBytes: number;
  contentType: string | null;
  /** Changes whenever the object's bytes do, so reads and copies can be pinned to one version. */
  etag: string | null;
}

/** Only act on the object if it still has this ETag; otherwise fail with {@link isPreconditionFailed}. */
export interface IfMatch {
  ifMatch?: string;
}

/** True for the error S3 (and the fake) raise when an `ifMatch` condition no longer holds. */
export function isPreconditionFailed(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'PreconditionFailed';
}

export interface StoragePort {
  /** Upload link whose policy pins the exact key, content type and size. */
  presignPost(input: {
    key: string;
    contentType: string;
    minBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedPost>;
  /** Short-lived download link. `attachment` makes the browser save the file instead of opening it. */
  presignGet(input: {
    key: string;
    filename: string;
    contentType: string;
    disposition: 'attachment' | 'inline';
    expiresInSeconds: number;
  }): Promise<string>;
  /** Object metadata, or null when the key doesn't exist. */
  head(key: string): Promise<ObjectHead | null>;
  getStream(key: string, options?: IfMatch): Promise<Readable>;
  getTags(key: string): Promise<Record<string, string>>;
  copy(sourceKey: string, destinationKey: string, options?: IfMatch): Promise<void>;
  /** S3 Object Lock retention (GOVERNANCE mode): the object can't be deleted before this date. */
  putRetention(key: string, retainUntil: Date): Promise<void>;
  delete(key: string): Promise<void>;
}
