import { Readable } from 'node:stream';
import type { ObjectHead, PresignedPost, StoragePort } from '../ports/storage';

interface StoredObject {
  data: Buffer;
  contentType: string;
  tags: Record<string, string>;
  retainUntil?: Date;
}

/**
 * In-memory {@link StoragePort} for tests. Uploads don't go through it (there's no S3 endpoint),
 * so tests call `putObject` to play the browser's part, and `setTags` to play GuardDuty's.
 */
export class MemoryStorageAdapter implements StoragePort {
  readonly objects = new Map<string, StoredObject>();
  /** Keys whose next copy should fail, to test that promotion can be retried. */
  readonly failNextCopy = new Set<string>();

  async presignPost(input: { key: string; contentType: string }): Promise<PresignedPost> {
    return {
      url: 'https://storage.test/upload',
      fields: { key: input.key, 'Content-Type': input.contentType },
    };
  }

  async presignGet(input: { key: string; disposition: string }): Promise<string> {
    return `https://storage.test/${input.key}?disposition=${input.disposition}`;
  }

  async head(key: string): Promise<ObjectHead | null> {
    const object = this.objects.get(key);
    return object ? { sizeBytes: object.data.length, contentType: object.contentType } : null;
  }

  async getStream(key: string): Promise<Readable> {
    return Readable.from([this.require(key).data]);
  }

  async getTags(key: string): Promise<Record<string, string>> {
    return { ...this.require(key).tags };
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    if (this.failNextCopy.delete(sourceKey))
      throw new Error(`Simulated copy failure: ${sourceKey}`);
    const source = this.require(sourceKey);
    this.objects.set(destinationKey, { ...source, tags: { ...source.tags } });
  }

  async putRetention(key: string, retainUntil: Date): Promise<void> {
    this.require(key).retainUntil = retainUntil;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  putObject(key: string, data: Buffer, contentType = 'application/octet-stream'): void {
    this.objects.set(key, { data, contentType, tags: {} });
  }

  setTags(key: string, tags: Record<string, string>): void {
    this.require(key).tags = tags;
  }

  private require(key: string): StoredObject {
    const object = this.objects.get(key);
    if (!object) throw Object.assign(new Error(`No such key: ${key}`), { name: 'NoSuchKey' });
    return object;
  }
}
