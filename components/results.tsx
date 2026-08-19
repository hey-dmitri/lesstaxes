'use client';

import Link from 'next/link';

import {
  biggestReason,
  breakEvenNarrative,
  changeInWords,
  cityName,
  differenceRows,
  federalMovedReason,
  breakEvenReference,
  formatPercent,
  formatUSD,
  formatUSDShort,
  housingLabel,
  metro,
  percentIsMeaningful,
  utilitiesAreSplitOut,
  verdict,
  whyClause,
  whyNarrative,
  type CityResult,
  type ComparisonResult,
  type DifferenceRow,
} from '@/engine';
import { InfoDot } from '@/components/fields';
import { useCountUp } from '@/lib/use-count-up';

/** Rows whose value is fixed by federal law and cannot vary between cities. */
const FEDERAL_ROWS = new Set(['federalTax', 'fica']);

/**
 * A mark for each line of the breakdown.
 *
 * The Turn 5 design puts a small glyph in a chip at the start of every row, and
 * it earns its width: the two tables are read down rather than across, and a
 * shape the eye can catch is faster than re-reading fourteen labels to find the
 * rent. Plain typographic characters, not an icon set — the site fetches
 * nothing from anywhere, and a font that lacks one of these falls back to
 * something else legible rather than to a blank box.
 */
const GLYPHS: Record<string, string> = {
  federalTax: '★',
  stateTax: '§',
  localTax: '¶',
  fica: '◎',
  statePayroll: '⊘',
  housing: '⌂',
  propertyTax: '▣',
  maintenance: '⌗',
  transport: '⬭',
  food: '◍',
  phone: '↯',
  healthcare: '+',
  other: '•',
  salesTax: '%',
};

function glyphFor(row: DifferenceRow): string {
  // The salary row is the only one whose mark says which way it moved, because
  // it is the only line the reader chose rather than the country choosing it.
  if (row.key === 'salary') return row.delta >= 0 ? '↑' : '↓';
  return GLYPHS[row.key] ?? '•';
}

/**
 * The answer: which way, how much, and why.
 *
 * Artboard 5b, restructured after the first read of it. The design puts the
 * money at 88px and the verdict in a 12px eyebrow above it, and that is the
 * wrong way round — the eyebrow is the ANSWER and the figure is the evidence
 * for it. Worse, a bare "$10,860" in coral says nothing about what it is: a
 * reader has to decide for themselves whether that is what they gain, what
 * they lose, what they earn or what they spend.
 *
 * So the verdict is the headline, at the size a headline gets, and the figure
 * lives inside a sentence that says what it measures — still the second
 * loudest thing on the page, still rolled up on arrival, but no longer a
 * number with no noun.
 */
