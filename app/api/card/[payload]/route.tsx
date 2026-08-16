import { ImageResponse } from 'next/og';

import {
  breakEvenNarrative,
  formatUSD,
  formatPercent,
  metro,
  percentIsMeaningful,
  verdict,
  changeInWords,
} from '@/engine';
import { salaryWording } from '@/lib/salary-wording';
import { decodeComparison } from '@/lib/share-link';
import { comparisonFromShared, describeHousehold } from '@/lib/shared-comparison';
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
 *
 * IT CARRIES THE WHOLE CALCULATION, NOT JUST THE ANSWER
 *
 * A share link reproduces everything — both salaries, the household, the
 * tenure, every line of the breakdown. The card used to show a headline, four
 * of the breakdown rows and nothing else, so the two halves of sharing said
 * different things: the link was a full working, the picture was a slogan.
 * Worse, "$8,967 a year better off" with no salary attached reads as a fact
 * about the two cities rather than about one household in them, and the person
 * it reaches cannot tell which. Everything the reader needs to judge whether
 * the number applies to them is on the card: what went in on the left, what
 * came out on the right.
 */
const INK = '#171a21';
const MUTED = '#656d7e';
const FAINT = '#8f97a6';
const RULE = '#e1e5ec';
const RULE_STRONG = '#c3c9d4';
const GROUND = '#ffffff';
const GOOD = '#0f7a4d';
const BAD = '#b4241c';

interface CardCity {
  name: string;
  salary: number;
  takeHome: number;
  leftover: number;
}

interface CardGroup {
  label: string;
  total: number;
  rows: Array<{ label: string; delta: number; kind: 'cost' | 'pay' }>;
  /** How to word the group's own total. See changeInWords. */
  kind: 'cost' | 'mixed';
}

