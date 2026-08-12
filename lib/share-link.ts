/**
 * Share links: the entire comparison, encoded into the URL.
 *
 * There is no database and no server-side state (PROJECT.md D7). A link carries
 * everything needed to reproduce a result, which is what makes links free,
 * permanent, and private — nobody's salary is ever stored anywhere.
 *
 * WHY THE DATASET VERSION IS IN THE PAYLOAD
 *
 * If a link carried only the inputs, refreshing the dataset would silently
 * change every previously shared link. Someone opening your link next year
 * would see different numbers than you saw, with no indication anything had
 * moved. Pinning the version means a link recomputes against the data it was
 * created with — the same inputs, the same tables, the same answer, forever.
 *
 * ENCODING
 *
 * A compact binary format rather than JSON, because a JSON payload for this
 * would run to several hundred characters and wrap in emails. Values are
 * varints, then base64url. A typical renting comparison lands around 40
 * characters; owning on both sides, around 60.
 *
 * The format carries its own version byte, so an old link can always be
 * recognised — and rejected honestly rather than mis-decoded — if the layout
 * ever changes.
 */

import type { FilingStatus, Housing } from '@/engine';

export const SHARE_FORMAT_VERSION = 1;

/**
 * Anything beyond this is not a version we ever shipped, so a payload claiming
 * one is simply corrupt. Keeps a garbled link from producing a baffling
 * "made by version 223794433" message.
 */
const MAX_PLAUSIBLE_FORMAT = 32;

/**
 * Stable state ordering for "rest of <state>" locations.
 * APPEND ONLY. Reordering this would silently repoint every existing link.
 */
const STATE_ORDER = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

/** Likewise append-only: the index IS the wire value. */
const FILING_ORDER: FilingStatus[] = [
  'single',
  'marriedJointly',
  'marriedSeparately',
  'headOfHousehold',
];

/** Local jurisdictions that can be opted into, as a bitmask. Append only. */
const OPT_IN_ORDER = ['nyc', 'yonkers'] as const;

export interface SharedCity {
  metroId: string;
  grossSalary: number;
  housing: Housing;
  cars: number;
  localOptIns: Record<string, boolean>;
}

export interface SharedComparison {
  datasetVersion: string;
  filingStatus: FilingStatus;
  children: number;
  origin: SharedCity;
  destination: SharedCity;
}

// ---------------------------------------------------------------------------
// Varint primitives
// ---------------------------------------------------------------------------

class Writer {
  private bytes: number[] = [];