function Verdict({ result, animate }: { result: ComparisonResult; animate: boolean }) {
  const v = verdict(result);
  const better = result.delta >= 0;
  const tooClose = v.kind === 'too-close';
  const rolled = useCountUp(result.delta, animate);
  const colour = tooClose ? 'var(--ink-soft)' : better ? 'var(--good)' : 'var(--bad)';

  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  const why = whyNarrative(result);
  const breakEven = breakEvenNarrative(result);
  const reason = biggestReason(result);

  /**
   * The figure, and what it means, on a line of their own.
   *
   * A block span mid-sentence, which is deliberate: the whole thing is still
   * one sentence — "Moving to Lafayette would leave you $6.8K a year worse off
   * than staying in Raleigh" — and it reads as one. But the figure is the part
   * being quoted, and inline at twice the body size it broke the line wherever
   * the column happened to end, leaving "$6.8K a year" and "worse off" on
   * different lines with a ragged gap between them. Given its own line it takes
   * its meaning with it.
   */
  const figure = (words: string) => (
    <span
      className="tnum block py-0.5 text-[1.6rem] font-bold leading-tight xl:text-[2rem]"
      style={{ color: colour }}
    >
      {formatUSDShort(Math.abs(rolled))} a year{words ? ` ${words}` : ''}
    </span>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div
        className="flex flex-col gap-2"
        style={{ animation: animate ? 'pop 700ms ease-out both' : undefined }}
      >
        <span
          className="font-display text-[0.95rem] font-bold uppercase tracking-[0.18em]"
          style={{ color: 'var(--muted-strong)' }}
        >
          The verdict
        </span>
        {/*
          The verdict itself, at headline size. The wording comes from the
          engine, so this panel, the share card and the link preview cannot
          describe the same move three different ways.
        */}
        {/*
          The size steps down for a long place name. "Pack and move to Rest of
          District of Columbia" is 45 characters against "Stay in Austin"'s 14,
          and at one fixed size the long ones ran to three lines and pushed the
          two cards beside them off the first screenful. Balanced rather than
          ragged, so a two-line headline splits somewhere sensible.
        */}
        <h2
          className={`font-display font-bold leading-[1.02] tracking-[-0.04em] ${
            v.headline.length > 24
              ? 'text-[1.9rem] sm:text-[2.3rem] xl:text-[2.7rem]'
              : 'text-[2.4rem] sm:text-[3rem] xl:text-[3.6rem]'
          }`}
          style={{ color: colour, textWrap: 'balance' }}
        >
          {v.headline}
        </h2>
        {/*
          WHAT THE NUMBER IS, in a sentence. Every version reads "moving to X
          would leave you ...", so the figure is always the same quantity
          measured the same way round — which is the thing a bare signed number
          could not tell anybody.
        */}
        <p
          className="max-w-[46ch] text-[1.1rem] leading-snug xl:text-[1.2rem]"
          style={{ color: 'var(--ink)' }}
        >
          {/*
            "This", not "Moving to Racine", WHERE THE HEADLINE HAS ALREADY SAID
            IT. "Pack and move to Racine" followed by "Moving to Racine would
            leave you" is the same four words twice in two lines.
            
            Only where the headline names the move, which is the pack case. On
            a "Stay in Raleigh" verdict "this" would refer to staying, while the
            figure underneath is what MOVING would do — the pronoun would point
            at the wrong thing and reverse the sentence.
          */}
          {v.kind === 'pack' ? 'This' : `Moving to ${to}`} would leave you
          {tooClose ? ' within' : ''}
          {figure(tooClose ? '' : better ? 'better off' : 'worse off')}
          {tooClose ? 'of where you are in ' : 'than staying in '}
          {from} &mdash;{' '}
          <span className="tnum">{formatUSDShort(Math.abs(result.deltaMonthly))}</span> a month.
        </p>
        <p className="max-w-[52ch] text-[1rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
          {to} is{' '}
          <strong style={{ color: why.cityCheaper ? 'var(--good)' : 'var(--bad)' }}>
            <span className="tnum">{formatUSDShort(why.cityAmount)}</span>{' '}
            {why.cityCheaper ? 'cheaper' : 'pricier'}
          </strong>{' '}
          a year to live in
          {/*
            The clause comes from the engine so that this panel, the share card
            and the link preview cannot drift apart. It distinguishes effects
            that OPPOSE each other from ones that COMPOUND — saying a pay cut
            into a pricier city "does not outweigh" the expense told the reader
            the two partly cancelled, when in fact they add up.
          */}
          {whyClause(why)}
        </p>
        {/*
          "On money alone, the move comes out ahead" says nothing the headline
          above it has not already said, so it is gone from the two decided
          verdicts. It stays on "too close to call", where it is not a
          disclaimer but the only explanation of the verdict: it names the
          threshold the gap failed to clear, which is otherwise invisible and is
          the first thing a reader who disagrees will want to check.

          The "not advice" guard it used to carry is in the footer of every page.
        */}
        {tooClose && (
          <p className="text-[0.92rem] leading-snug" style={{ color: 'var(--muted)' }}>
            {v.qualifier}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {/*
          THE REASON COMES FIRST, above break-even. It answers "what did this?",
          which is the question a reader has the moment they have read the
          verdict; break-even answers "what would change it?", which is the one
          after. They were the other way round.
        */}
        {reason && (
          <StatCard
            label="Biggest single reason"
            figure={formatUSDShort(reason.delta, { signed: true })}
            figureColour={reason.delta >= 0 ? 'var(--good)' : 'var(--bad)'}
          >
            {reason.sentence}
          </StatCard>
        )}
        {breakEven && (
          <StatCard
            /*
              NO CITY IN THIS LABEL. "Salary needed in Lafayette to break even"
              is one line for Lafayette and two for Louisville/Jefferson County,
              so the card changed height with the name of the place. The city is
              named in the sentence underneath, where a second line costs
              nothing.
            */
            label={
              breakEven.kind === 'wins-at-any-salary'
                ? 'No salary needed to break even'
                : 'Salary needed to break even'
            }
            figure={
              breakEven.kind === 'wins-at-any-salary'
                ? 'None'
                : formatUSDShort(breakEven.salary)
            }
            highlight={breakEven.kind === 'has-headroom'}
          >
            <BreakEvenLine breakEven={breakEven} to={to} />
          </StatCard>
        )}
      </div>
    </div>
  );
}

/** One of the two small cards beside the headline figure. */
function StatCard({
  label,
  figure,
  figureColour,
  highlight,
  children,
}: {
  label: string;
  figure: string;
  figureColour?: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-xl border px-4 py-3"
      style={{
        borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule-strong)',
        background: highlight ? 'var(--picked)' : 'var(--surface-raised)',
      }}
    >
      <span className="eyebrow" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="tnum text-[1.5rem] font-semibold" style={{ color: figureColour ?? 'var(--ink)' }}>
        {figure}
      </span>
      <span className="text-[0.88rem] leading-snug" style={{ color: 'var(--ink-soft)' }}>
        {children}
      </span>
    </div>
  );
}

/** The break-even sentence, reused between the card and the disclosure. */
function BreakEvenLine({
  breakEven,
  to,
}: {
  breakEven: NonNullable<ReturnType<typeof breakEvenNarrative>>;
  to: string;
}) {
  if (breakEven.kind === 'wins-at-any-salary') {
    return <>{to} comes out ahead even on no income at all.</>;
  }
  if (breakEven.kind === 'level') {
    return <>In {to}, about {breakEvenReference(breakEven)}.</>;
  }
  const gap = (
    <strong
      className="tnum"
      style={{ color: breakEven.kind === 'has-headroom' ? 'var(--good)' : 'var(--bad)' }}
    >
      {formatUSDShort(Math.abs(breakEven.gap))}
    </strong>
  );
  /*
    Not "the offer clears it". There may not be an offer — people run this
    before anyone has offered them anything, which is why the setup screen's
    second column is headed "Moving to" rather than "The offer".
  */
  return breakEven.kind === 'has-headroom' ? (
    <>
      In {to} you&rsquo;d clear it by {gap}.
    </>
  ) : (
    <>
      In {to} you&rsquo;d need {gap} more than {breakEvenReference(breakEven)}.
    </>
  );
}

/**
 * The two cities as one subtraction each: pay in, costs out, what survives.
 *
 * These three figures used to sit at the bottom of the two form columns on the
 * setup screen, where they were an answer printed above the button that asks
 * for one. On the answer screen they are what the headline difference is the
 * difference OF, which is the only place they explain anything.
 */
function CitySummaries({ result }: { result: ComparisonResult }) {
  /*
   * The green card is the verdict's card, not the larger number's. Tying it to
   * the sign of the difference lit Austin up under a headline reading "too
   * close to call" — the page saying one thing in words and the opposite in
   * colour, over a gap it had just called too small to trust.
   */
  const v = verdict(result);
  const cities = [
    { city: result.origin, highlight: v.kind === 'stay' },
    { city: result.destination, highlight: v.kind === 'pack' },
  ];

  const livingFor = (city: CityResult) =>
    city.housing.total + city.living.total + city.salesTax;
  const money = formatUSDShort;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cities.map(({ city, highlight }) => {
        const living = livingFor(city);
        return (
          <div
            key={city.metroId}
            className="flex flex-col gap-2 rounded-xl border px-5 py-4"
            style={{
              borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule-strong)',
              background: highlight ? 'var(--picked)' : 'var(--surface-raised)',
            }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: highlight ? 'var(--accent)' : 'var(--muted-strong)' }}
              />
              <h3
                className="font-display text-[1.1rem] font-bold tracking-[-0.02em]"
                style={{ color: 'var(--ink)' }}
              >
                {cityName(city.metroId, result.datasetVersion)}
              </h3>
            </div>

            {/*
              THE SALARY JOINS THE COLUMN IT BELONGS TO.
              
              It was tucked in beside the city name, left-aligned, while the
              three figures it leads to were stacked in a right-hand column
              underneath — so the one number that starts the sum was the only one
              outside it. The card is a subtraction and now reads as one: pay in,
              tax out, costs out, what survives, four figures down a single edge.
              
              It picks up a label on the way. A bare figure beside a place name
              could be anything the city costs; the row beneath it says
              "take-home after tax", which only makes sense if this one is the
              pay before any.
            */}
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.88rem]" style={{ color: 'var(--muted-strong)' }}>
                Salary, before tax
              </span>
              <span className="tnum text-[1.05rem] font-semibold" style={{ color: 'var(--muted-strong)' }}>
                {money(city.grossSalary)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.88rem]" style={{ color: 'var(--muted-strong)' }}>
                Take-home after tax
              </span>
              <span className="tnum text-[1.2rem] font-semibold" style={{ color: 'var(--ink)' }}>
                {money(city.takeHome)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[0.88rem]" style={{ color: 'var(--muted-strong)' }}>
                Typical living costs
              </span>
              <span className="tnum text-[1.05rem] font-semibold" style={{ color: 'var(--bad)' }}>
                &minus;{money(living)}
              </span>
            </div>
            <div
              className="flex items-baseline justify-between gap-3 border-t pt-2.5"
              style={{ borderColor: highlight ? 'var(--picked-rule)' : 'var(--rule)' }}
            >
              <span className="text-[0.92rem] font-semibold" style={{ color: 'var(--ink)' }}>
                What&rsquo;s left over, a year
              </span>
              <span
                className="tnum text-[1.6rem] font-bold leading-none"
                style={{ color: city.leftover < 0 ? 'var(--bad)' : highlight ? 'var(--accent)' : 'var(--ink)' }}
              >
                {money(city.leftover)}
              </span>
            </div>
            {/*
              A CITY COMES OUT SHORT MORE OFTEN THAN YOU WOULD THINK, and when
              it does the leftover figure above goes negative — which reads as a
              broken calculator unless the page says otherwise. At the local
              median rent and average household spending it is not an edge case:
              a family of four on a middling salary is short in most metros.

              This replaced a full-width paragraph that opened by restating the
              figure — "Bakersfield comes out short ... by $358 in Bakersfield"
              — beside a card already showing −$358 in red, and then repeated
              the note below in different words. One line, in the card it is
              about, only when it is true.
            */}
            {city.leftover < 0 && (
              <span className="text-[0.82rem] leading-snug" style={{ color: 'var(--bad)' }}>
                Typical costs here come to more than the pay. That is what the local medians say
                at this salary &mdash; not an error.
              </span>
            )}
          </div>
        );
      })}
      {/*
        Said once, under both, because it was the same sentence twice — two
        identical grey lines side by side, which reads as a caption on each card
        rather than as the one caveat it is.
      */}
      <p
        className="text-[0.84rem] leading-snug sm:col-span-2"
        style={{ color: 'var(--faint)' }}
      >
        Both columns are your housing, plus what a household your size usually spends in that city.
        Not your own budget &mdash; change any of it behind &ldquo;Change anything&rdquo;.
      </p>
    </div>
  );
}

