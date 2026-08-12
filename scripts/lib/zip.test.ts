import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain JS module, deliberately dependency-free
import { extractFromZip, readCentralDirectory } from './zip.mjs';

/**
 * Builds a minimal but real zip archive in memory, so the reader is tested
 * against the actual format rather than a fixture that might drift.
 */
function makeZip(entries: Array<{ name: string; content: Buffer; store?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const method = entry.store ? 0 : 8;
    const data = entry.store ? entry.content : deflateRawSync(entry.content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([Buffer.concat(locals), centralBuffer, end]);
}

const CSV = Buffer.from('GeoFIPS,GeoName,LineCode\n"10180","Abilene, TX",1\n'.repeat(40), 'utf8');

describe('zip reader', () => {
  it('lists every entry', () => {
    const zip = makeZip([
      { name: 'MARPP_MSA_2008_2024.csv', content: CSV },
      { name: 'MARPP__definition.xml', content: Buffer.from('<xml/>') },
    ]);
    expect(readCentralDirectory(zip).map((e: { name: string }) => e.name)).toEqual([
      'MARPP_MSA_2008_2024.csv',
      'MARPP__definition.xml',
    ]);
  });

  it('extracts a deflated entry byte for byte', () => {
    const zip = makeZip([{ name: 'data.csv', content: CSV }]);
    expect(extractFromZip(zip, (n: string) => n.endsWith('.csv')).equals(CSV)).toBe(true);
  });

  it('extracts a stored (uncompressed) entry', () => {
    const zip = makeZip([{ name: 'plain.txt', content: Buffer.from('hello'), store: true }]);
    expect(extractFromZip(zip, () => true).toString()).toBe('hello');
  });

  it('picks the right entry out of several', () => {
    const zip = makeZip([
      { name: 'SARPP__definition.xml', content: Buffer.from('<xml/>') },
      { name: 'SARPP_STATE_2008_2024.csv', content: CSV },
      { name: 'SARPP__Footnotes.html', content: Buffer.from('<html/>') },
    ]);
    const found = extractFromZip(zip, (n: string) => /^SARPP_STATE_.*\.csv$/.test(n));
    expect(found.equals(CSV)).toBe(true);
  });

  it('names the available entries when nothing matches', () => {
    const zip = makeZip([{ name: 'a.csv', content: CSV }]);
    expect(() => extractFromZip(zip, (n: string) => n === 'missing.csv')).toThrow(/a\.csv/);
  });

  it('rejects something that is not a zip', () => {
    expect(() => extractFromZip(Buffer.from('not a zip at all'), () => true)).toThrow(/not a zip/);
  });
});
