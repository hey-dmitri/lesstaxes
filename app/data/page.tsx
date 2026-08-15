import type { Metadata } from 'next';

import { DatasetBrowser } from '@/components/dataset-browser';
import { ReportProblem } from '@/components/report-problem';
import { DATASET_SOURCES } from '@/lib/dataset-rows';
import { allLocalJurisdictions } from '@/engine';
import { PageShell, Prose } from '@/components/page-shell';
import { DATASET_VERSION } from '@/engine';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: `The data — ${SITE_NAME}`,
  description:
    'Every figure the calculator uses, for all 438 US locations — and separately for each state of the 43 that cross a state line — with the source, the licence and the vintage of each.',
};

/*
 * COUNTED FROM THE DATASET. This paragraph named six cities and listed seven
 * more as "still on their state's average" for weeks after all of them were
 * given published rates — a page about data quality, wrong about its own data.
 *
 * Cities and rules are different numbers: Portland levies two taxes, so there
 * is one more rule than there are cities.
 */
const NAMED_LOCAL = (() => {
  const named = allLocalJurisdictions().filter((j) => !j.isStateAverage && !j.id.startsWith('in-'));
  const cities = new Set(named.map((j) => (j.id.startsWith('portland-') ? 'portland' : j.id)));
  return { cities: cities.size, rules: named.length };
})();

export default function DataPage() {
  return (
    <PageShell
      title="The data"
      standfirst="Every number the calculator uses, for all 438 locations. The 43 that cross a state line appear once per state, because that is how many different tax answers they have. Look up somewhere you know and check it against your own experience — that is the point of this page."
    >
      <DatasetBrowser />

      <Prose>
        <h2>Where each number comes from</h2>
        <div className="overflow-x-auto rounded border" style={{ borderColor: 'var(--rule)' }}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule-strong)' }}>
                <th scope="col" className="px-3 py-2 text-left text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Data</th>
                <th scope="col" className="px-3 py-2 text-left text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>What kind of number</th>
                <th scope="col" className="px-3 py-2 text-left text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Source</th>
                <th scope="col" className="px-3 py-2 text-left text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Licence</th>
              </tr>
            </thead>
            <tbody>
              {DATASET_SOURCES.map((s) => (
                <tr key={s.what} style={{ borderBottom: '1px solid var(--rule)' }}>
                  <td className="px-3 py-1.5">{s.what}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{s.kind}</td>
                  <td className="px-3 py-1.5">{s.source}</td>
                  <td className="px-3 py-1.5" style={{ color: 'var(--muted)' }}>{s.licence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          Total ongoing cost of this data: <strong>nothing</strong>. There are no paid feeds and no
          API calls when you use the site — every figure is committed to the repository and bundled
          into the page. The raw source files are committed too, so the whole dataset can be rebuilt
          offline and can never change underneath a link someone already shared.
        </p>

        <h2>What this data cannot tell you</h2>
        <ul>
          <li>
            <strong>
              {NAMED_LOCAL.cities} cities carry their own published local income tax rate; smaller
              ones use their state&rsquo;s average.
            </strong>{' '}
            New York City, Yonkers, Philadelphia, Detroit, Columbus, Cincinnati, Cleveland,
            Pittsburgh, Louisville, Kansas City, St. Louis, Baltimore and Portland are transcribed
            from the levying authority, with the source recorded — {NAMED_LOCAL.rules} rules in
            all, because Portland has two. Every Indiana metro carries its counties&rsquo; rates
            weighted by population. What is left on an average is the smaller cities, where the
            average is much closer to the truth. A documented average is honest; a remembered city
            rate would not be.
          </li>
          <li>
            <strong>Buffalo, Rochester, Syracuse and Albany carry no local income tax</strong>{' '}
            — correctly. New York&rsquo;s statewide average is generated entirely by New York City and
            Yonkers, and applying it upstate would invent a tax that does not exist.
          </li>
          <li>
            <strong>Split metros keep metro-wide price levels.</strong> Rent, home value, property
            tax and vehicles are now the state part&rsquo;s own figures, but BEA publishes price
            parities for whole metros only, so those repeat across a metro&rsquo;s rows. Where the
            Census suppresses a state-part figure, that one figure falls back to the whole metro.
          </li>
          <li>
            <strong>Rural entries use statewide price levels.</strong> No federal agency publishes a
            rural-only price index, so &ldquo;Rest of Texas&rdquo; blends Texas cities back in and may
            overstate rural costs.
          </li>
          <li>
            <strong>Sales tax is not charged as its own line.</strong> The spending figures behind
            living costs already include the sales tax those households paid, so adding it again
            would charge it twice. The rates below are published for reference and nothing
            multiplies by them. The cost of that: two states at opposite ends of the rate table look
            identical here. See the{' '}
            <a href="/methodology#limitations">methodology</a> for why.
          </li>
          <li>
            <strong>Upkeep and home insurance do not scale with the house.</strong> Buyers are now
            charged for repairs, maintenance and insurance, but from a national figure adjusted for
            local service prices rather than from the price of the house. Florida and Louisiana
            premiums run at a multiple of the national average and this does not see that.
          </li>
          <li>
            <strong>Smaller towns and US territories are not covered.</strong> The federal price
            index only exists for metropolitan areas; territories have separate tax systems
            altogether. Rural fallbacks cover the former.
          </li>
          <li>
            <strong>The data lags.</strong> Prices and housing are 2024 figures, the most recent
            published. Tax rules are for 2026.
          </li>
        </ul>

        <h2 id="report">Found a number that looks wrong?</h2>
        <p>
          Please say so. Every figure here describes a whole area rather than a household — some are
          medians, some are averages, some are statutory rates — and the people best
          placed to catch one that has gone astray are the ones who live there and pay the actual
          bill. It is worth reporting even if you are not sure &mdash; a figure that surprises
          someone local is worth a second look either way.
        </p>
        <p>
          Tell me what you were looking at, what the figure said, and what you would have expected.
          If the answer turns out to be that the number is right and the reason is interesting, that
          is what the limitations above are for, and it will end up written down here.
        </p>
        <ReportProblem
          prompt="Two ways to reach me:"
          subject="the data page"
          datasetVersion={DATASET_VERSION}
          className="!text-sm"
        />
      </Prose>
    </PageShell>
  );
}
