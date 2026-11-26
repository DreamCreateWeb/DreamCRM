import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { REVIEW_RULES } from '@/lib/marketing/guide-sources'
import { productEmail, REVIEW_REQUEST_TEXT } from '@/lib/marketing/guide-templates'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'
import { REVIEW_CARD_BODY, REVIEW_CARD_HEADLINES } from '@/lib/review-card'

const guide = getResourceGuide('dental-review-request-templates')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

const GOOGLE = REVIEW_RULES.googlePolicy.says
const TIPS = REVIEW_RULES.googleTips.says

/**
 * THE REVIEW REQUEST GUIDE. What it is held to
 * (`tests/marketing/review-request-guide.test.tsx`):
 *
 * 1. THE EMAIL IS THE PRODUCT'S, read from its spec; the button's label is a
 *    literal in the sender (`lib/services/reviews.ts`) and the test reads it.
 *
 * 2. NO CARD ASKS FOR A GOOD REVIEW. Not "five stars", not "if you enjoyed
 *    your visit", not a reward. Every ask on this page goes to every patient
 *    and says, in its own words, that a bad answer is welcome — because the
 *    sentence of Google's policy quoted further down forbids the other kind,
 *    and a guide that quoted the rule and then broke it one card up would be
 *    worse than no guide.
 *
 * 3. THE RULES ARE QUOTED, each fragment pinned, each page linked and dated.
 *
 * 4. THE CLOSE IS TIED TO THE DEFAULTS: sent when a visit is marked complete
 *    (`auto_send_enabled`, no delay), one ask per patient per year
 *    (`min_days_between_requests`), the same page for every patient (the
 *    private note on, the star ask off). It says the product sends no text
 *    today.
 */
const REQUEST = productEmail('review_request')

export const metadata = pageMetadata({
  title: 'Dental review request templates: email, text & in-person scripts',
  description: guide?.description ?? '',
  path: '/resources/dental-review-request-templates',
  type: 'article',
})

