import { ImageResponse } from 'next/og';

import { formatUSD, formatPercent, metro, percentIsMeaningful } from '@/engine';
import { decodeComparison } from '@/lib/share-link';
import { comparisonFromShared } from '@/lib/shared-comparison';
import { SITE_NAME, TAGLINE } from '@/lib/site';

export const runtime = 'nodejs';

/** Standard Open Graph dimensions — what iMessage, Slack and Twitter expect. */
const WIDTH = 1200;
const HEIGHT = 630;

/**
 * The share card, rendered server-side as a PNG.
 *
 * Deliberately ONE definition rather than two: this same image is used for the
 * link preview in messaging apps AND fetched by the "Save image" button. If the
 * card were drawn separately on a canvas for downloads, the two would drift
 * apart the first time either changed.
 */
const INK = '#171a21';
const MUTED = '#656d7e';
const RULE = '#e1e5ec';
const GROUND = '#ffffff';
const GOOD = '#0f7a4d';
const BAD = '#b4241c';

export async function GET(_request: Request, { params }: { params: Promise<{ payload: string }> }) {
  const { payload } = await params;

  let card: {
    from: string; to: string; delta: number; pct: number | null; monthly: number;
    rows: Array<{ label: string; delta: number }>; version: string;
  };

  try {
    const result = comparisonFromShared(decodeComparison(payload));
    card = {
      from: metro(result.origin.metroId).shortName,
      to: metro(result.destination.metroId).shortName,
      delta: result.delta,
      // Null when the origin city has no leftover money to measure against —
      // dividing by it produces figures like "589.9% more spare cash".
      pct: percentIsMeaningful(result) ? result.deltaPct : null,
      monthly: result.deltaMonthly,
      rows: result.breakdown.slice(0, 4).map((r) => ({ label: r.label, delta: r.delta })),
      version: result.datasetVersion,
    };
  } catch {
    // An unreadable link still needs a preview image, or the link renders as a
    // broken thumbnail in the messaging app.
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: GROUND, color: INK,
            fontSize: 44, fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex' }}>{SITE_NAME}</div>
          <div style={{ display: 'flex', fontSize: 26, color: MUTED, marginTop: 12 }}>
            {TAGLINE}
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  }

  const better = card.delta >= 0;
  const accent = better ? GOOD : BAD;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: GROUND, color: INK, padding: '48px 60px 44px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Route. Satori needs an explicit display on any node with more than
            one child, so every multi-part line here is either a flex row or a
            single pre-composed string. */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 600 }}>
          <div style={{ display: 'flex' }}>{card.from}</div>
          <div style={{ display: 'flex', color: MUTED, padding: '0 18px' }}>→</div>
          <div style={{ display: 'flex' }}>{card.to}</div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
          <div style={{ fontSize: 22, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
            {better ? 'More in your pocket' : 'Less in your pocket'}
          </div>
          <div style={{ fontSize: 112, fontWeight: 800, color: accent, lineHeight: 1, marginTop: 4 }}>
            {formatUSD(Math.abs(card.delta))}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: INK, marginTop: 10 }}>
            {`a year ${better ? 'better off' : 'worse off'} · ${formatUSD(Math.abs(card.monthly))} a month` +
              (card.pct === null
                ? ''
                : ` · ${formatPercent(Math.abs(card.pct))} ${better ? 'more' : 'less'} spare cash`)}
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', paddingTop: 24, gap: 6 }}>
          {card.rows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 24,
                borderTop: `1px solid ${RULE}`, paddingTop: 8, paddingBottom: 2,
              }}
            >
              <div style={{ display: 'flex', color: MUTED }}>{row.label}</div>
              <div style={{ display: 'flex', color: row.delta >= 0 ? GOOD : BAD, fontWeight: 700 }}>
                {formatUSD(row.delta, { signed: true })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 20, color: MUTED,
            borderTop: `2px solid ${RULE}`, marginTop: 22, paddingTop: 14,
          }}
        >
          <div style={{ display: 'flex', fontWeight: 700, letterSpacing: 3 }}>
            {SITE_NAME.toUpperCase()}
          </div>
          <div style={{ display: 'flex' }}>{`public federal data · ${card.version}`}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