  uint(value: number): void {
    let v = Math.max(0, Math.round(value));
    while (v >= 0x80) {
      this.bytes.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    this.bytes.push(v);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private index = 0;

  constructor(private readonly bytes: Uint8Array) {}

  uint(): number {
    let result = 0;
    let shift = 1;
    for (;;) {
      if (this.index >= this.bytes.length) throw new Error('share link is truncated');
      const byte = this.bytes[this.index++];
      result += (byte & 0x7f) * shift;
      if ((byte & 0x80) === 0) return result;
      shift *= 128;
      if (shift > 2 ** 53) throw new Error('share link contains an oversized number');
    }
  }

  get done(): boolean {
    return this.index >= this.bytes.length;
  }
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

/** Rates travel as basis points, so 6.8% is 680 — exact, and two bytes. */
const toBps = (rate: number) => Math.round(rate * 10_000);
const fromBps = (bps: number) => bps / 10_000;

function writeMetro(w: Writer, metroId: string): void {
  if (/^\d+$/.test(metroId)) {
    w.uint(0);
    w.uint(Number(metroId));
    return;
  }
  const match = /^rest-of-([A-Z]{2})$/.exec(metroId);
  const index = match ? STATE_ORDER.indexOf(match[1] as (typeof STATE_ORDER)[number]) : -1;
  if (index < 0) throw new Error(`cannot encode location id: ${metroId}`);
  w.uint(1);
  w.uint(index);
}

function readMetro(r: Reader): string {
  const tag = r.uint();
  if (tag === 0) return String(r.uint()).padStart(5, '0');
  if (tag === 1) {
    const state = STATE_ORDER[r.uint()];
    if (!state) throw new Error('share link names an unknown state');
    return `rest-of-${state}`;
  }
  throw new Error('share link uses an unknown location format');
}

function writeOptIns(w: Writer, optIns: Record<string, boolean>): void {
  let mask = 0;
  OPT_IN_ORDER.forEach((id, i) => {
    if (optIns[id]) mask |= 1 << i;
  });
  w.uint(mask);
}

function readOptIns(r: Reader): Record<string, boolean> {
  const mask = r.uint();
  return Object.fromEntries(OPT_IN_ORDER.map((id, i) => [id, Boolean(mask & (1 << i))]));
}

function writeCity(w: Writer, city: SharedCity): void {
  writeMetro(w, city.metroId);
  w.uint(city.grossSalary);
  w.uint(city.cars);
  writeOptIns(w, city.localOptIns);

  if (city.housing.tenure === 'rent') {
    w.uint(0);
    w.uint(city.housing.monthlyRent);
  } else {
    w.uint(1);
    w.uint(city.housing.homePrice);
    w.uint(toBps(city.housing.downPayment));
    w.uint(toBps(city.housing.mortgageRate));
    w.uint(toBps(city.housing.propertyTaxRate));
  }
}

function readCity(r: Reader): SharedCity {
  const metroId = readMetro(r);
  const grossSalary = r.uint();
  const cars = r.uint();
  const localOptIns = readOptIns(r);

  const tenure = r.uint();
  let housing: Housing;
  if (tenure === 0) {
    housing = { tenure: 'rent', monthlyRent: r.uint() };
  } else if (tenure === 1) {
    housing = {
      tenure: 'own',
      homePrice: r.uint(),
      downPayment: fromBps(r.uint()),
      mortgageRate: fromBps(r.uint()),
      propertyTaxRate: fromBps(r.uint()),
    };
  } else {
    throw new Error('share link uses an unknown housing type');
  }

  return { metroId, grossSalary, cars, localOptIns, housing };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Dataset versions look like "2026.1". */
function parseDatasetVersion(version: string): [number, number] {
  const match = /^(\d{4})\.(\d+)$/.exec(version);
  if (!match) throw new Error(`unexpected dataset version: ${version}`);
  return [Number(match[1]), Number(match[2])];
}

export function encodeComparison(input: SharedComparison): string {
  const [year, minor] = parseDatasetVersion(input.datasetVersion);
  const filing = FILING_ORDER.indexOf(input.filingStatus);
  if (filing < 0) throw new Error(`cannot encode filing status: ${input.filingStatus}`);

  const w = new Writer();
  w.uint(SHARE_FORMAT_VERSION);
  w.uint(year);
  w.uint(minor);
  w.uint(filing);
  w.uint(input.children);
  writeCity(w, input.origin);
  writeCity(w, input.destination);

  return toBase64Url(w.toBytes());
}

/**
 * Decode a share link.
 *
 * Throws with a plain-language message on anything malformed. A link that
 * cannot be trusted must fail loudly — quietly falling back to defaults would
 * show someone a confident answer to a question they never asked.
 */
export function decodeComparison(payload: string): SharedComparison {
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new Error('share link is not valid');

  const r = new Reader(fromBase64Url(payload));

  const format = r.uint();
  // A plausible format number means a genuine link from another version of the
  // site. An absurd one means the payload is not one of ours at all — say so,
  // rather than blaming a version that never existed.
  if (format < 1 || format > MAX_PLAUSIBLE_FORMAT) {
    throw new Error('share link is not valid');
  }
  if (format !== SHARE_FORMAT_VERSION) {
    throw new Error(
      `share link was made by version ${format} of this site, which this page cannot read`,
    );
  }

  const year = r.uint();
  const minor = r.uint();
  const filingStatus = FILING_ORDER[r.uint()];
  if (!filingStatus) throw new Error('share link names an unknown filing status');

  const children = r.uint();
  const origin = readCity(r);
  const destination = readCity(r);

  if (!r.done) throw new Error('share link has unexpected trailing data');

  return {
    datasetVersion: `${year}.${minor}`,
    filingStatus,
    children,
    origin,
    destination,
  };
}

/** The path a comparison lives at. */
export function sharePath(input: SharedComparison): string {
  return `/r/${encodeComparison(input)}`;
}
