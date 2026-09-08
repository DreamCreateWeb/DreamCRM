import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, ScriptCard } from '../guide-ui'

const guide = getResourceGuide('dental-membership-plan-pricing')

export const metadata = {
  title: 'Dental membership plan pricing: what to include & what to charge',
  description: guide?.description,
  alternates: { canonical: '/resources/dental-membership-plan-pricing' },
}

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
          <><strong>A flat discount on everything else</strong> — commonly 10–20% off your fee schedule for fillings, crowns, and elective work.</>,
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
      <ScriptCard label="Worked example (illustrative numbers — use your own)">
        {`What a member receives per year, at retail:
  2 cleanings ................ 2 × $120 = $240
  2 exams .................... 2 × $60  = $120
  Bitewing X-rays ............ 1 × $70  = $70
  Retail value ............... $430

What it costs you to deliver (chair time + staff + materials):
  Roughly 40–60% of retail for hygiene in most practices
  Call it ~$220 in this example.

Pricing band:
  Floor  — your delivery cost ......... ~$220/yr
  Target — 65–80% of retail value ..... ~$280–$345/yr
  A common landing spot ............... $29–$35/mo (≈ $350–$420/yr)

The member's story: "everything my checkups cost, for less,
plus 15% off anything else — and no insurance paperwork."`}
      </ScriptCard>
      <GuideList
        items={[
          <><strong>The floor is your delivery cost.</strong> Below that you’re paying patients to attend. Above retail, nobody joins — the plan must be visibly cheaper than paying as they go.</>,
          <><strong>The discount is where margin hides.</strong> The 10–20% off restorative work isn’t a giveaway — members accept treatment more readily because the price objection shrank and the trust grew. That production lift is the real business case.</>,
          <><strong>Family pricing:</strong> a lower add-on rate per additional member (commonly 10–20% off the second adult, child plans priced separately) — a household on one subscription is your stickiest revenue.</>,
        ]}
      />

      <GuideH2>Monthly vs annual</GuideH2>
      <GuideP>
        Offer both. Monthly (card on file, auto-renewing) is the volume seller — a $30
        decision is easy, a $400 one gets postponed. Annual with roughly one month free
        rewards the committed and pulls cash forward. Whichever they pick, auto-renewal
        is the whole point: a plan someone must remember to rejoin is a plan they quietly
        leave.
      </GuideP>

      <GuideH2>The pitfalls that actually bite</GuideH2>
      <GuideList
        items={[
          <><strong>Never stack the plan with insurance.</strong> The plan is for the uninsured and under-insured; say so in the terms. Members with coverage should use the coverage.</>,
          <><strong>Don’t discount below lab cost</strong> on lab-heavy work — a 20% member discount on a crown can eat the margin whole. Some practices cap the discount tier for lab cases; decide on purpose either way.</>,
          <><strong>Put the renewal date to work.</strong> The renewal email is a recall message wearing a receipt — “your plan renewed, let’s book your first cleaning of the year” fills January.</>,
          <><strong>Track usage.</strong> A member who pays and never comes is churn you haven’t met yet. Unused benefits at month nine deserve a friendly nudge, not a shrug.</>,
        ]}
      />
      <GuideNote>
        The legal caveat, plainly: several US states regulate in-house dental plans —
        some require registering the plan, specific contract language, or treat
        poorly-structured plans like insurance products. Before you launch, check your
        state dental board’s guidance or have a healthcare attorney read your terms.
        This guide is arithmetic, not legal advice.
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
