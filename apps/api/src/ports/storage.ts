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
  getStream(key: string): Promise<Readable>;
  getTags(key: string): Promise<Record<string, string>>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  /** S3 Object Lock retention (GOVERNANCE mode): the object can't be deleted before this date. */
  putRetention(key: string, retainUntil: Date): Promise<void>;
  delete(key: string): Promise<void>;
}
