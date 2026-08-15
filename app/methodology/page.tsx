import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell, Prose } from '@/components/page-shell';
import { ALL_STATE_CODES, formatUSD, stateRules } from '@/engine';
import { DEFAULT_SALARY } from '@/components/calculator';
import { ReportProblem } from '@/components/report-problem';
import { DATASET_VERSION } from '@/engine';
import { SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: `How it works — ${SITE_NAME}`,
  description:
    'The formula, the order of operations, every assumption, and everything this calculator gets wrong.',
};

/*
 * Built from the dataset, not typed out here. A hand-written list of what we
 * get wrong is a list that goes stale the first time somebody fixes one of
 * them, and a stale admission is worse than none — it claims an error that is
 * no longer there, or worse, stays silent about one that is.
 */
const STATES_WITH_GAPS = ALL_STATE_CODES.map((code) => stateRules(code))
  .filter((s) => s.modellingGaps.length > 0)
  .map((s) => ({ code: s.code, name: s.name, gaps: s.modellingGaps }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** States whose figures are last year's because this year's are not out. */
/*
 * COUNTS COME FROM THE DATA, NEVER FROM PROSE. Every number on this page that
 * describes coverage drifted at least once — "40 of 42" while the build said
 * 42, "only California itemises" while fourteen states did. A figure typed
 * into a sentence is a figure nobody updates.
 */
const TAXING = ALL_STATE_CODES.map((code) => stateRules(code)).filter((s) => s.hasWageIncomeTax);
const COVERAGE = {
  taxing: TAXING.length,
  ratesChecked: TAXING.filter((s) => s.ratesCheckedAgainstState).length,
  headOfHousehold: TAXING.filter((s) => s.headOfHouseholdBasis !== 'assumed-single').length,
  /*
   * States where a single parent gets something the single schedule does not.
   *
   * Rendered rather than written, because this one drifted twice: it was 17,
   * was raised to 24, and then Iowa, Wisconsin, Nebraska and Vermont were
   * added without it moving again. A sentence that UNDERSELLS the fix is still
   * a wrong sentence, and it is the harder kind to notice, because nobody
   * re-checks a number that flatters them less than the truth would.
   */
  ownHeadOfHousehold: TAXING.filter((s) => s.headOfHouseholdBasis !== 'single').length,
  itemising: TAXING.filter((s) => s.itemizedDeductions).length,
  earnedIncomeCredit: TAXING.filter((s) => s.earnedIncomeCredit).length,
};

const STATES_ON_PRIOR_YEAR = ALL_STATE_CODES.map((code) => stateRules(code))
  .filter((s) => s.priorYearFigures)
  .map((s) => ({ code: s.code, name: s.name, why: s.priorYearFigures as string }))
  .sort((a, b) => a.name.localeCompare(b.name));

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
          className="overflow-x-auto rounded border p-3 text-[0.8rem] leading-relaxed"
          style={{ borderColor: 'var(--rule)', background: 'var(--surface)', fontFamily: 'var(--font-mono)' }}
        >{`in your pocket  =  gross salary
                 −  federal income tax
                 −  state income tax
                 −  local income tax
                 −  Social Security and Medicare
                 −  state disability and paid leave, where the state charges it
                 −  rent + utilities, or mortgage + property tax + utilities
                 −  cars and transport
                 −  food, phone, healthcare, everything else

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
          <li className="my-1.5">
            Living costs, re-priced for the local area. These come first because a renter&rsquo;s
            gas and electricity are already inside their rent figure and a buyer&rsquo;s are not, so
            the housing step needs to be handed that slice before it can add itself up.
          </li>
          <li className="my-1.5">
            Housing — which produces your property tax and first-year mortgage interest.
          </li>
          <li className="my-1.5">
            Social Security, Medicare, and state disability where the state charges it.
          </li>
          <li className="my-1.5">State income tax.</li>
          <li className="my-1.5">
            Local income tax. Yonkers charges a percentage <em>of your state tax</em>, so it has to
            come after it.
          </li>
          <li className="my-1.5">
            Federal income tax — which uses steps 2 to 5, because state and property tax are
            deductible. That decides whether itemising beats the standard deduction, which changes
            what you owe.
          </li>
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
          <strong>That split is a convention, not a law of nature.</strong> We work out the new
          city at your current salary first, and call whatever is left the pay effect. Doing it the
          other way round — the pay rise first, then the city — gives different numbers for each
          half, though the same total. There is no single correct way to divide a change between
          two causes that happen at once. This is the order we chose, and it is the order the
          middle column of the table shows.
        </p>
        <p>
          One real exception: federal tax <em>can</em> differ between cities at the same salary, for
          people who itemise. State and property tax are deductible, so a high earner with a
          mortgage in New York pays less federal tax than an identical earner in Texas — but only
          up to a point. That deduction is capped at <strong>$40,400</strong> ($20,200 filing
          separately), and the cap itself shrinks above $505,000 of income down to a $10,000 floor.
          Both are applied here. Most households take the standard deduction and never see any of
          it.
        </p>

        <h2>Housing</h2>
        <p>
          Every housing field is pre-filled and editable. If you rent, we use your rent. If you own,
          we amortise a 30-year fixed mortgage, add property tax at the <strong>effective</strong>{' '}
          rate — what is actually paid, after assessment ratios, homestead exemptions and caps — and
          compute first-year interest for the itemisation test.
        </p>
        <p>
          <strong>Buying a house costs more than the mortgage and the tax on it.</strong> Roofs,
          boilers, gutters, a plumber, and the home insurance policy. The national statistics bundle
          all of that into one figure, and because this site throws away their housing number and
          rebuilds it from yours, that figure used to be thrown away with it. Buyers were paying
          nothing at all to keep the house standing.
        </p>
        <p>
          It is now charged: about <strong>$4,600 a year</strong> at $100,000 of income and{' '}
          <strong>$5,000</strong> at $200,000, reaching roughly <strong>$7,300</strong> only above
          $320,000. (Those were quoted as $4,000 and $7,300 until August 2026 — the first was in
          2024 money and the second was the top band&rsquo;s figure attached to the wrong income.) The published figure averages owners and
          renters together, and renters pay none of this, so it is divided by the share of
          households who actually own before it is used. Renters are charged nothing — their
          landlord pays for the roof.
        </p>
        <p>
          This is also where <strong>home insurance</strong> lives. The site used to say insurance
          was missing and call it the biggest remaining gap. That was the wrong shape: insurance is
          not a separate thing that was forgotten, it is one ingredient of a figure that was being
          discarded whole.
        </p>
        <p>
          <strong>Only part of a big mortgage earns a deduction.</strong> The interest write-off
          reaches the first <strong>$750,000</strong> of a loan, half that if you are married and
          filing separately. Borrow more and the extra interest is simply not deductible. This site
          used to deduct all of it, which in the expensive metros was a large error in the reader&rsquo;s
          favour: a single buyer in San Jose on $300,000 borrows about $1.3M at our default home
          price, and was being shown roughly $10,000 a year too little federal tax. At $500,000 it
          was around $18,000. Nothing changes for a normal home in a normal city — a Chicago buyer
          stays under the limit at every salary this site is built for.
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
          <strong>Buying works the same way.</strong> The metro median home value is what the
          median <em>owner</em> owns, so a high earner was being quoted a cheaper house than they
          would buy — and, because property tax is charged on the price, a smaller tax bill too.
          The starting price now scales with income as well.
        </p>
        <p>
          Both scalings are anchored to the local median <em>owner</em> or <em>renter</em> income,
          and this detail matters more than it sounds. A single national multiplier looks right
          until you apply it somewhere expensive: San Francisco&rsquo;s median home is already owned
          by high earners, so scaling it by &ldquo;what a $150,000 buyer purchases
          nationally&rdquo; put that household at $1.5m — a third <em>above</em> the local median,
          while earning <em>below</em> the local median owner. Anchoring locally makes the
          multiplier exactly 1.0 for the household the median actually describes, which is the only
          value it can correctly have.
        </p>
        <p>
          What stays national is the <em>elasticity</em> — how sharply housing spending rises with
          income, which is a behavioural regularity rather than a local fact. The local price is
          left completely untouched, so the difference between two cities, which is the one thing
          this page exists to measure, survives at full strength.
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

        <h2>State tax is not a small version of federal tax</h2>
        <p>
          States write their own rules and they are not always harsher. Three things this site
          used to get wrong, all of them in the same direction — against the reader:
        </p>
        <ul>
          <li>
            <strong>Eleven states take a disability or paid-leave contribution</strong> straight off
            the payslip, and none of it was counted. California&rsquo;s is the big one: 1.3% of
            every dollar you earn with <em>no ceiling at all</em>, which is $3,900 a year on
            $300,000. It is now charged, and where the IRS treats it as a state tax it reduces your
            federal bill too.
          </li>
          <li>
            <strong>A head of household is not a single person.</strong> We used to tax them as
            one. California publishes its own schedule and gives them the married standard
            deduction; Maryland puts them on the married table outright; Kansas quietly adds a
            second exemption on top of the first. We have now read the actual form for{' '}
            <strong>every one of the {COVERAGE.taxing} states that tax wages</strong>, and{' '}
            {COVERAGE.ownHeadOfHousehold} of them give a single parent something the single
            schedule does not. Every one of those was being charged too much — from $75 a year in
            Alabama to $4,046 in Hawaii, and never the other way.
          </li>
          <li>
            <strong>Allowances that shrink as you earn more.</strong> Several states quietly take
            back the deduction or exemption they give you, and we used to hand it out at every
            income. Wisconsin&rsquo;s disappears completely by $136,000. Connecticut&rsquo;s is gone
            by $45,000. Colorado&rsquo;s is the harshest shape of the lot &mdash; above $300,000 the
            standard deduction drops from $16,100 to a $1,000 floor in a single step, worth about
            $660 a year for a single filer and $1,330 for a couple. South Carolina, Maine,
            Minnesota, Maryland, Rhode Island and Alabama all do a version of it, and Oregon and
            Utah do it to a credit rather than to an allowance. These now shrink the way the state says they do — which means
            the tax we show for higher earners went <em>up</em>, and that is the point: the answer
            was flattering places it should not have been.
          </li>
          <li>
            <strong>Seven states changed the law after our tax table was printed.</strong> The
            table comes out once a year, in February, and states pass laws all spring. South
            Carolina rewrote its income tax outright. Arkansas, West Virginia and Utah cut their
            rates back to January. Georgia moved three things at once. Every one of them left us
            charging too much, and every one was found only by opening the state&rsquo;s own
            publication and comparing it line by line.
          </li>
          <li>
            <strong>California lets you itemise on the state return</strong> whether or not you did
            federally, with no cap on property tax and a mortgage limit of $1,000,000 rather than
            $750,000. For a San Jose buyer that is around $6,800 a year. We only count the two
            things this site knows — property tax and mortgage interest — so if you also give to
            charity or have large medical bills, you will do better than this says.
          </li>
        </ul>
        <p>
          <strong>
            Every state&rsquo;s rates and allowances have now been read off that state&rsquo;s own
            publication — all {COVERAGE.ratesChecked} of the {COVERAGE.taxing} that tax wages.
          </strong>{' '}
          Twenty-four of them were wrong. Ten are on last year&rsquo;s published figures because
          the state has not released this year&rsquo;s, and those are named below. The{' '}
          <Link href="/data">data page</Link> shows, for every location, the date its state was
          checked and names the document it was checked against.
        </p>
        <p>
          <strong>{COVERAGE.itemising} states</strong> now let a homeowner claim mortgage interest
          and property tax on the state return, and we calculate all of them. Three more do
          something different with the same idea: New Jersey relieves property tax without
          itemising at all — the only relief here a renter can claim, at 18% of rent — Wisconsin
          gives a credit for mortgage interest while ignoring property tax entirely, and Illinois
          credits 5% of your property tax until your income passes $250,000 &mdash; $500,000 for a
          couple &mdash; when it stops dead.
        </p>
        <p>
          The &ldquo;What this gets wrong&rdquo; list below names every state with a rule we know
          about and do not yet model, and says which way each one runs.
        </p>

        <h2>What year the dollars are in</h2>
        <p>
          Today&rsquo;s. Every cost figure behind this site was measured in <strong>2024</strong>,
          the most recent year the federal surveys cover, but the tax rules are 2026 and the salary
          you type is 2026. Subtracting old costs from a current salary made the money left over
          look better than it is.
        </p>
        <p>
          So the 2024 figures are brought forward to current prices. Four separate official
          measures, because they have not moved together since 2024: <strong>rent</strong> is up
          7.1%, <strong>everything you buy</strong> 6.1%, and <strong>house prices</strong> 3.0%.
          Tax rules are already current and are left alone, and so is your salary.
        </p>
        <p>
          This matters more than 6% sounds. Money left over is what survives after subtracting a
          big number from another big number, so an error in the costs lands almost undiluted on
          the answer: for a Chicago renter on $100,000 it was 13% of the result, and 27% for a
          buyer.
        </p>

        <h2>Where your gas and electricity bill lives</h2>
        <p>
          In the housing line, not in the spending one — and this is worth a minute because it was
          wrong for a long time.
        </p>
        <p>
          The rent figures come from the Census, and the Census measures{' '}
          <strong>gross rent</strong>: the rent itself <em>plus</em> the electricity, gas, water,
          sewer and heating the tenant pays. So a renter&rsquo;s energy bill is already inside the
          rent number on this page. This site used to subtract a full national utilities bill on top
          of that as well, charging renters for the same thing twice — for a couple, around $2,700 a
          year in Chicago and $4,000 in New York. A family of four is charged more of these and one
          person less, because the bill follows the household, so the double count was bigger for a
          family: near $3,700 and $5,700.
        </p>
        <p>
          A mortgage covers no such thing, so buyers are charged those utilities separately. Either
          way the line reads <strong>rent + utilities</strong> or{' '}
          <strong>mortgage + utilities</strong>, and either way it is counted once.
        </p>
        <p>
          The phone bill is the exception. It sits in the same national statistic as gas and
          electricity but it is not part of anybody&rsquo;s rent, so it stays with the ordinary
          spending below. It also gets a different price index: what you pay for electricity is
          intensely local, while a mobile contract costs much the same everywhere.
        </p>

        <h2>Everything else you spend</h2>
        <p>
          Food, healthcare, the phone bill and the rest come from what US households at your income
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
          <li>
            <strong>It slides smoothly between income bands.</strong> The survey publishes nine
            income bands. Reading your band off the bottom of the one you fall into made spending
            jump the moment your pay crossed a line: a $1 raise from $199,999 to $200,000 took
            $14,839 off what you had left, and moved the gap between two cities by $1,119. Each
            band&rsquo;s figures are now placed at the average income of the households in it, and
            anything in between is read off the line joining them. Nothing is invented — the same
            nine published points, read at the income they were measured at.
          </li>
        </ul>

        <h2>Sales tax</h2>
        <p>
          There is no sales tax line, and there should not be one. The spending figures above are
          what households actually handed over at the till, and the government agency that collects
          them says so plainly: an expenditure is the transaction cost{' '}
          <em>including sales and excise tax</em>. Where somebody reported a price without the tax,
          it gets added before the figures are published.
        </p>
        <p>
          This site used to charge sales tax again on top of those figures — once inside the grocery
          bill, once beside it. That was wrong and it is gone.
        </p>
        <p>
          What is lost by removing it: the basket carries whatever sales tax the surveyed households
          paid, which is a national blend. So moving from Oregon, which charges none, to Louisiana,
          which charges the most at 10.11%, no longer shows any sales tax difference at all. Doing that
          properly means taking the average out of the basket and putting the local rate back in,
          and the survey does not publish how much is in there per category. A missing difference of
          a few hundred dollars is a smaller error than charging the whole thing twice, so this line
          waits for data that can carry it. The published rates are still in the{' '}
          <a href="/data">data browser</a>.
        </p>

        <h2>What the form starts you on</h2>
        <p>
          The salary box opens on <strong>{formatUSD(DEFAULT_SALARY)}</strong>. The published
          median for someone working full time all year is <strong>$61,657</strong>, from the same
          Census release as everything else here (ACS 2024, table S2001), and like every other
          2024 figure on this site it is brought forward to today&rsquo;s money &mdash; which is
          where the difference comes from. It was $150,000 until August 2026, which is roughly the 90th percentile of
          American full-time earnings.
        </p>
        <p>
          That mattered more than a starting number usually does, because rent and home price both
          scale with income: opening on a salary most visitors will never earn quoted them a house
          and a rent to match, and made every figure on the page a well-paid person&rsquo;s answer
          until they noticed. Median rather than mean, because earnings have a long tail at the
          top and the mean describes almost nobody.
        </p>

        <h2>Credits, and who counts as an earner</h2>
        <p>
          Two federal credits are applied. The <strong>Child Tax Credit</strong> is $2,200 per
          child under 17, partly refundable, phasing out above $200,000 (or $400,000 filing
          jointly). The <strong>Earned Income Tax Credit</strong> is fully refundable and worth up
          to $8,231 &mdash; for a low-income family with children it is the largest single figure
          in the whole federal calculation. It was missing entirely until August 2026, which
          understated what a household on around $18,000 with two children actually has by
          $7,316 a year.
        </p>
        <p>
          The children question asks for children <em>under 17</em> because that is the Child Tax
          Credit&rsquo;s own test. The EITC counts a slightly wider group &mdash; under 19, or
          under 24 in full-time education &mdash; so a household with an older teenager is
          credited less here than it is owed, never more. Living costs use the same number, so
          that household&rsquo;s grocery bill is understated too.
        </p>
        <p>
          Married couples are asked <strong>how many of them earn</strong>. Social Security is
          capped at the first $184,500 of each <em>person&rsquo;s</em> wages, so a household on
          $300,000 owes $18,600 when two people earn it and $11,439 when one does. The engine used
          to apply that cap once to the household total, understating two-earner couples by
          $7,161. Where two earn, the split is assumed to be even; a lopsided split owes less.
        </p>
        <p>
          What is still not asked: your age, whether each child meets the residency and
          relationship tests, and whether you have investment income. The childless EITC therefore
          assumes you are 25 to 64 (it is worth at most $664), children are assumed to qualify,
          and the $12,200 investment-income disqualification never bites. Around thirty states add a
          credit of their own on top; {COVERAGE.earnedIncomeCredit} of them are calculated here,
          and the list below says which are not and why.
        </p>

        <h2>Metro areas that cross a state line</h2>
        <p>
          43 of the 438 locations here straddle at least one state border. &ldquo;New
          York&ndash;Newark&ndash;Jersey City&rdquo; is New York and New Jersey. Philadelphia is
          Pennsylvania, New Jersey, Delaware and Maryland. Washington is DC, Virginia, Maryland and
          West Virginia. Portland is Oregon and Washington &mdash; one of those has an income tax
          and no sales tax, the other the reverse.
        </p>
        <p>
          For those metros the calculator asks <strong>which state you live in</strong>, and that
          answer drives the state income tax, the sales tax rate, and which city income taxes can
          reach you. Until August 2026 it did not ask: each metro was reduced to one state, so
          someone in Newark was quoted New York&rsquo;s income tax <em>and</em> New York
          City&rsquo;s resident tax &mdash; about $6,100 a year too much at $150,000, enough to
          reverse the verdict.
        </p>
        <p>
          Housing follows the state as well. The Census publishes every table used here at summary
          level 311 &mdash; &ldquo;metropolitan statistical area &rsaquo; state (or part)&rdquo;
          &mdash; so a Newark household is quoted New Jersey&rsquo;s figures rather than the whole
          metro&rsquo;s. The difference is not small: median home value is $512,300 on the New
          Jersey side against $684,700 on the New York side, either side of the $614,200 metro
          figure that used to be quoted to both. The Indiana part of the Chicago metro is $1,142
          rent against $1,453 in Illinois.
        </p>
        <p>
          Cars move too, and that one surprises people. The New York part of that metro averages
          0.486 vehicles per adult against 0.596 across the whole metro, because the five boroughs
          outweigh the suburbs &mdash; so a New York-side household is now started at no car rather
          than one. Change it if you have one.
        </p>
        <p>
          A state part is a smaller sample than its metro, so the Census suppresses individual
          figures in it more often. Where that happens the whole metro&rsquo;s number is used for
          that <em>one figure</em>, rather than throwing away the state&rsquo;s good figures
          alongside the missing one. Price levels stay metro-wide throughout: BEA publishes those
          only for whole metros.
        </p>

        <h2>Pack, stay, or too close to call</h2>
        <p>
          The one-word verdict is the sign of that final difference, and nothing more. It is about
          money only &mdash; this calculator knows nothing about the job, the people, or whether you
          want to live there.
        </p>
        <p>
          There is a third answer, and it is the honest one more often than you would think. Every
          cost here is a <em>median</em> for the local area, and real households scatter widely
          around every one of them. So when the difference is smaller than{' '}
          <strong>1.5% of the salary you are paid today</strong> &mdash; $2,250 a year on $150,000
          &mdash; neither word lights up: the page says <em>too close to call</em> and shows you the
          figure anyway.
        </p>
        <p>
          A share rather than a fixed amount, because the uncertainty scales with the household: a
          $300 gap means something different on $50,000 than on $400,000. A share of{' '}
          <em>gross salary</em> rather than of leftover money, because leftover is at or below zero
          for a great many real households and a percentage of zero is not a threshold at all. And
          the salary you have now rather than the one on offer, so the bar does not move every time
          you try a different number in the box you came here to experiment with.
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

        <h3>State by state</h3>
        <p>
          Each of these is a rule the state really has that we do not calculate. They are written
          out here rather than summarised, and each one says which way it runs — whether it means
          we are charging you too much or too little. This list is generated from the same data the
          calculator uses, so it cannot quietly fall out of date.
        </p>
        <ul>
          {STATES_WITH_GAPS.map(({ code, name, gaps }) => (
            <li key={code}>
              <strong>{name}.</strong> {gaps.join(' ')}
            </li>
          ))}
        </ul>
        <p>
          Every other state has been read off its own publication with nothing left outstanding.
          Ten of the {COVERAGE.taxing} are checked against the state&rsquo;s most recent figures
          rather than a 2026 document, because those states have published nothing for 2026 — they
          are named just below.
        </p>

        <h3>States still on last year&rsquo;s numbers</h3>
        <p>
          States publish their new brackets and allowances on their own timetable, and many do not
          until the tax forms come out — which for 2026 means late this year or early next. This
          calculator has to answer today, so where a state has not published in full we fall back
          to its <strong>last published figures</strong> for whatever is missing, and say so here.
          It is rarely the whole state: Oklahoma&rsquo;s 2026 rates come from the enacted law and
          only its allowances are last year&rsquo;s, Oregon&rsquo;s brackets come from its own 2026
          withholding formulas, and Rhode Island&rsquo;s figures are 2026 but off a form the state
          published with a draft watermark. Each entry below says exactly which figures are
          affected.
        </p>
        <p>
          Prices rise, so last year&rsquo;s bands are slightly narrow and last year&rsquo;s
          allowances slightly small. That means these figures show{' '}
          <strong>a little more tax than you will really owe</strong>, not less — the error runs
          against us, not against you.
        </p>
        <ul>
          {STATES_ON_PRIOR_YEAR.map(({ code, name, why }) => (
            <li key={code}>
              <strong>{name}.</strong> {why}
            </li>
          ))}
        </ul>
        <ul>
          <li>
            <strong>Some local income taxes still use state averages.</strong> New York City,
            Yonkers, Philadelphia, Detroit, Columbus and Cincinnati carry their own published
            rates, and you are asked whether you live inside the city, because a metro is much
            larger than the city at its centre. Cleveland, Pittsburgh, Louisville, Kansas City,
            St. Louis, Baltimore and Portland now carry their own rates too, and every Indiana
            metro carries its counties&rsquo; rates weighted by population. What is left on a state
            average is the smaller cities, where the average is much closer to the truth.
          </li>
          <li>
            <strong>Where two people earn, the split is assumed to be even.</strong> The form asks
            for one household salary, so when the maths needs to know what each person earns it
            halves the total. This matters twice: the Social Security cap is a per-person limit, and
            a couple who file separately file two returns that are each worked out on their own
            income. Two equal earners is the case this gets exactly right. A lopsided split puts
            more of the total under one person&rsquo;s Social Security cap and owes less there, and
            climbs one person&rsquo;s income tax brackets faster and owes more there.
          </li>
          <li>
            <strong>Filing separately with children puts them all on one return.</strong> A child
            is claimed by one parent or the other, never halved, so the model gives them all to the
            same person, which is also how it works in life — one parent claims a child, not half
            of one. Where the child credit is being withdrawn at higher incomes this can work out
            slightly cheaper than splitting them, by about $1,900 on a combined $500,000. We had
            that the wrong way round here until August 2026.
          </li>
          <li>
            <strong>Sales tax differences between states are not shown.</strong> The spending
            figures already contain the sales tax those households paid, so charging it again would
            double it — but what they contain is a national blend. Two states at opposite ends of
            the rate table therefore look the same on this line, which understates the gain from
            moving somewhere that charges less and the cost of moving somewhere that charges more.
            Worth a few hundred dollars a year at most.
          </li>
          <li>
            <strong>
              State low-income credits are modelled in {COVERAGE.earnedIncomeCredit} states, not
              all of them.
            </strong>{' '}
            Around thirty states add their own on top of the federal credit, usually as a share of
            it. Where two independent sources agreed on the figure it is now counted; where they
            disagreed, or the state uses its own formula rather than a share — California,
            Minnesota and Washington all do — it is still missing. New York City&rsquo;s own credit
            is not counted either.
          </li>
          <li>
            <strong>Children are assumed to qualify.</strong> The form asks how many are under 17
            and takes the answer at face value; it never asks about residency, relationship or a
            Social Security number, all of which the credits actually require.
          </li>
          <li>
            <strong>Alabama, Missouri and Oregon let you deduct federal tax</strong> from state
            taxable income. Oregon&rsquo;s is calculated. Alabama&rsquo;s runs through its own
            deduction schedule and Missouri&rsquo;s is a percentage that reaches zero above
            $125,000 — neither is calculated, and both states say so on their own line in the list
            above.
          </li>
          <li>
            <strong>Income-based phase-outs</strong> are calculated in eleven states — the
            deduction or exemption shrinking in nine, and a credit shrinking in Oregon and Utah.
            Where a state has one we do not calculate, that state says so in the list above, along
            with which way it runs.
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
            <strong>Indiana&rsquo;s county tax is charged from day one, and really is not.</strong>{' '}
            Indiana fixes which county taxes you on 1 January and does not change it when you move,
            so somebody moving into Indiana owes no county tax at all in their first year unless
            they already worked there. That first year is not modelled here, and Indiana&rsquo;s
            county rates run from 1.21% to 2.35% — so a move to the Indianapolis area is shown
            roughly $1,200 a year too expensive at the default salary and about $2,700 at $150,000.
            From the second year on the figure is right.
          </li>
          <li>
            <strong>Upkeep does not scale with what the house is worth.</strong> Repairs and
            insurance are now charged to buyers — see below — but from a national figure adjusted
            for local service prices, not from the price of the house you typed in. A $1.6M house
            really does cost more to look after than a $500k one, and this does not fully capture
            that. It leans towards making expensive cities look cheaper than they are.
          </li>
          <li>
            <strong>The suggested number of cars is a whole number, and it jumps.</strong> We start
            you at the local average vehicles per adult, rounded. The New York side of the New York
            metro averages 0.486 per adult, so a single person there is offered no car at all; everywhere else in the country
            is offered at least one. A car costs several thousand a year, so a small difference in
            that average swings a big number. It is the honest thing to show — you own a car or you
            do not — and the field is yours to change, but it is worth knowing the edge is there.
          </li>
          <li>
            <strong>Hotels are priced nationally.</strong> A hotel on a trip is bought wherever the
            trip goes, not where you live, so no local price level is applied to it. Second homes
            are in the same figure and that reasoning suits them less well.
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
            <strong>Averages are not you.</strong> And they are not all the same kind of number
            either. Housing figures are <em>medians</em> for the local area. Spending and car
            ownership are <em>averages</em>, which sit higher than the median wherever a few large
            spenders pull them up. Price levels are <em>index numbers</em>, not dollars. The{' '}
            <Link href="/data" className="underline underline-offset-4" style={{ color: 'var(--accent)' }}>
              data page
            </Link>{' '}
            labels every one. Your rent, your car and your grocery bill will differ from all of
            them, which is why almost every field is editable.
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
