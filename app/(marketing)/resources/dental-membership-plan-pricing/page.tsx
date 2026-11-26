import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, ScriptCard } from '../guide-ui'
import { pageMetadata } from '@/lib/marketing/seo'

const guide = getResourceGuide('dental-membership-plan-pricing')

/**
 * RE-READ 2026-11-26 AGAINST THE LIBRARY'S OWN CONTENT LAW. The worked example
 * was always labelled illustrative, and then the lines around it said what
 * practices "commonly" charge, what hygiene costs "in most practices" and where
 * a price "commonly lands" — market facts with no source. They are now what
 * they always were: one example's choices, said as choices. The example's own
 * arithmetic was also inconsistent (a target band of $280–$345 a year beside a
 * "landing spot" of $350–$420); it has one price now, inside its own floor and
 * ceiling. And the legal note stopped describing what "several US states"
 * require, which nobody here had read. `tests/marketing/sourced-guides.test.tsx`.
 */

export const metadata = pageMetadata({
  title: 'Dental membership plan pricing: what to include & what to charge',
  description: guide?.description ?? '',
  path: '/resources/dental-membership-plan-pricing',
})

export default function MembershipPricingGuide() {
  if (!guide) notFound()
  return (
    <GuideShell guide={guide}>
      <GuideP>
        An in-house membership plan does two jobs: it gives your uninsured patients a
        reason to stay on a hygiene schedule, and it turns unpredictable “maybe next
        year” visits into subscription revenue you can plan a practice around. The
        catch is pricing. Price it by copying a neighbor and you’ll either scare
        patients off or quietly deliver dentistry below cost. Here’s the arithmetic.
      </GuideP>

      <GuideH2>What goes in the plan</GuideH2>
      <GuideP>The standard adult plan shape, and the one patients understand fastest:</GuideP>
      <GuideList
        items={[
          <><strong>Two cleanings a year</strong> (prophylaxis — perio maintenance belongs in a separate, higher tier).</>,
          <><strong>Two exams</strong>, usually with the cleanings.</>,
          <><strong>Routine X-rays</strong> — bitewings annually, a panoramic on the cycle you already use.</>,
          <><strong>A flat discount on everything else</strong> — one percentage off your fee schedule for fillings, crowns and elective work. The example below uses 15%.</>,
        ]}
      />
      <GuideP>
        Resist the urge to add more. Every extra inclusion is a cost you now owe every
        member whether they use it or not, and a plan that needs a comparison table to
        explain is a plan the front desk can’t sell in one sentence.
      </GuideP>

      <GuideH2>The math: price from your cost, not their fee</GuideH2>
      <GuideP>
        Work out what the included care actually costs you to deliver, then price above
        it. The numbers below are illustrative — run them with your own fee schedule and
        your own hourly costs.
      </GuideP>
      {/* `figures`, not `script` — this is a column of arithmetic held
          together by leader dots, and it only lines up in a monospace face
          (`BRAND.md` Part 4: mono is for any number the reader is meant to
          compare). It has been shipping in a proportional one. */}
      <ScriptCard label="Worked example (illustrative numbers — use your own)" kind="figures">
        {`What a member receives per year, at retail:
  2 cleanings ................ 2 × $120 = $240
  2 exams .................... 2 × $60  = $120
  Bitewing X-rays ............ 1 × $70  = $70
  Retail value ............... $430

What it costs you to deliver (chair time + staff + materials):
  Work it out from your own numbers.
  This example uses .......... $220

The band you can price in:
  Floor — your delivery cost ......... $220/yr
  Ceiling — paying as they go ........ $430/yr
  This example picks ................. $29/mo ($348/yr)

The member's story: "my checkups for less than paying as I go,
plus 15% off anything else — and no insurance paperwork."`}
      </ScriptCard>
      <GuideList
        items={[
          <><strong>The floor is your delivery cost.</strong> Below that you’re paying patients to attend. Above retail, nobody joins — the plan must be visibly cheaper than paying as they go.</>,
          <><strong>Decide what the discount is for.</strong> A percentage off restorative work lowers the price of the treatment a member has been putting off. Whether that brings in more than it gives away is a number to watch in your own practice, not one to assume.</>,
          <><strong>Family pricing:</strong> a lower add-on rate for each additional member, with child plans priced separately. A household on one subscription has one renewal to keep.</>,
        ]}
      />

      <GuideH2>Monthly vs annual</GuideH2>
      <GuideP>
        Offer both. Monthly (card on file, auto-renewing) is the easier yes: a small
        monthly decision gets made, a large annual one gets postponed. Annual, with a
        month free, rewards the committed and brings the cash forward. Whichever they pick, auto-renewal
        is the whole point: a plan someone must remember to rejoin is a plan they quietly
        leave.
      </GuideP>

      <GuideH2>The pitfalls that actually bite</GuideH2>
      <GuideList
        items={[
          <><strong>Never stack the plan with insurance.</strong> The plan is for the uninsured and under-insured; say so in the terms. Members with coverage should use the coverage.</>,
          <><strong>Don’t discount below lab cost</strong> on lab-heavy work — a member discount on a crown can eat the margin whole. You can cap the discount for lab cases; decide on purpose either way.</>,
          <><strong>Put the renewal date to work.</strong> The renewal email is a recall message wearing a receipt — “your plan renewed, let’s book your first cleaning of the year” fills January.</>,
          <><strong>Track usage.</strong> A member who pays and never comes is churn you haven’t met yet. Unused benefits at month nine deserve a friendly nudge, not a shrug.</>,
        ]}
      />
      <GuideNote>
        The legal caveat, plainly: whether and how an in-house dental plan is regulated
        depends on your state, and we have not read the rules of any of them. Before you
        launch, ask your state dental board, or have a healthcare attorney read your
        terms. This guide is arithmetic, not legal advice.
      </GuideNote>

      <GuideH2>Selling it in one sentence</GuideH2>
      <ScriptCard label="The front-desk script">
        {`“Since you don’t have dental insurance — we have an in-house plan that covers both cleanings, your exams, and X-rays for {price} a month, plus {discount}% off anything else. Want me to add you and book your first cleaning now?”`}
      </ScriptCard>
      <GuideP>
        One sentence, one price, one immediate next step. The best moment to offer it is
        checkout after a visit the patient just paid cash for — the value math is
        sitting right there on the receipt.
      </GuideP>
    </GuideShell>
  )
}
