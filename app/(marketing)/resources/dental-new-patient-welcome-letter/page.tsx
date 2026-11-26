import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { PRIVACY_NOTICE_RULE } from '@/lib/marketing/guide-sources'
import { productEmail } from '@/lib/marketing/guide-templates'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-new-patient-welcome-letter')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

const RULE = PRIVACY_NOTICE_RULE.says

/**
 * THE NEW-PATIENT WELCOME GUIDE. What it is held to
 * (`tests/marketing/welcome-letter-guide.test.tsx`):
 *
 * 1. THE WELCOME EMAIL AND THE LETTER ARE HAND-WRITTEN, AND THE PAGE SAYS SO.
 *    The product has no "welcome" email of its own. What it sends a new
 *    patient is the booking confirmation, the forms request and the portal
 *    invitation — and the last two are on this page, read from their spec.
 *
 * 2. THE FORMS CLAIM IS CONDITIONAL, BECAUSE THE FEATURE IS. Intake forms are
 *    off until a practice switches them on (`patientFacingIntakeOpen`). The
 *    close says "switch intake forms on", never that forms go out by default.
 *
 * 3. THE PRIVACY-NOTICE RULE IS QUOTED, by its citation, and the page makes
 *    no statement about this product's standing under it.
 *
 * 4. NO CARD PROMISES CLINICAL ANYTHING. A welcome letter that says "your
 *    first visit includes a cleaning" is a promise the dentist has not made.
 */
const FORMS = productEmail('intake_request')
const PORTAL = productEmail('portal_invite')

export const metadata = pageMetadata({
  title: 'New patient welcome letter for a dental office: letter & email templates',
  description: guide?.description ?? '',
  path: '/resources/dental-new-patient-welcome-letter',
  type: 'article',
})

