import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { inspectObject } from './inspectObject';

const streamOf = (...chunks: Buffer[]) => Readable.from(chunks);

describe('inspectObject', () => {
  it('hashes and measures the whole object across chunks', async () => {
    const parts = [Buffer.from('hello '), Buffer.from('world')];
    const result = await inspectObject(streamOf(...parts), { checkUtf8: false });

    expect(result.sizeBytes).toBe(11);
    expect(result.sha256).toBe(createHash('sha256').update('hello world').digest('hex'));
    expect(result.head.toString()).toBe('hello world');
    expect(result.validUtf8).toBeNull();
  });

  it('keeps only the first megabyte for type detection', async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 1);
    const result = await inspectObject(streamOf(big), { checkUtf8: false });

    expect(result.head.length).toBe(1024 * 1024);
    expect(result.sizeBytes).toBe(big.length);
  });

  it('accepts a multi-byte character split across two chunks', async () => {
    const euro = Buffer.from('€', 'utf8'); // 3 bytes
    const result = await inspectObject(streamOf(euro.subarray(0, 1), euro.subarray(1)), {
      checkUtf8: true,
    });
    expect(result.validUtf8).toBe(true);
  });

  it('flags bytes that are not UTF-8', async () => {
    const result = await inspectObject(streamOf(Buffer.from([0x61, 0xff, 0xfe])), {
      checkUtf8: true,
    });
    expect(result.validUtf8).toBe(false);
  });

  it('flags a file that ends in the middle of a character', async () => {
    const result = await inspectObject(streamOf(Buffer.from([0xe2, 0x82])), { checkUtf8: true });
    expect(result.validUtf8).toBe(false);
  });
});
