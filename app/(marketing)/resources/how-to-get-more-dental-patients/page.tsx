import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote } from '../guide-ui'

const guide = getResourceGuide('how-to-get-more-dental-patients')

export const metadata = {
  title: 'How to get more dental patients — the order that actually works',
  description: guide?.description,
  alternates: { canonical: '/resources/how-to-get-more-dental-patients' },
}

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
        When someone searches “dentist near me,” the map pack is the whole game — most
        new patients pick from those three tiles and never scroll further. Before
        anything else:
      </GuideP>
      <GuideList
        items={[
          <><strong>Claim and verify</strong> your Google Business Profile. Unverified listings can’t be fully edited and get outranked by ones that are.</>,
          <><strong>Check the website button.</strong> A wrong or dead website link on the listing silently sends every map-pack click to nowhere — we’ve watched a practice lose essentially all of its online traffic to exactly this, and nobody noticed for months because the phone still rang.</>,
          <><strong>Match name, address, phone, and hours everywhere</strong> — listing, website, socials. Google cross-checks; disagreements cost trust and rank.</>,
          <><strong>Add photos of the real place and real team.</strong> Listings with genuine photos get dramatically more clicks than logo-only ones, and patients are choosing a room they’ll sit in.</>,
        ]}
      />

      <GuideH2 id="reviews">2. Reviews are the tiebreaker</GuideH2>
      <GuideP>
        Between two practices on the same map, patients pick the one with more and
        better reviews almost every time. The winning practices in most markets carry
        100+ Google reviews — and none of them got there by hoping. The loop is simple:
      </GuideP>
      <GuideList
        items={[
          <><strong>Ask every patient, the same way, after every completed visit.</strong> Same ask for everyone — filtering who you ask by how happy they seemed (“review gating”) violates the FTC’s fake-reviews rule and Google’s policies.</>,
          <><strong>Ask while it’s fresh.</strong> The review request that goes out the evening of the visit converts multiples better than the one that goes out Friday.</>,
          <><strong>Reply to everything,</strong> especially the bad ones — calmly, without discussing the person’s care in public. Future patients read your replies as a preview of how you handle problems.</>,
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
          <><strong>Online booking, 24/7</strong> — a large share of booking intent happens after hours, when “call us” means “keep looking.”</>,
          <><strong>Built for phones first</strong> — that’s where the map-pack click comes from.</>,
          <><strong>A tap-to-call phone number</strong> on every page; the fastest patients still book by calling.</>,
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
        Before spending a dollar acquiring strangers, look at your own chart list: in a
        typical practice, a meaningful slice of active patients quietly falls off the
        hygiene schedule every year. Reactivating them costs an email, and they already
        trust you. Run a standing recall cycle — due date + 2 weeks gets the email, +3
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
          <>Thank people visibly. A handwritten note beats a mug; a mug beats silence. (Check your state’s rules before offering referral rewards — several regulate them for healthcare.)</>,
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
        honestly.
      </GuideNote>

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