/** The percentage, and what the figures above actually count. */
function WhatThisMeans({ result }: { result: ComparisonResult }) {
  const better = result.delta >= 0;
  const from = metro(result.origin.metroId).shortName.replace(/,.*$/, '');
  const to = metro(result.destination.metroId).shortName.replace(/,.*$/, '');

  return (
    <div className="flex flex-col gap-1.5 text-[0.9rem] leading-snug">
      <p style={{ color: 'var(--muted-strong)' }}>
        <strong style={{ color: 'var(--ink-soft)' }}>Both tables read one way round:</strong> every
        line is {to} compared with {from}. &ldquo;Less&rdquo; means you would pay less of that thing
        there, &ldquo;more&rdquo; means you would pay more, and green means the change leaves you
        better off. The two tables together add up to the difference at the top.
      </p>
      {percentIsMeaningful(result) && (
        <p style={{ color: 'var(--ink-soft)' }}>
          That is{' '}
          <strong className="tnum" style={{ color: better ? 'var(--good)' : 'var(--bad)' }}>
            {formatPercent(Math.abs(result.deltaPct))}
          </strong>{' '}
          {better ? 'more' : 'less'} than what you have left over in {from} today &mdash; a
          percentage of the {formatUSDShort(result.origin.leftover)}, not of your salary.
        </p>
      )}
      <p style={{ color: 'var(--muted-strong)' }}>
        <strong style={{ color: 'var(--ink-soft)' }}>Take-home</strong> is a year&rsquo;s pay less
        federal income tax, Social Security and Medicare, any state and local income tax, and the
        state disability or paid-leave contribution where there is one.{' '}
        <strong style={{ color: 'var(--ink-soft)' }}>What&rsquo;s left over</strong> is what
        survives after rent or mortgage, property tax, upkeep and insurance for an owner, cars,
        food, utilities and healthcare. There is no sales tax line: the spending figures already
        include the tax paid at the till. {to} and {from} are worked out the same way and then
        compared.{' '}
        <Link href="/methodology" className="underline underline-offset-2" style={{ color: 'var(--accent)' }}>
          How it works
        </Link>
      </p>
    </div>
  );
}