export default function ReviewRequestGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the ask to send itself?',
        title: 'The review request is a job the software does',
        body: (
          <>
            {MARKETING.productName} emails the request above when a visit is marked complete, on from day one, and
            asks any one patient at most once a year. Every patient is sent the same page: a button to your Google
            reviews and, beside it, a way to tell you privately instead. It does not send text messages today, and
            the card on the counter is yours to print. {usd(PLAN.price)}/mo, flat, after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        Happy patients do not leave reviews on their own. Somebody has to ask, and the ask
        is easy to get wrong in two directions: asking only the patients you are sure of,
        or sweetening it. Google’s rules forbid both, and the FTC’s rule reaches a reward
        tied to what the review says.
      </GuideP>
      <GuideP>
        Below: the wording for the email, the text, the front desk and the card on the
        counter, two replies, and the rules in their own words.
      </GuideP>

      <GuideH2>Three rules for the ask</GuideH2>
      <GuideList
        items={[
          <><strong>Ask every patient, the same way.</strong> The moment you choose who gets asked, you are choosing what the reviews will say, and that is the thing the rules are written against.</>,
          <><strong>Ask the same day.</strong> The visit is still on their mind and the link is still at the top of their inbox.</>,
          <><strong>One link, one tap.</strong> Send them straight to the place where the review is written. Every extra screen is somewhere to stop.</>,
        ]}
      />

      <GuideH2>The review request email</GuideH2>
      <GuideP>
        This is the request that ships inside {MARKETING.productName}. The part to keep, if you
        rewrite the rest, is the parenthesis.
      </GuideP>
      <ScriptCard label="Email · sent after the visit">
        {`Subject: ${REQUEST.subject}

${REQUEST.heading}

${REQUEST.body}

[ Leave a review ]

${REQUEST.closing}`}
      </ScriptCard>
      <GuideP>
        “Good, bad, or in-between” does two jobs. It keeps the ask inside Google’s rule,
        and it makes the email sound like a person rather than a campaign.
      </GuideP>

      <GuideH2>The review request text</GuideH2>
      <ScriptCard label="Text · the same ask, in one message">{REVIEW_REQUEST_TEXT}</ScriptCard>
      <GuideNote>
        A review request is not an appointment reminder. The federal calling rule’s
        allowance for health-care messages lists what it covers, and asking for a review
        is not on the list (the{' '}
        <Link
          href="/resources/dental-appointment-reminder-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          reminder templates
        </Link>{' '}
        guide quotes it). Text only the patients who agreed to hear from you by text. This
        is not legal advice.
      </GuideNote>

      <GuideH2>What to say at the front desk</GuideH2>
      <ScriptCard label="Front desk · at checkout">
        {`“Thanks for coming in today, {first name}. We’ll email you a link, in case you’d like to tell people how it went. Good, bad or in between, we read every one.”`}
      </ScriptCard>
      <GuideP>
        Then let them leave. Google’s policy says a business “{GOOGLE.pressure}” So no
        tablet across the counter, and nobody standing by while it is written.
      </GuideP>

      <GuideH2>The card on the counter</GuideH2>
      <ScriptCard label="Card · beside the front desk, or on the back of the appointment card">
        {`${REVIEW_CARD_HEADLINES[0]}

${REVIEW_CARD_BODY}

{QR code}

{practice name}`}
      </ScriptCard>
      <GuideP>
        Google’s own help page says “{TIPS.link}”, and your Business Profile gives you
        both. The card asks for an honest take, offers nothing in return, and names no
        number of stars. To print it with your own code on it, paste your link into the{' '}
        <Link href="/google-review-card" className="font-semibold text-teal-700 hover:underline">
          review card maker
        </Link>
        : it runs in your browser.
      </GuideP>

      <GuideH2>What Google and the FTC do not allow</GuideH2>
      <GuideNote>
        This is not legal advice, and these are the lines we read, not the whole of either
        document. Read the pages themselves before you run anything that looks like a
        promotion.
      </GuideNote>
      <GuideList
        items={[
          <><strong>A reward for a review.</strong> Google does not allow a business to “{GOOGLE.incentives}” The FTC’s rule, in its own words: “{REVIEW_RULES.ftc.says.incentives}”</>,
          <><strong>Choosing who gets asked.</strong> Google does not allow a business to “{GOOGLE.gating}”.</>,
          <><strong>A quota or a contest for the team.</strong> Among the things Google names: “{GOOGLE.quota}”.</>,
          <><strong>Asking for a name or a phrase in the review.</strong> Also named: “{GOOGLE.naming}”</>,
          <><strong>Reviews from the team.</strong> Google treats a conflict of interest as a reason to remove a review: “{GOOGLE.conflict}”. The FTC’s rule has a section of its own on this, titled “{REVIEW_RULES.ftcInsiders.says.title}”; read it before anyone who works at the practice reviews it.</>,
        ]}
      />
      <GuideP>
        And what Google does allow, in its words: “{GOOGLE.allowed}”
      </GuideP>
      <GuideP>
        Read {formatCheckedOn(REVIEW_RULES.googlePolicy.source.readOn)}:{' '}
        <GuideSourceLink source={REVIEW_RULES.googlePolicy.source} />,{' '}
        <GuideSourceLink source={REVIEW_RULES.googleTips.source} />, and{' '}
        <GuideSourceLink source={REVIEW_RULES.ftc.source} />. Read{' '}
        {formatCheckedOn(REVIEW_RULES.ftcInsiders.source.readOn)}:{' '}
        <GuideSourceLink source={REVIEW_RULES.ftcInsiders.source} />.
      </GuideP>

      <GuideH2>When the review is not a good one</GuideH2>
      <GuideP>
        It will happen, and it is not all bad news. Google’s help page: “{TIPS.mix}” Reply
        in public, briefly, and take the rest to the phone.
      </GuideP>
      <ScriptCard label="Reply · to a critical review">
        {`Thank you for telling us. This is not the experience we want anyone to have, and we would like to hear more. Please call {phone} and ask for {name}.`}
      </ScriptCard>
      <ScriptCard label="Reply · to a kind review">
        {`Thank you for taking the time to write this. It means a great deal to everyone here.`}
      </ScriptCard>
      <GuideNote>
        Your reply is public and your patient list is not. Neither reply above says the
        writer is a patient, or mentions a visit or a treatment. Keep it that way, however
        much the review itself gives away.
      </GuideNote>

      <GuideH2>How often to ask</GuideH2>
      <GuideList
        items={[
          <><strong>Once a year per patient, at most.</strong> A patient asked after every cleaning stops opening your email.</>,
          <><strong>One ask per visit.</strong> One request, sent the same day, is a favor. A chaser is a campaign.</>,
        ]}
      />
      <GuideP>
        The visit has to happen first. For that there are the{' '}
        <Link
          href="/resources/dental-appointment-reminder-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          appointment reminder templates
        </Link>{' '}
        and, for getting patients back in at all, the{' '}
        <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
          dental recall scripts
        </Link>
        . For a patient’s very first visit, there is a{' '}
        <Link
          href="/resources/dental-new-patient-welcome-letter"
          className="font-semibold text-teal-700 hover:underline"
        >
          new patient welcome letter
        </Link>
        .
      </GuideP>
    </GuideShell>
  )
}
