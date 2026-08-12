import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell, Prose } from '@/components/page-shell';
import { ReportProblem } from '@/components/report-problem';
import { DATASET_VERSION } from '@/engine';

export const metadata: Metadata = {
  title: 'How it works — LessTaxes',
  description:
    'The formula, the order of operations, every assumption, and everything this calculator gets wrong.',
};

export default function MethodologyPage() {
  return (
    <PageShell
      title="How it works"
      standfirst="The whole calculation, the order it runs in, and — at the bottom — everything it gets wrong. If a number here surprises you, this page should explain why."
    >
      <Prose>
        <h2>The question</h2>
        <p>
          Most comparisons stop at income tax, which is why they so often mislead. &ldquo;Texas has
          no income tax&rdquo; is true and frequently irrelevant: Austin homes cost more than
          Chicago homes, so the median Austin owner pays{' '}
          <strong>more</strong> property tax than the median Chicago owner despite a lower rate. A
          move can also mean going from no car to two, which no cost-of-living index captures.
        </p>
        <p>
          So this site computes one thing: <strong>what you actually have left</strong> at the end of
          the year, in each city, and the difference between them.
        </p>

        <pre
          className="overflow-x-auto rounded border p-3 text-[0.75rem] leading-relaxed"
          style={{ borderColor: 'var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-mono)' }}
        >{`in your pocket  =  gross salary
                 −  federal income tax
                 −  state income tax
                 −  local income tax
                 −  Social Security and Medicare
                 −  housing (rent, or mortgage + property tax)
                 −  cars and transport
                 −  food, utilities, healthcare, everything else
                 −  sales tax on what is taxable

answer          =  in your pocket THERE  −  in your pocket HERE`}</pre>

        <p>
          The answer can be negative, and often is. That is the point — a cheaper city and a pay cut
          pull in opposite directions, and only the arithmetic settles it.
        </p>

        <h2>The order matters</h2>
        <p>
          Each step feeds the next, and getting the sequence wrong is the most common way a
          relocation calculator produces a confident wrong answer.
        </p>
        <ol className="ml-5 list-decimal">
          <li className="my-1.5">Social Security and Medicare, from salary alone.</li>
          <li className="my-1.5">
            Housing — which produces your property tax and first-year mortgage interest.
          </li>
          <li className="my-1.5">State income tax.</li>
          <li className="my-1.5">
            Local income tax. Yonkers charges a percentage <em>of your state tax</em>, so it has to
            come after it.
          </li>
          <li className="my-1.5">
            Federal income tax — which uses steps 2 to 4, because state and property tax are
            deductible. That decides whether itemising beats the standard deduction, which changes
            what you owe.
          </li>
          <li className="my-1.5">Living costs, re-priced for the local area.</li>
          <li className="my-1.5">Sales tax on the taxable part of that spending.</li>
        </ol>
        <p>
          Computing federal tax first — the obvious way to write it — would ignore the deduction and
          overstate federal tax in every high-tax state.
        </p>

        <h2>Federal tax and Social Security are the same everywhere</h2>
        <p>
          They are federal, so they do not vary by state. If you see them change between two cities
          in your result, it is because the <strong>salary</strong> changed, not the location. The
          detailed table shows a middle column at your current salary precisely so this is visible.
        </p>
        <p>
          One real exception: federal tax <em>can</em> differ between cities at the same salary, for
          people who itemise. State and property tax are deductible, so a high earner with a
          mortgage in New York pays less federal tax than an identical earner in Texas. Most
          households take the standard deduction and never see this.
        </p>

        <h2>Housing</h2>
        <p>
          Every housing field is pre-filled and editable. If you rent, we use your rent. If you own,
          we amortise a 30-year fixed mortgage, add property tax at the <strong>effective</strong>{' '}
          rate — what is actually paid, after assessment ratios, homestead exemptions and caps — and
          compute first-year interest for the itemisation test.
        </p>
        <p>
          The rent we start you with is <strong>sized to your household and scaled to your
          income</strong>, and both parts matter more than they sound.
        </p>
        <ul>
          <li>
            <strong>Size.</strong> The obvious figure to use is the metro&rsquo;s median rent, and
            it was the wrong one: it is a median across every rented unit in the area, so a single
            person and a family of four were quoted exactly the same rent. We now use the local
            median for the number of bedrooms your household implies — one for the adults, another
            for every two children.
          </li>
          <li>
            <strong>Income.</strong> That median is paid by a household earning roughly the local
            median income, and renters earn less than that. On a $150,000 salary it worked out at
            11% of pay in Chicago, which nobody at that income pays. So the local figure is scaled
            by a national curve built from what renters in each income band actually spend on rent.
            The curve crosses 1.0 near $55,000 — about the typical renter&rsquo;s income — and
            rises more slowly than income above it, because housing takes a falling share of a
            rising income.
          </li>
        </ul>
        <p>
          The curve is deliberately <em>national</em> rather than per-metro. Rent burden varies
          much less between cities than rent does — 14.4% in Chicago against 15.5% in Austin, while
          the rents themselves differ by a fifth — so anchoring each city to its own burden would
          have quietly flattened the housing difference between them, which is the one thing this
          page exists to measure. The local median sets the price; the national curve sets the level.
        </p>
        <p>
          Mortgage <strong>principal counts as money out</strong>. It builds equity rather than
          vanishing, but the headline is cash in your pocket, and principal is cash that left it.
          This makes owning look slightly worse than it is in wealth terms.
        </p>

        <h2>Cars</h2>
        <p>
          This is the piece most comparisons miss. A cost-of-living index measures <em>prices</em>,
          not <em>quantities</em>. Moving from Manhattan to Austin does not make your car cheaper —
          it makes you buy two. Petrol being cheaper in Texas is irrelevant if you went from zero
          cars to a pair.
        </p>
        <p>
          So transport is built from a car <strong>count</strong>, not a price index. The default
          comes from how many vehicles per adult a place actually has, multiplied by the adults in
          your household, and you can change it. Each car costs what US households actually spend
          per vehicle — purchase, fuel, insurance, maintenance and finance charges — at your income
          level.
        </p>

        <h2>Everything else you spend</h2>
        <p>
          Food, utilities, healthcare and the rest come from what US households at your income
          actually spend, then re-priced for each city using federal regional price levels.
        </p>
        <p>Two adjustments are worth knowing about, because both were bugs before they were features:</p>
        <ul>
          <li>
            <strong>Your basket travels with you.</strong> It is chosen once, from your current
            income, and simply re-priced in the new city. Choosing it separately per city let the
            survey&rsquo;s income-band boundaries leak into the answer, producing a phantom
            five-figure &ldquo;saving&rdquo; on food and healthcare that was an artefact of where the
            statisticians drew a line.
          </li>
          <li>
            <strong>It is scaled to your household size.</strong> Households in the $150k–$200k band
            average 3.1 people, so a single person was being charged for a family of three. Scaling
            uses the square-root rule that the OECD uses: needs grow with household size, but not
            proportionally — two people do not need two fridges.
          </li>
        </ul>

        <h2>Sales tax</h2>
        <p>
          The taxable base is much smaller than total spending. Forty states exempt groceries and
          several more tax them at a reduced rate; services are broadly untaxed everywhere. So food
          splits — restaurant meals at the ordinary rate, groceries at whatever the state does to
          food. Expect this line to be small: a few hundred dollars a year, not thousands.
        </p>

        <h2>Share links</h2>
        <p>
          A link carries every input <em>and the version of the data it was made with</em>. When the
          underlying federal figures are refreshed, links already shared keep computing against the
          data they were created with. Whoever opens your link sees the numbers you saw, not
          different ones. Nothing is stored on a server — there is no database, and no account.
        </p>

        <h2 id="limitations">What this gets wrong</h2>
        <p>
          Every model is wrong somewhere. These are the places this one is wrong that we know about.
        </p>
        <ul>
          <li>
            <strong>Home and renters insurance are not included at all.</strong> No per-state
            dataset is loaded yet, so ownership is understated everywhere — and badly in Florida and
            Louisiana, where premiums are a multiple of the national average. This is the largest
            known gap.
          </li>
          <li>
            <strong>Local income tax outside New York City uses state averages.</strong>{' '}
            Philadelphia, Columbus, Detroit, Louisville, Kansas City and Portland all levy more than
            their state average.
          </li>
          <li>
            <strong>Social Security is capped once per household, not per worker.</strong> For a
            couple who each earn well, this understates what they pay. It is federal, so it mostly
            cancels out of the comparison.
          </li>
          <li>
            <strong>Alabama, Missouri and Oregon let you deduct federal tax</strong> from state
            taxable income. Not modelled — it is circular and needs solving iteratively.
          </li>
          <li>
            <strong>Head-of-household filers use each state&rsquo;s single schedule</strong>, because
            most states publish only single and joint. This is conservative: it never invents a
            better result than reality.
          </li>
          <li>
            <strong>Income-based phase-outs</strong> of state deductions, exemptions and credits are
            not modelled. They mainly affect high earners.
          </li>
          <li>
            <strong>Only wage income.</strong> No investment income, no self-employment, no rental
            income, no equity compensation.
          </li>
          <li>
            <strong>Moving itself is free here.</strong> This is a steady-state annual comparison —
            movers, closing costs and deposits are not counted.
          </li>
          <li>
            <strong>Home prices are not adjusted for income the way rents are.</strong> If you buy,
            the starting figure is still the metro&rsquo;s median home value, which understates
            what a high earner buys — and property tax is computed from it, so that is understated
            too. The rent path has been fixed and the ownership path has not.
          </li>
          <li>
            <strong>The top income band is open-ended.</strong> The Census publishes rent burden
            for &ldquo;$100,000 or more&rdquo; as a single group, so the rent curve is anchored at
            $150,000 and extrapolated above it. Expect it to be roughest for very high earners.
          </li>
          <li>
            <strong>Bedrooms are inferred, not asked.</strong> Two adults are assumed to share a
            room and children to pair up. If you rent more space than that, or less, the rent field
            is yours to change.
          </li>
          <li>
            <strong>Averages are not you.</strong> Every figure is a local median. Your rent, your
            car, your grocery bill will differ. That is why almost every field is editable.
          </li>
        </ul>

        <p>
          The figures themselves, and where each comes from, are on the{' '}
          <Link href="/data" className="underline underline-offset-4" style={{ color: 'var(--accent)' }}>
            data page
          </Link>
          .
        </p>

        <h2>Think something here is wrong?</h2>
        <p>
          This list is not finished, and it is not meant to be &mdash; every item on it got there
          because someone noticed. If a number looks off for a place you know, or an assumption on
          this page does not match how your household actually works, that is worth telling me about
          even if you are not certain. A model is only corrected by the people it gets wrong.
        </p>
        <ReportProblem
          prompt="Two ways to reach me:"
          subject="the methodology page"
          datasetVersion={DATASET_VERSION}
          className="!text-sm"
        />

        <p style={{ color: 'var(--muted)' }}>
          <strong>This is not financial, tax or legal advice.</strong> It is an estimate built from
          public data to help you think, not a substitute for someone who knows your situation.
        </p>
      </Prose>
    </PageShell>
  );
}