/**
 * A collapsed section. Native <details> — keyboard operable, announces its own
 * expanded state, works without JavaScript.
 */
function Disclosure({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t pt-2.5" style={{ borderColor: 'var(--rule)' }}>
      <summary
        className="cursor-pointer list-none text-[0.9rem] font-medium marker:content-none"
        style={{ color: 'var(--accent)' }}
      >
        <span aria-hidden="true" className="inline-block w-4">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">&minus;</span>
        </span>
        {summary}
      </summary>
      <div className="pt-2.5">{children}</div>
    </details>
  );
}

const ROW = 'grid grid-cols-[1.4rem_minmax(0,1fr)_4rem_6.5rem] items-baseline gap-2.5';

/**
 * One cell: "$4,055 less", "$1,200 more", or "the same".
 *
 * "+$4,055" in green against the word TAXES was read as "you will pay more
 * tax" by the first person who saw it. It meant the opposite — you keep $4,055
 * more because the tax is lower — and no colour fixes a sentence that says the
 * wrong thing. The word carries the direction and the colour agrees with it.
 *
 * The Turn 5 design prints a bare signed figure here. It splits the rows into
 * two tables, each headed with the direction, which is a real improvement and
 * is kept — but a heading four rows up is not the same as the word on the line,
 * and the word is what stopped somebody reading this backwards.
 */
