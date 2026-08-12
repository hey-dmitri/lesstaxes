/**
 * A minimal ZIP reader.
 *
 * BEA publishes its price parity tables only as .zip archives. Node has no
 * built-in zip support, but it does have raw inflate — and a ZIP file is
 * little more than a sequence of headers around deflate streams. Sixty lines
 * here avoids adding a dependency to a project whose whole premise is that it
 * costs nothing to run and has nothing to keep updated.
 *
 * Handles the two storage methods that matter: stored (0) and deflate (8).
 */

import { inflateRawSync } from 'node:zlib';

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIRECTORY = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/**
 * List the entries in a zip archive.
 * @param {Buffer} buffer
 * @returns {Array<{ name: string, offset: number, compressedSize: number, uncompressedSize: number, method: number }>}
 */
function readCentralDirectory(buffer) {
  // The end-of-central-directory record lives at the tail, after an optional
  // comment, so scan backwards for its signature.
  let end = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive: no end-of-central-directory record');

  const entryCount = buffer.readUInt16LE(end + 10);
  let pointer = buffer.readUInt32LE(end + 16);
  const entries = [];

  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(pointer) !== CENTRAL_DIRECTORY) {
      throw new Error(`corrupt zip: bad central directory entry ${i}`);
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const uncompressedSize = buffer.readUInt32LE(pointer + 24);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const offset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);

    entries.push({ name, offset, compressedSize, uncompressedSize, method });
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Extract one named entry from a zip archive.
 * @param {Buffer} buffer
 * @param {(name: string) => boolean} matches
 * @returns {Buffer}
 */
export function extractFromZip(buffer, matches) {
  const entries = readCentralDirectory(buffer);
  const entry = entries.find((e) => matches(e.name));
  if (!entry) {
    throw new Error(
      `no matching entry in zip. Available: ${entries.map((e) => e.name).join(', ')}`,
    );
  }

  if (buffer.readUInt32LE(entry.offset) !== LOCAL_FILE_HEADER) {
    throw new Error(`corrupt zip: bad local header for ${entry.name}`);
  }
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return Buffer.from(compressed);
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`unsupported zip compression method ${entry.method} for ${entry.name}`);
}

export { readCentralDirectory };