export async function GET(_request: Request, { params }: { params: Promise<{ payload: string }> }) {
  const { payload } = await params;

  let card: {
    household: string;
    /*
     * "Salary" or "Both salaries". The card is the version of this that travels
     * without the form beside it, so a figure covering two incomes has to say
     * so here or a reader holds it against their own single wage.
     */
    salaryLabel: string;
    origin: CardCity;
    destination: CardCity;
    /** The same call the page makes, in the same words. */
    verdict: { word: string; tooClose: boolean };
    delta: number;
    pct: number | null;
    monthly: number;
    groups: CardGroup[];
    /** Two short lines, or null when break-even is not a meaningful question. */
    breakEven: { headline: string; note: string } | null;
    version: string;
  };

  try {
    const shared = decodeComparison(payload);
    const result = comparisonFromShared(shared);

    const city = (side: 'origin' | 'destination'): CardCity => ({
      name: metro(result[side].metroId).shortName,
      salary: result[side].grossSalary,
      takeHome: result[side].takeHome,
      leftover: result[side].leftover,
    });

    // Grouped exactly as the page groups them — a pay change and a cost change
    // are different kinds of news, and each half totals separately.
    const groups: CardGroup[] = (
      [
        ['payAndTax', 'Pay and tax'],
        ['living', 'Living costs'],
      ] as const
    )
      .map(([key, label]) => {
        const rows = result.breakdown.filter((b) => b.group === key);
        return {
          label,
          rows: rows.map((r) => ({
            label: r.label,
            delta: r.delta,
            kind: r.key === 'salary' ? ('pay' as const) : ('cost' as const),
          })),
          /*
           * "Pay and tax" holds a pay change and a tax change, which move in
           * opposite directions, so its subtotal is neither "less" nor "more"
           * of anything — it says better or worse. With no salary row in it,
           * every line is a cost and the plainer word is true again.
           */
          kind: rows.some((r) => r.key === 'salary') ? ('mixed' as const) : ('cost' as const),
          total: rows.reduce((sum, r) => sum + r.delta, 0),
        };
      })
      .filter((g) => g.rows.length > 0);

    /*
     * The salary that would make the move a wash. It is the one derived figure
     * a reader can act on directly — "ask for this" — so it earns the space the
     * breakdown leaves at the bottom of the card.
     */
    const be = breakEvenNarrative(result);
    const breakEven = !be
      ? null
      : be.kind === 'wins-at-any-salary'
        ? { headline: 'No salary needed', note: `${metro(result.destination.metroId).shortName} wins at any pay.` }
        : be.kind === 'level'
          ? { headline: formatUSD(be.salary), note: 'About level with the pay on the table.' }
          : {
              headline: formatUSD(be.salary),
              note:
                be.kind === 'has-headroom'
                  ? `The offer clears it by ${formatUSD(Math.abs(be.gap))}.`
                  : `${formatUSD(Math.abs(be.gap))} more than the offer.`,
            };

    const v = verdict(result);

    card = {
      household: describeHousehold(shared),
      salaryLabel: salaryWording(shared.filingStatus, shared.earners ?? 1).combined
        ? 'Both salaries'
        : 'Salary',
      /*
       * The SHORT form, from the engine rather than rebuilt here. The card
       * prints both city names two lines below this, so it does not need the
       * page's "Pack and move to Bangor" — and at 38px it has nowhere to put
       * it. What matters is that neither string is invented in this file.
       */
      verdict: { word: v.word, tooClose: v.kind === 'too-close' },
      breakEven,
      origin: city('origin'),
      destination: city('destination'),
      delta: result.delta,
      // Null when the origin city has no leftover money to measure against —
      // dividing by it produces figures like "589.9% more spare cash".
      pct: percentIsMeaningful(result) ? result.deltaPct : null,
      monthly: result.deltaMonthly,
      groups,
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

  /*
   * How many lines the breakdown needs, and therefore how tight to set it.
   *
   * A comparison can produce anywhere from two rows to ten, and the card is a
   * fixed 630px because that is what messaging apps expect. Satori OVERLAPS
   * rather than clipping when a column overflows, so a ten-row breakdown does
   * not get cut off — it prints on top of the heading above it. Rather than
   * truncate the calculation to fit a worst case that most comparisons never
   * reach, the type steps down once when the rows demand it.
   */
  const lines = card.groups.reduce((n, g) => n + g.rows.length + 1, 0);
  const dense = lines > 9;
  const rowSize = dense ? 17 : 19;
  const rowPad = dense ? 3 : 5;
  const groupSize = dense ? 18 : 20;
  const groupTop = dense ? 6 : 10;
  const totalSize = dense ? 20 : 22;

  /* Satori needs an explicit display on any node with more than one child, so
     every multi-part line here is either a flex row or a pre-composed string. */
  const eyebrow = {
    display: 'flex' as const,
    fontSize: 17,
    letterSpacing: 2,
    textTransform: 'uppercase' as const,
    color: FAINT,
  };

  /** What went in for one city: what they pay you, and what survives. */
  const cityBlock = (c: CardCity, highlight: boolean) => (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        borderTop: `1px solid ${RULE}`, paddingTop: 10,
      }}
    >
      <div style={{ display: 'flex', fontSize: 23, fontWeight: 600, color: INK }}>{c.name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: MUTED }}>
        <div style={{ display: 'flex' }}>{card.salaryLabel}</div>
        <div style={{ display: 'flex', color: INK }}>{formatUSD(c.salary)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: MUTED }}>
        <div style={{ display: 'flex' }}>Take-home after tax</div>
        <div style={{ display: 'flex', color: INK }}>{formatUSD(c.takeHome)}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, color: MUTED }}>
        <div style={{ display: 'flex' }}>Left over, a year</div>
        <div
          style={{
            display: 'flex', fontSize: 22, fontWeight: 700,
            color: highlight ? accent : INK,
          }}
        >
          {formatUSD(c.leftover)}
        </div>
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: GROUND, color: INK, padding: '34px 44px 30px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Route, and the household it is all conditional on. */}
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            borderBottom: `2px solid ${RULE_STRONG}`, paddingBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 700 }}>
            <div style={{ display: 'flex' }}>{card.origin.name}</div>
            <div style={{ display: 'flex', color: MUTED, padding: '0 14px' }}>→</div>
            <div style={{ display: 'flex' }}>{card.destination.name}</div>
          </div>
          <div style={{ display: 'flex', fontSize: 19, color: MUTED }}>{card.household}</div>
        </div>

        <div style={{ display: 'flex', flex: 1, gap: 40, paddingTop: 20 }}>
          {/* Left: the answer, and the two bottom lines it is the difference of. */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 14 }}>
            {/* Absorbs the slack, so the two city blocks sit on the bottom
                edge alongside the total on the right. */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              {/* The verdict leads, as it does on the page. Whoever sees this
                  in a chat gets the answer before the arithmetic. It shares a
                  baseline with the eyebrow because the card is a fixed height
                  and the city blocks below it are not negotiable. */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <div
                  style={{
                    display: 'flex', fontSize: card.verdict.tooClose ? 30 : 38,
                    fontWeight: 800, color: INK,
                  }}
                >
                  {card.verdict.word}
                </div>
                {/* "Too close to call" already fills the line; pairing it with
                    "more in your pocket" would also read as a contradiction. */}
                {!card.verdict.tooClose && (
                  <div style={eyebrow}>{better ? 'More in your pocket' : 'Less in your pocket'}</div>
                )}
              </div>
              <div
                style={{
                  display: 'flex', fontSize: 72, fontWeight: 800, color: accent,
                  lineHeight: 1, marginTop: 6,
                }}
              >
                {formatUSD(Math.abs(card.delta))}
              </div>
              <div style={{ display: 'flex', fontSize: 21, color: INK, marginTop: 8 }}>
                {`a year ${better ? 'better off' : 'worse off'} · ${formatUSD(Math.abs(card.monthly))} a month` +
                  (card.pct === null
                    ? ''
                    : ` · ${formatPercent(Math.abs(card.pct))} ${better ? 'more' : 'less'}`)}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cityBlock(card.origin, false)}
              {cityBlock(card.destination, true)}
            </div>
          </div>

          {/* Right: every line of the gap, and the total they add up to. */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1.18 }}>
            {/* Explicit, because the first group heading's own margin does not
                clear the eyebrow once the dense setting tightens it. */}
            {/* Names the direction, as the panel's table heading does. Every
                line below is the destination compared with now, and a reader
                who supplies their own point of view reads "less tax" as "more
                tax" — which is exactly what happened. */}
            <div style={{ ...eyebrow, paddingBottom: dense ? 14 : 4 }}>What changes if you move</div>

            {card.groups.map((group) => (
              <div key={group.label} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    display: 'flex', justifyContent: 'space-between', fontSize: groupSize,
                    fontWeight: 700, color: INK, marginTop: groupTop,
                  }}
                >
                  <div style={{ display: 'flex' }}>{group.label}</div>
                  <div style={{ display: 'flex', color: group.total >= 0 ? GOOD : BAD }}>
                    {changeInWords(group.total, group.kind).text}
                  </div>
                </div>
                {group.rows.map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex', justifyContent: 'space-between', fontSize: rowSize,
                      paddingTop: rowPad, paddingLeft: 14,
                    }}
                  >
                    <div style={{ display: 'flex', color: MUTED }}>{row.label}</div>
                    <div style={{ display: 'flex', color: row.delta >= 0 ? GOOD : BAD }}>
                      {changeInWords(row.delta, row.kind).text}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div
              style={{
                display: 'flex', justifyContent: 'space-between', fontSize: totalSize,
                fontWeight: 700,
                borderTop: `2px solid ${RULE_STRONG}`, marginTop: groupTop + 4, paddingTop: 10,
              }}
            >
              <div style={{ display: 'flex' }}>
                {better ? 'More left over' : 'Less left over'}
              </div>
              {/* No sign: the label beside it already says more or less, and
                  "Less left over  −$3,326" reads as a double negative. */}
              <div style={{ display: 'flex', color: accent }}>
                {formatUSD(Math.abs(card.delta))}
              </div>
            </div>

            {card.breakEven && (
              <div
                style={{
                  display: 'flex', flexDirection: 'column', marginTop: 'auto',
                  paddingTop: dense ? 10 : 16,
                }}
              >
                <div style={eyebrow}>
                  {`Break-even salary in ${card.destination.name}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}>
                  <div style={{ display: 'flex', fontSize: dense ? 26 : 30, fontWeight: 700, color: INK }}>
                    {card.breakEven.headline}
                  </div>
                  <div style={{ display: 'flex', fontSize: 19, color: MUTED, paddingLeft: 12 }}>
                    {card.breakEven.note}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex', justifyContent: 'space-between', fontSize: 18, color: MUTED,
            borderTop: `1px solid ${RULE}`, marginTop: 18, paddingTop: 12,
          }}
        >
          <div style={{ display: 'flex', fontWeight: 700, letterSpacing: 3 }}>
            {SITE_NAME.toUpperCase()}
          </div>
          <div style={{ display: 'flex' }}>{`public data sources · ${card.version}`}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