function cell(
  value: number,
  kind: 'cost' | 'pay',
  { bold = false }: { bold?: boolean } = {},
) {
  const change = changeInWords(value, kind);
  return (
    <span
      className={`text-right text-[0.88rem] ${bold ? 'font-semibold' : ''}`}
      style={{
        color: change.unchanged ? 'var(--muted)' : change.better ? 'var(--good)' : 'var(--bad)',
      }}
    >
      {change.unchanged ? (
        'the same'
      ) : (
        <>
          <span className="tnum">{formatUSD(change.amount)}</span>{' '}
          <span className="text-[0.92em] font-normal">{change.word}</span>
        </>
      )}
    </span>
  );
}

/**
 * The month column is quieter and carries no word.
 *
 * Both columns are the same fact at two scales, so saying "less" twice on every
 * line reads as a stutter. The year column is the emphasised one and the one
 * the word belongs to; the month figure sits beside it as a conversion, in
 * grey, and takes its direction from its neighbour.
 */
function monthly(value: number) {
  return (
    <span className="tnum text-right text-[0.82rem]" style={{ color: 'var(--muted)' }}>
      {Math.abs(value) < 12 ? '—' : formatUSD(Math.abs(value) / 12)}
    </span>
  );
}

/** One of the two breakdown tables. */
function Table({
  heading,
  total,
  rows,
  totalKind,
  rule = false,
}: {
  heading: React.ReactNode;
  total: number;
  rows: Array<{ row: DifferenceRow; note?: React.ReactNode }>;
  /** A dividing rule on the left, so the pair reads as one block split in two. */
  rule?: boolean;
  /*
   * Only the total in the header uses this; each row works out its own from
   * its key. The pay table's total is 'mixed' because it adds a salary change
   * to a tax change, and neither "less" nor "more" is true of the pair.
   */
  totalKind: 'cost' | 'pay' | 'mixed';
}) {
  const change = changeInWords(total, totalKind);
  return (
    <div
      className={`flex flex-col ${rule ? 'lg:border-l lg:pl-8' : ''}`}
      style={rule ? { borderColor: 'var(--rule)' } : undefined}
    >
      <div
        className="flex items-baseline justify-between gap-3 border-b pb-1.5"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span className="eyebrow">{heading}</span>
        <span
          className="tnum text-[0.88rem] font-semibold"
          style={{
            color: change.unchanged ? 'var(--muted)' : change.better ? 'var(--good)' : 'var(--bad)',
          }}
        >
          {formatUSDShort(total, { signed: true })}
        </span>
      </div>
      {rows.map(({ row, note }) => (
        <div
          key={row.key}
          className={`${ROW} border-b py-[5px]`}
          style={{ borderColor: 'var(--rule)' }}
        >
          <span
            aria-hidden="true"
            className="flex h-[1.4rem] w-[1.4rem] items-center justify-center self-center rounded-md text-[0.74rem]"
            style={{
              background: 'var(--surface-raised)',
              color: row.delta >= 0 ? 'var(--good)' : 'var(--bad)',
            }}
          >
            {glyphFor(row)}
          </span>
          <span
            className="flex items-baseline gap-1.5 text-[0.88rem]"
            style={{ color: 'var(--ink-soft)' }}
          >
            {row.label}
            {note}
          </span>
          {monthly(row.delta)}
          {cell(row.delta, row.key === 'salary' ? 'pay' : 'cost')}
        </div>
      ))}
    </div>
  );
}

