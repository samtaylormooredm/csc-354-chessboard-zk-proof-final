/**
 * Streaming decompression of a multi-frame .zst file.
 *
 * The Lichess dumps are written by pzstd: many independent zstd frames, each preceded by a
 * small "skippable" frame. Node's zlib.createZstdDecompress() stops after the first frame,
 * so this walks the frame/block structure (RFC 8878) to find frame boundaries and feeds each
 * frame to its own decompressor. Only one block (<= 128 KB) is buffered at a time.
 */
import { once } from "node:events";
import { PassThrough, type Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { createZstdDecompress } from "node:zlib";

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MAGIC = 0x184d2a50; // low 4 bits vary

class ByteReader {
  private buf: Buffer = Buffer.alloc(0);
  private readonly it: AsyncIterator<Buffer>;
  constructor(source: AsyncIterable<Buffer>) {
    this.it = source[Symbol.asyncIterator]();
  }
  /** Reads exactly n bytes. Returns null only on a clean EOF before the first byte. */
  async read(n: number): Promise<Buffer | null> {
    while (this.buf.length < n) {
      const next = await this.it.next();
      if (next.done) {
        if (this.buf.length === 0) return null;
        throw new Error("zstd: unexpected end of file");
      }
      this.buf = this.buf.length === 0 ? next.value : Buffer.concat([this.buf, next.value]);
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }
  async need(n: number): Promise<Buffer> {
    const out = await this.read(n);
    if (!out) throw new Error("zstd: unexpected end of file");
    return out;
  }
}

async function pump(source: AsyncIterable<Buffer>, out: PassThrough): Promise<void> {
  const reader = new ByteReader(source);
  for (;;) {
    const magicBytes = await reader.read(4);
    if (!magicBytes) break;
    const magic = magicBytes.readUInt32LE(0);

    if ((magic & 0xfffffff0) >>> 0 === SKIPPABLE_MAGIC) {
      const size = (await reader.need(4)).readUInt32LE(0);
      if (size > 0) await reader.need(size);
      continue;
    }
    if (magic !== ZSTD_MAGIC) throw new Error(`zstd: bad frame magic 0x${magic.toString(16)}`);

    const frame = createZstdDecompress();
    const frameDone = finished(frame);
    frameDone.catch(() => {}); // surfaced below via the awaits
    frame.pipe(out, { end: false });
    const write = async (chunk: Buffer): Promise<void> => {
      if (!frame.write(chunk)) await Promise.race([once(frame, "drain"), frameDone]);
    };

    // Frame header: descriptor, optional window byte, dictionary id, content size.
    const descriptor = (await reader.need(1))[0]!;
    const singleSegment = (descriptor & 0x20) !== 0;
    const hasChecksum = (descriptor & 0x04) !== 0;
    const dictIdBytes = [0, 1, 2, 4][descriptor & 0x03]!;
    const fcsFlag = descriptor >> 6;
    const fcsBytes = fcsFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][fcsFlag]!;
    const restOfHeader = await reader.need((singleSegment ? 0 : 1) + dictIdBytes + fcsBytes);
    await write(Buffer.concat([magicBytes, Buffer.from([descriptor]), restOfHeader]));

    // Blocks: 3-byte header = last(1 bit) | type(2 bits) | size(21 bits).
    for (;;) {
      const header = await reader.need(3);
      const h = header.readUIntLE(0, 3);
      const last = (h & 1) === 1;
      const type = (h >> 1) & 3;
      const size = h >> 3;
      if (type === 3) throw new Error("zstd: reserved block type");
      const body = await reader.need(type === 1 ? 1 : size); // type 1 = RLE: one byte
      await write(Buffer.concat([header, body]));
      if (last) break;
    }
    if (hasChecksum) await write(await reader.need(4));

    frame.end();
    await frameDone;
  }
  out.end();
}

/** Returns a stream of the decompressed bytes of every frame in `source`, in order. */
export function decompressZstdFrames(source: AsyncIterable<Buffer>): Readable {
  const out = new PassThrough();
  pump(source, out).catch((err: unknown) => out.destroy(err instanceof Error ? err : new Error(String(err))));
  return out;
}
