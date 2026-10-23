import type { Readable } from 'node:stream';

/**
 * Object storage for evidence files (PRD §8.4). Implemented by the S3 adapter in Phase 3, and by
 * an in-memory fake in tests. Services depend on this interface, never on the AWS SDK directly.
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
  /** Upload link whose policy pins the exact key, content type and maximum size. */
  presignPost(input: {
    key: string;
    contentType: string;
    maxBytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedPost>;
  /** Short-lived download link that forces the browser to save the file. */
  presignGet(input: {
    key: string;
    downloadName: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string>;
  head(key: string): Promise<ObjectHead | null>;
  getRange(key: string, start: number, end: number): Promise<Uint8Array>;
  getStream(key: string): Promise<Readable>;
  getTags(key: string): Promise<Record<string, string>>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  putRetention(key: string, retainUntil: Date): Promise<void>;
  delete(key: string): Promise<void>;
}