/**
 * Every line of the difference, in two tables: the pay and its taxes on one
 * side, everything the household spends on the other.
 *
 * THREE THINGS THIS USED TO DO AND NO LONGER DOES.
 *
 * It sorted by size, so the tax lines arrived in a different order for every
 * comparison and a reader could not tell whether a tax was missing or simply
 * equal in both cities. Every tax now has a fixed row and prints $0 when the
 * two cities agree, which is itself an answer: somebody looked.
 *
 * It hid the living detail inside one "Food, phone, healthcare, other" row —
 * the largest thing on the page for most comparisons, naming four categories
 * out of eight. Then it hid the same detail behind a disclosure. The Turn 5
 * design gives living costs a column of their own, so all of it is simply
 * there.
 *
 * And it repeated the headline as a total at the bottom under a third name for
 * the same number. The line at the bottom now says what it is: the two tables
 * added together, which is the figure at the top of the page.
 */
function Breakdown({ result }: { result: ComparisonResult }) {
  const from = cityName(result.origin.metroId, result.datasetVersion);
  const to = cityName(result.destination.metroId, result.datasetVersion);
  // Federal tax differing between two cities looks like a bug unless the page
  // says why, and the page says everywhere else that federal rules are the same.
  const federalNote = federalMovedReason(result);

  /*
   * The rows come from the engine, not from this file. Built here they would be
   * a hand-written list of categories sitting beside a computed total — which
   * is how the state disability contribution and owner upkeep both ended up
   * charged in the answer and missing from the explanation. A test pins that
   * these parts add up to the headline.
   */
  const rows = differenceRows(result);
  /*
   * A LIVING ROW APPEARS WHERE THE HOUSEHOLD IS CHARGED SOMETHING, in either
   * city — not where the two cities differ.
   *
   * The two rules land differently and both are wanted. A tax that is identical
   * in both cities keeps its row and prints $0, because "is local income tax
   * the same in both?" is a question this list should answer. A renter's
   * property tax is not the same question: it is zero everywhere, always, and a
   * row for it is a category the household was never charged.
   */
  const livingRows = rows.living.filter((r) => r.origin !== 0 || r.destination !== 0);
  const payTotal = rows.salary.delta + rows.taxes.reduce((sum, r) => sum + r.delta, 0);
  const livingTotal = livingRows.reduce((sum, r) => sum + r.delta, 0);

  return (
    /*
      ONE PANEL, NOT TWO TABLES.
      
      The two tables used to sit loose on the page, directly under the two city
      cards — and a reader who did not stop to read the small heading took the
      left table for Victoria's detail and the right one for Racine's. They are
      nothing of the kind: BOTH are the move, measured one way round, and the
      two of them add up to a single figure.
      
      So they are inside one bordered block with one heading across the top,
      stated once and set large enough to be read before the rows are. Each
      column keeps a short label with no city in it, which cannot be mistaken
      for a card's title, and the rule between them says they are siblings.
    */
    <div
      className="flex flex-col gap-4 rounded-xl border px-5 py-4 sm:px-6 sm:py-5"
      style={{ borderColor: 'var(--rule-strong)', background: 'var(--surface-sunken)' }}
    >
      <div className="flex flex-col gap-1">
        <h3
          className="font-display text-[1.2rem] font-bold tracking-[-0.02em]"
          style={{ color: 'var(--ink)' }}
        >
          Everything that changes if you move to {to}
        </h3>
        {/* The heading says where. This says which way round, and nothing else. */}
        <p className="text-[0.92rem] leading-snug" style={{ color: 'var(--muted-strong)' }}>
          Every line is {to} measured against {from} &mdash; what the move does to your pocket.
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
        <Table
          heading={<>Your pay and the tax on it</>}
          total={payTotal}
          totalKind="mixed"
          rows={[
            { row: rows.salary },
            ...rows.taxes.map((row) => ({
              row,
              /*
                The note sits ON the line it explains and opens OVER the table.
                Loose underneath it read as a caption for the whole thing, when
                it is about one row — why federal tax moved at all, on a site
                that says everywhere else that federal rules are the same in
                every state.
              */
              note:
                row.key === 'federalTax' && federalNote ? (
                  <InfoDot label="Why does federal tax change between two cities?">
                    {federalNote}
                  </InfoDot>
                ) : undefined,
            })),
          ]}
        />
        <Table
          heading={<>What the household spends</>}
          rule
          total={livingTotal}
          totalKind="cost"
          rows={livingRows.map((row) => ({
            row,
            /*
              "Everything else" is the only label on the page that is a shrug,
              and it sits over a figure that runs to five figures a year. What
              is inside it comes from the engine, beside the sum, so the words
              and the arithmetic cannot drift.
            */
            note: row.note ? (
              <InfoDot label={`What is in ${row.label.toLowerCase()}?`}>{row.note}</InfoDot>
            ) : undefined,
          }))}
        />
      </div>

      <div
        className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t pt-3"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span className="font-display text-[1.1rem] font-bold" style={{ color: 'var(--ink)' }}>
          Both columns added together
        </span>
        <div className="flex items-baseline gap-5">
          <span className="tnum text-[0.95rem] font-semibold" style={{ color: 'var(--ink-soft)' }}>
            {formatUSDShort(Math.abs(result.deltaMonthly))} a month
          </span>
          <span
            className="tnum text-[1.4rem] font-bold"
            style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}
          >
            {formatUSDShort(result.delta, { signed: true })} a year
          </span>
        </div>
      </div>
    </div>
  );
}

