import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { LOCAL_RANKING, REVIEW_RULES } from '@/lib/marketing/guide-sources'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink } from '../guide-ui'
import { pageMetadata } from '@/lib/marketing/seo'

const guide = getResourceGuide('how-to-get-more-dental-patients')

/**
 * RE-READ 2026-11-26 AGAINST THE LIBRARY'S OWN CONTENT LAW. This guide was
 * written in September with a figure or a comparison in most paragraphs and a
 * source for none ("most new patients pick from those three tiles", "100+
 * Google reviews", "converts multiples better"). Each was sourced, softened or
 * cut. What could be sourced is Google's own page on local ranking
 * (`LOCAL_RANKING`), quoted word for word; the rest now says what to do and
 * stops claiming how often it works. `tests/marketing/sourced-guides.test.tsx`
 * holds the retired sentences out.
 */
const RANK = LOCAL_RANKING.says

export const metadata = pageMetadata({
  title: 'How to get more dental patients — the order that actually works',
  description: guide?.description ?? '',
  path: '/resources/how-to-get-more-dental-patients',
})

export default function MorePatientsGuide() {
  if (!guide) notFound()
  return (
    <GuideShell guide={guide}>
      <GuideP>
        Most “get more patients” advice is a list of twelve channels with no order, which
        is how practices end up paying for ads that land on a website that doesn’t book,
        pointing at a Google listing that says they’re closed. The order below matters
        more than any single tactic: each step multiplies the ones after it, and the
        first three cost time, not money.
      </GuideP>

      <GuideH2 id="google-listing">1. The Google listing is the front door</GuideH2>
      <GuideP>
        When someone searches “dentist near me,” Google answers with a map and a short
        list of practices. That list is built from Business Profiles, so the profile
        comes first:
      </GuideP>
      <GuideList
        items={[
          <><strong>Claim and verify</strong> your Google Business Profile. Google’s own page on local ranking says of verifying: “{RANK.verify}”</>,
          <><strong>Check the website button.</strong> A wrong or dead website link on the listing sends every click from the map to nowhere, and nothing tells you. The phone still rings, so nobody looks.</>,
          <><strong>Keep the name, address, phone and hours complete, and the same everywhere</strong> — listing, website, socials. The same page: “{RANK.complete}”</>,
          <><strong>Add photos of the real place and the real team.</strong> A patient is choosing a room they will sit in, and a logo does not show them one.</>,
        ]}
      />

      <GuideH2 id="reviews">2. Reviews are the tiebreaker</GuideH2>
      <GuideP>
        Reviews do two jobs. A patient choosing between two practices on the same map
        reads them, and Google counts them: “{RANK.reviews}” Nobody collects them by
        hoping. The loop is simple:
      </GuideP>
      <GuideList
        items={[
          <><strong>Ask every patient, the same way, after every completed visit.</strong> Same ask for everyone — filtering who you ask by how happy they seemed (“review gating”) is against Google’s policy, which does not allow a business to “{REVIEW_RULES.googlePolicy.says.gating}”. The wording for the ask, and the rest of the rules, are in the{' '}<Link href="/resources/dental-review-request-templates" className="font-semibold text-teal-700 hover:underline">review request templates</Link>.</>,
          <><strong>Ask while it’s fresh.</strong> The same day, while the visit is still on their mind, and not in a batch on Friday.</>,
          <><strong>Reply to everything,</strong> especially the bad ones — calmly, without discussing the person’s care in public. Google again: “{RANK.replies}”</>,
        ]}
      />

      <GuideH2 id="website">3. A website that books, not a brochure</GuideH2>
      <GuideP>
        The listing and the reviews earn the click; the website has one job after that —
        turn the click into a booked visit. The checks that matter (they’re the same ones
        our free grader runs):
      </GuideP>
      <GuideList
        items={[
          <><strong>Online booking, at any hour.</strong> A patient who decides at nine at night can book at nine at night; “call us tomorrow” is a reason to keep looking.</>,
          <><strong>Built for phones first.</strong> A patient with a toothache in a parking lot is not at a desk.</>,
          <><strong>A tap-to-call phone number</strong> on every page, for the patients who would still rather call.</>,
          <><strong>Fast, secure (HTTPS), with real search titles</strong> and dentist structured data, so Google knows exactly who and where you are.</>,
        ]}
      />
      <GuideP>
        Not sure where yours stands?{' '}
        <Link href="/grade" className="font-semibold text-teal-700 hover:underline">
          Run the free grade
        </Link>{' '}
        — it checks your site, your listing, your reviews, and where you rank for
        “dentist in your town,” and shows the report instantly.
      </GuideP>

      <GuideH2 id="reactivation">4. The cheapest new patient is one you already have</GuideH2>
      <GuideP>
        Before spending a dollar acquiring strangers, look at your own chart list for the
        patients who have quietly fallen off the hygiene schedule. Reaching them costs an
        email, and they already trust you. Run a standing recall cycle — due date + 2 weeks gets the email, +3
        weeks the text, +6 weeks the phone call for the long-overdue. We published the
        exact scripts:{' '}
        <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
          dental recall scripts that get patients back
        </Link>
        .
      </GuideP>

      <GuideH2 id="referrals">5. Make referrals easy to give</GuideH2>
      <GuideList
        items={[
          <>Ask at the moment of delight — after the “wow, that didn’t hurt” visit, not on a random Tuesday.</>,
          <>Give the referrer something to hand over: a card, a link, a family-booking option. “Tell your friends about us” with no vehicle goes nowhere.</>,
          <>Thank people visibly. A handwritten note beats a mug; a mug beats silence. (Check your state’s rules before offering a reward for a referral.)</>,
        ]}
      />

      <GuideH2 id="paid">6. Only then: paid ads</GuideH2>
      <GuideP>
        Ads multiply what exists. If the listing is wrong, the reviews are thin, or the
        site doesn’t book, ads pour money into a leaky funnel — fix steps 1–4 first.
        When you do spend: local search ads on “dentist near me”-shaped terms, pointed
        at a page that books, judged on cost per <em>booked patient</em> (not clicks),
        with a budget you only raise when the math works. Set a kill bar before you
        start, and honor it.
      </GuideP>
      <GuideNote>
        What to skip: bulk coupon platforms (one-visit bargain hunters), generic social
        posting as an acquisition strategy (it’s a credibility asset, not a patient
        source), and any vendor promising “#1 on Google.” Nobody can promise that
        honestly. Google says so itself: “{RANK.noPaying}”
      </GuideNote>
      <GuideP>
        The quotations from Google on this page were read{' '}
        {formatCheckedOn(LOCAL_RANKING.source.readOn)}: <GuideSourceLink source={LOCAL_RANKING.source} />.
      </GuideP>

      <GuideH2>The one-page version</GuideH2>
      <GuideList
        items={[
          <>Claim the listing, fix the website button, add real photos.</>,
          <>Ask every patient for a review, the evening of the visit.</>,
          <>Make the website book visits while you sleep.</>,
          <>Run recall forever — the quiet engine that fills hygiene.</>,
          <>Give referrers a vehicle.</>,
          <>Then, and only then, buy ads — and measure booked patients.</>,
        ]}
      />
    </GuideShell>
  )
}