export default function WelcomeLetterGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the paperwork to send itself?',
        title: 'The confirmation and the forms are jobs the software does',
        body: (
          <>
            {MARKETING.productName} emails a confirmation the moment a first visit is booked. Switch intake forms on
            and that email carries the link to them, the forms are filled in online, and a patient who has not
            finished gets a nudge before the visit. The welcome letter and the phone call stay with your team: it
            does not print or mail letters, and it does not send text messages today. {usd(PLAN.price)}/mo, flat,
            after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        A new patient decides how they feel about a practice before they have met anyone
        in it. They decide on the phone call that booked the visit and on whatever arrives
        afterwards. A welcome that says “please arrive fifteen minutes early to complete
        paperwork” tells them the first thing they will do is wait.
      </GuideP>
      <GuideP>
        Below: the first phone call, the welcome email, the letter for the patients you
        mail, the forms email, the list of what to bring, and the one rule about paperwork
        that has a deadline.
      </GuideP>

      <GuideH2>What a welcome has to do</GuideH2>
      <GuideList
        items={[
          <><strong>Sound like someone is glad.</strong> One sentence of welcome, in the words you would use at the desk. Not a mission statement.</>,
          <><strong>Say exactly what to do before they come.</strong> The forms and the short list of what to bring. Anything a patient has to guess becomes ten minutes at the counter.</>,
          <><strong>Take the surprises out of the first visit.</strong> Where to park, how long it takes, who to call. People who know what will happen show up.</>,
        ]}
      />

      <GuideH2>The first phone call</GuideH2>
      <ScriptCard label="Phone · a new patient calling to book">
        {`“Thank you for calling {practice name}, this is {your name}.”

When they say they are new: “Welcome. I’m glad you called. What’s bringing you in?”

Listen, then: “We can help with that. Let me find you a time. I have {first opening} or {second opening}. Which is easier?”

Once it is booked: “You’re all set for {day} at {time}. I’ll email you a short welcome with your forms and what to bring. What’s the best email for you?”

To close: “If anything changes, call us or reply to that email. We’re looking forward to meeting you, {first name}.”`}
      </ScriptCard>
      <GuideP>
        The order matters. Welcome first, then the reason they called, then the time. The
        questions about insurance and history can wait for the forms, which is where a
        patient would rather answer them.
      </GuideP>

      <GuideH2>The new patient welcome email</GuideH2>
      <ScriptCard label="Email · the welcome, sent when the first visit is booked">
        {`Subject: Welcome to {practice name}

Hi {first name},

Welcome. We’re glad you chose us, and we’re looking forward to meeting you on {day} at {time}.

A few things will make your first visit easy.

Your forms: {forms link}. Filling them in at home means we can start on time.
What to bring: a photo ID, your insurance card if you have one, and a list of any medications you take.
Where we are: {address}. {parking note}
How long: plan on about {length of first visit}.

If anything comes up before then, reply to this email or call {phone}.

See you soon,

{your name}
{practice name}`}
      </ScriptCard>

      <GuideH2>The new patient welcome letter</GuideH2>
      <GuideP>
        For the patients you mail, and for the ones who booked by phone and gave no email.
        One page, signed, with the forms in the envelope.
      </GuideP>
      <ScriptCard label="Letter · one page, with the forms enclosed">
        {`Dear {first name},

Welcome to {practice name}. Thank you for choosing us. We are looking forward to meeting you on {day} at {time}.

A few things will make your first visit easy.

Before you come: please fill in the enclosed forms, or complete them online at {forms link}.
Please bring: a photo ID, your insurance card if you have one, and a list of any medications you take.
If another office has recent X-rays of yours, tell us and we will ask for them.

We are at {address}. {parking note} Your first visit will take about {length of first visit}.

If your plans change, call us at {phone} and we will find another time.

Warmly,

{dentist name}
and the team at {practice name}`}
      </ScriptCard>

      <GuideH2>The forms email and the portal invitation</GuideH2>
      <GuideP>
        These two are the ones that ship inside {MARKETING.productName}, word for word. The
        welcome email and the letter above are written to the same rules.
      </GuideP>
      <ScriptCard label="Email · the forms request">
        {`Subject: ${FORMS.subject}

${FORMS.heading}

${FORMS.body}

[ Fill out intake form ]

${FORMS.closing}`}
      </ScriptCard>
      <ScriptCard label="Email · the portal invitation">
        {`Subject: ${PORTAL.subject}

${PORTAL.heading}

${PORTAL.body}

[ Set up my portal ]

${PORTAL.closing}`}
      </ScriptCard>

      <GuideH2>What to bring</GuideH2>
      <ScriptCard label="List · paste into the email, the letter or your website">
        {`A photo ID
Your insurance card, if you have one
A list of the medications you take
The name of your last dentist, if you would like us to ask for your records
A parent or guardian, if you are under eighteen`}
      </ScriptCard>

      <GuideH2>The privacy notice, and when it is due</GuideH2>
      <GuideNote>
        This is not legal advice, and it is one paragraph of a long rule. Your state may
        add to it. Read the rule itself, or ask whoever advises the practice.
      </GuideNote>
      <GuideP>
        One piece of the new-patient paperwork has a date on it. The federal privacy rule
        says “{RULE.who}” provide its notice of privacy practices “{RULE.when}”, and
        “{RULE.acknowledgment}”. So the notice goes with the forms, and the signature line
        goes with the notice.
      </GuideP>
      <GuideList
        items={[
          <><strong>At the office:</strong> “{RULE.onSite}”, and “{RULE.posted}”.</>,
          <><strong>On your website:</strong> a practice with one “{RULE.website}”.</>,
        ]}
      />
      <GuideP>
        Read {formatCheckedOn(PRIVACY_NOTICE_RULE.source.readOn)}:{' '}
        <GuideSourceLink source={PRIVACY_NOTICE_RULE.source} />.
      </GuideP>

      <GuideH2>After the first visit</GuideH2>
      <GuideP>
        The welcome ends when the visit does, and three other pages pick up from there:
        the{' '}
        <Link
          href="/resources/dental-appointment-reminder-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          appointment reminder templates
        </Link>{' '}
        for the next visit, the{' '}
        <Link
          href="/resources/dental-review-request-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          review request templates
        </Link>{' '}
        for the ask that follows a good one, and the{' '}
        <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
          dental recall scripts
        </Link>{' '}
        for six months on.
      </GuideP>
    </GuideShell>
  )
}