function DetailTable({ result }: { result: ComparisonResult }) {
  const from = metro(result.origin.metroId).shortName;
  const to = metro(result.destination.metroId).shortName;
  const salaryChanged = result.destination.grossSalary !== result.origin.grossSalary;
  const mid = result.destinationAtOriginSalary;

  const rows = [
    { key: 'salary', label: 'Gross salary', a: result.origin.grossSalary, b: mid.grossSalary, c: result.destination.grossSalary },
    { key: 'federalTax', label: 'Federal income tax', a: -result.origin.tax.federal, b: -mid.tax.federal, c: -result.destination.tax.federal },
    { key: 'stateTax', label: 'State income tax', a: -result.origin.tax.state, b: -mid.tax.state, c: -result.destination.tax.state },
    { key: 'localTax', label: 'Local income tax', a: -result.origin.tax.local, b: -mid.tax.local, c: -result.destination.tax.local },
    { key: 'fica', label: 'Social Security & Medicare', a: -result.origin.tax.fica, b: -mid.tax.fica, c: -result.destination.tax.fica },
    /*
     * STATE DISABILITY AND PAID LEAVE, which this table left out while the
     * engine charged it. The rows summed to $1,560 more than the "in your
     * pocket" figure printed underneath them for a Californian on $120,000 —
     * a table headed "the full numbers, line by line" that did not add up to
     * the answer it was explaining.
     *
     * Eleven states charge it. The breakdown and the share card both carried
     * it already; only this table did not.
     */
    {
      key: 'statePayroll',
      label: 'State disability & paid leave',
      a: -result.origin.tax.statePayroll,
      b: -mid.tax.statePayroll,
      c: -result.destination.tax.statePayroll,
    },
    // Shelter plus the utility bill, matching the label and the breakdown. It
    // is inside the rent for a renter and charged separately for an owner, so
    // adding the field is right in both cases: it is zero for renters.
    {
      key: 'housing',
      label: housingLabel(result.origin.housing.tenure, result.destination.housing.tenure),
      a: -(result.origin.housing.shelter + result.origin.housing.utilities),
      b: -(mid.housing.shelter + mid.housing.utilities),
      c: -(result.destination.housing.shelter + result.destination.housing.utilities),
    },
    { key: 'propertyTax', label: 'Property tax', a: -result.origin.housing.propertyTax, b: -mid.housing.propertyTax, c: -result.destination.housing.propertyTax },
    // Owners only, and worth four figures a year, so it gets its own line
    // rather than disappearing inside the mortgage figure.
    {
      key: 'maintenance',
      label: 'Upkeep, repairs & insurance',
      a: -(result.origin.housing.maintenance + result.origin.housing.insurance),
      b: -(mid.housing.maintenance + mid.housing.insurance),
      c: -(result.destination.housing.maintenance + result.destination.housing.insurance),
    },
    { key: 'transport', label: 'Cars & transport', a: -result.origin.living.transport, b: -mid.living.transport, c: -result.destination.living.transport },
    { key: 'food', label: 'Food', a: -result.origin.living.food, b: -mid.living.food, c: -result.destination.living.food },
    /*
     * Phone, not "Utilities". Gas, electricity, water and heating now sit in
     * the housing line, where the rent figure was already paying for them.
     *
     * BUT NOT ON AN OLD LINK. Releases before 2026.9 have no split, so this
     * field is the whole category — $2,661 a year in Chicago against $1,014
     * after — and a fixed "Phone" label put the entire energy bill under the
     * wrong name, beside a housing row promising utilities it did not contain.
     * Share links replay their own release, so the number is right and only
     * the word was wrong.
     */
    {
      key: 'phone',
      label: utilitiesAreSplitOut(result.datasetVersion) ? 'Phone' : 'Utilities & phone',
      a: -result.origin.living.utilities,
      b: -mid.living.utilities,
      c: -result.destination.living.utilities,
    },
    { key: 'healthcare', label: 'Healthcare', a: -result.origin.living.healthcare, b: -mid.living.healthcare, c: -result.destination.living.healthcare },
    { key: 'other', label: 'Everything else', a: -result.origin.living.other, b: -mid.living.other, c: -result.destination.living.other },
    { key: 'salesTax', label: 'Sales tax', a: -result.origin.salesTax, b: -mid.salesTax, c: -result.destination.salesTax },
  ].filter((r) => r.a !== 0 || r.b !== 0 || r.c !== 0);

  const th = 'px-2 py-1.5 text-right text-[0.7rem] font-semibold uppercase tracking-[0.06em]';
  const td = 'px-2 py-1 text-right tnum text-[0.8rem]';

  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--rule)' }}>
      <table className="w-full border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--rule-strong)' }}>
            <th className={`${th} text-left`} style={{ color: 'var(--muted)' }}>Line</th>
            <th className={th} style={{ color: 'var(--muted)' }}>{from}</th>
            {salaryChanged && (
              <th className={th} style={{ color: 'var(--muted)' }}>
                {to}
                <span className="block font-normal normal-case tracking-normal">at current pay</span>
              </th>
            )}
            <th className={th} style={{ color: 'var(--muted)' }}>{to}</th>
            <th className={th} style={{ color: 'var(--muted)' }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const change = r.c - r.a;
            const cityMoved = Math.abs(r.b - r.a) >= 1;
            return (
              <tr key={r.key} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td className="px-2 py-1 text-left text-[0.8rem]" style={{ color: 'var(--ink-soft)' }}>
                  {r.label}
                  {FEDERAL_ROWS.has(r.key) && !cityMoved && (
                    <span
                      className="ml-1.5 rounded border px-1 text-[0.68rem] uppercase tracking-wider"
                      style={{ borderColor: 'var(--rule-strong)', color: 'var(--muted)' }}
                      title="Federal rules are identical in every state. This moves only because the salary moves."
                    >
                      same
                    </span>
                  )}
                </td>
                <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(r.a)}</td>
                {salaryChanged && (
                  <td className={td} style={{ color: cityMoved ? 'var(--ink)' : 'var(--muted)' }}>
                    {formatUSD(r.b)}
                  </td>
                )}
                <td className={td} style={{ color: 'var(--ink)' }}>{formatUSD(r.c)}</td>
                <td className={td} style={{ color: change >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                  {formatUSD(change, { signed: true })}
                </td>
              </tr>
            );
          })}
          <tr style={{ borderTop: '2px solid var(--rule-strong)' }}>
            <td className="px-2 py-1.5 text-left text-[0.8rem] font-bold" style={{ color: 'var(--ink)' }}>
              In your pocket
            </td>
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(result.origin.leftover)}</td>
            {salaryChanged && (
              <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(mid.leftover)}</td>
            )}
            <td className={`${td} font-bold`} style={{ color: 'var(--ink)' }}>{formatUSD(result.destination.leftover)}</td>
            <td className={`${td} font-bold`} style={{ color: result.delta >= 0 ? 'var(--good)' : 'var(--bad)' }}>
              {formatUSD(result.delta, { signed: true })}
            </td>
          </tr>
        </tbody>
      </table>
      {salaryChanged && (
        <p className="px-2 py-1.5 text-[0.76rem] leading-snug" style={{ color: 'var(--muted)' }}>
          The middle column is {to} <em>at your current salary</em> — so column one to two is what
          the city did, and two to three is what the pay change did.
        </p>
      )}
    </div>
  );
}

export function Results({
  result,
  animate,
  share,
}: {
  result: ComparisonResult;
  animate: boolean;
  share?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Scoped to the figures; wrapping the panel re-read everything on every keystroke. */}
      <div aria-live="polite">
        <Verdict result={result} animate={animate} />
      </div>

      <CitySummaries result={result} />

      <Breakdown result={result} />

      <div className="flex flex-col gap-1.5">
        <Disclosure summary="What these numbers mean">
          <WhatThisMeans result={result} />
        </Disclosure>
        <Disclosure summary="The full numbers, line by line">
          <DetailTable result={result} />
        </Disclosure>
      </div>

      <div className="border-t pt-4" style={{ borderColor: 'var(--rule)' }}>
        {share}
      </div>
    </div>
  );
}
