import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

/** Enough of the start of a file for `file-type`, including Office (ZIP-based) formats. */
const HEAD_BYTES = 1024 * 1024;

export interface ObjectInspection {
  sizeBytes: number;
  /** Hex SHA-256 of the whole object, computed here, never taken from the browser. */
  sha256: string;
  /** The first bytes of the object, for magic-byte detection. */
  head: Buffer;
  /** Whether the whole object is valid UTF-8 (only computed when asked for). */
  validUtf8: boolean | null;
}

/**
 * Reads an uploaded object once, as a stream: it hashes every byte, keeps the first 1 MB for type
 * detection, and optionally checks the whole file is valid UTF-8. Memory use stays at about 1 MB
 * however large the file is, which matters on a 512 MB instance.
 */
export async function inspectObject(
  stream: Readable,
  options: { checkUtf8: boolean },
): Promise<ObjectInspection> {
  const hash = createHash('sha256');
  const headChunks: Buffer[] = [];
  let headLength = 0;
  let sizeBytes = 0;
  const decoder = options.checkUtf8 ? new TextDecoder('utf-8', { fatal: true }) : null;
  let validUtf8: boolean | null = options.checkUtf8 ? true : null;

  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    hash.update(bytes);
    sizeBytes += bytes.length;

    if (headLength < HEAD_BYTES) {
      const slice = bytes.subarray(0, HEAD_BYTES - headLength);
      headChunks.push(slice);
      headLength += slice.length;
    }

    if (decoder && validUtf8) {
      try {
        // `stream: true` lets a multi-byte character span two chunks.
        decoder.decode(bytes, { stream: true });
      } catch {
        validUtf8 = false;
      }
    }
  }

  if (decoder && validUtf8) {
    try {
      decoder.decode();
    } catch {
      validUtf8 = false;
    }
  }

  return { sizeBytes, sha256: hash.digest('hex'), head: Buffer.concat(headChunks), validUtf8 };
}
