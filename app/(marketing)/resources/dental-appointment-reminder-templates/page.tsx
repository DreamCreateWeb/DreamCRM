import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { REMINDER_RULE } from '@/lib/marketing/guide-sources'
import { productEmail, REMINDER_TEXTS } from '@/lib/marketing/guide-templates'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-appointment-reminder-templates')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

const RULE = REMINDER_RULE.conditions

/**
 * THE EMAILS ON THIS PAGE ARE THE PRODUCT'S, READ FROM ITS SPEC
 * (`lib/marketing/guide-templates.ts`). The heading, the button and the last
 * line of each are literals in the sender that frames it — `lib/email.ts` for
 * the confirmation, `lib/services/reminder-automation.ts` for the reminder —
 * and `tests/marketing/reminder-templates-guide.test.tsx` reads those files
 * for them.
 *
 * THE TEXTS ARE NOT THE PRODUCT'S. It does not send text messages today, the
 * page says so beside them and again in the close, and they are held to one
 * segment on a realistic fill by the product's own segment math.
 *
 * THE RULE IS QUOTED FROM WHERE IT WAS READ. The government's own copy
 * refused the reader on 2026-11-25; Cornell's did not, so the page names
 * Cornell's.
 */
const CONFIRMATION = productEmail('booking_confirmation')
const REMINDER = productEmail('appointment_reminder')
const CONFIRMED = productEmail('appointment_reminder_confirmed')
const MOVED = productEmail('rescheduled')

export const metadata = pageMetadata({
  title: 'Dental appointment reminder templates: email, text & phone scripts',
  description: guide?.description ?? '',
  path: '/resources/dental-appointment-reminder-templates',
  type: 'article',
})

export default function ReminderTemplatesGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the emails to send themselves?',
        title: 'The confirmation and the reminders are jobs the software does',
        body: (
          <>
            {MARKETING.productName} emails the confirmation when a visit is booked, the reminder three days before and
            the day before with its Confirm button, and the quieter note to patients who have already confirmed:
            all three on from day one. The texts and the calls stay with your team. It does not send text messages
            today, and it does not place calls. {usd(PLAN.price)}/mo, flat, after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        A reminder has one job, and it is not to inform. The patient already knows about the
        visit. What you need is an answer, early enough to do something with it. A
        reminder gets none when it asks for none, or when answering takes a phone call.
      </GuideP>
      <GuideP>
        Every template below asks for one thing and makes the other answer just as easy.
        The emails are the ones that ship inside {MARKETING.productName}, word for word. The texts
        and the phone scripts are written to the same rules, for the tools you already
        have.
      </GuideP>

      <GuideH2>Three rules for a reminder that gets an answer</GuideH2>
      <GuideList
        items={[
          <><strong>Ask for one thing.</strong> Confirm. Not a survey, not a form, not a link to your new-patient special. One button or one reply.</>,
          <><strong>Make “I can’t make it” as easy as “I’ll be there”.</strong> A patient who can’t tell you becomes the empty chair. The second answer is the one that saves the hour.</>,
          <><strong>Stop asking the ones who answered.</strong> A patient who confirmed on Monday should get a quiet heads-up the day before, not the same question again.</>,
        ]}
      />

      <GuideH2>The confirmation email, the moment they book</GuideH2>
      <ScriptCard label="Email · sent when the visit is booked">
        {`Subject: ${CONFIRMATION.subject}

${CONFIRMATION.heading}

${CONFIRMATION.body}

{day and time}
{practice name} · {phone}
Add to calendar →

${CONFIRMATION.closing}`}
      </ScriptCard>
      <GuideP>
        The line that earns its place is the calendar link. A visit that lives in the
        patient’s own calendar is reminded by their phone as well as by you.
      </GuideP>

      <GuideH2>The appointment reminder email</GuideH2>
      <ScriptCard label="Email · the reminder, for a visit not yet confirmed">
        {`Subject: ${REMINDER.subject}

Your visit is coming up

${REMINDER.body}

[ Confirm my visit ]

Need a different time? Just reply to this email and we’ll find one together.`}
      </ScriptCard>
      <ScriptCard label="Email · the heads-up, once they have confirmed">
        {`Subject: ${CONFIRMED.subject}

${CONFIRMED.body}`}
      </ScriptCard>
      <GuideP>
        Two emails, because they are two different conversations. The first is a question
        with a button under it. The second asks for nothing, and says so, which is what
        keeps a confirmed patient from tuning the practice out.
      </GuideP>

      <GuideH2>The appointment reminder text</GuideH2>
      <GuideP>
        These are for the texting tool you already use; {MARKETING.productName} does not send
        text messages today. Each one names the practice first, gives a number to call,
        says nothing about money, and ends with the opt-out line.
      </GuideP>
      <ScriptCard label="Text · confirm by reply">{REMINDER_TEXTS.reply}</ScriptCard>
      <ScriptCard label="Text · confirm by link">{REMINDER_TEXTS.link}</ScriptCard>
      <ScriptCard label="Text · the day before, already confirmed">{REMINDER_TEXTS.confirmed}</ScriptCard>
      <ScriptCard label="Text · one message for a family">{REMINDER_TEXTS.family}</ScriptCard>
      <GuideP>
        Keep them to plain characters and measure them with your own practice name in. A
        text holds 160 characters; one emoji or curly quote changes the encoding and the
        limit drops to 70, so the same sentence goes out as two messages. The link
        version sits right at the limit with an ordinary practice name, so use a short
        link or the reply version.
      </GuideP>

      <GuideH2>The rule on reminder texts and calls, in its own words</GuideH2>
      <GuideNote>
        This is not legal advice. The federal calling rule lets a health-care provider
        send automated reminder calls and texts to a cell phone without the consent it
        otherwise requires, on conditions; one is that the message costs the patient
        nothing. Whether you rely on that, or on the consent your patients gave you at
        intake, is a question for your lawyer and your texting vendor. The conditions are
        a sound floor either way.
      </GuideNote>
      <GuideList
        items={[
          <><strong>What it covers:</strong> “{RULE.purposes}”, among a short list of purposes.</>,
          <><strong>Who it is from:</strong> the message “{RULE.identify}”.</>,
          <><strong>What it may not carry:</strong> it “{RULE.noBilling}”. A balance does not belong in a reminder; it has{' '}<Link href="/resources/dental-past-due-balance-letters" className="font-semibold text-teal-700 hover:underline">letters of its own</Link>.</>,
          <><strong>How long:</strong> “{RULE.length}”.</>,
          <><strong>How often:</strong> “{RULE.frequency}”.</>,
          <><strong>The way out:</strong> a text “{RULE.optOut}” the word STOP, and the provider “{RULE.honor}”</>,
        ]}
      />
      <GuideP>
        Read {formatCheckedOn(REMINDER_RULE.source.readOn)}: <GuideSourceLink source={REMINDER_RULE.source} />.
      </GuideP>

      <GuideH2>The confirmation call, for the ones who never answer</GuideH2>
      <ScriptCard label="Phone · the confirmation call">
        {`“Hi {first name}, it’s {your name} at {practice name}. I’m calling about your visit on {day} at {time}. Are you still good for that?”

If yes: “Wonderful. We’ll see you then.”

If no: “No problem at all. Let’s find a better time while I have you. I have {first opening} or {second opening}. Which is easier?”`}
      </ScriptCard>
      <ScriptCard label="Voicemail · the confirmation call, unanswered">
        {`“Hi {first name}, it’s {your name} at {practice name}, calling about your visit on {day} at {time}. Please call us at {phone} to confirm, or reply to the email we sent. Thank you.”`}
      </ScriptCard>
      <GuideNote>
        A voicemail is heard by whoever plays it. The day, the time and the practice are
        enough. Leave out the treatment.
      </GuideNote>

      <GuideH2>When the time changes</GuideH2>
      <ScriptCard label="Email · you moved the visit">
        {`Subject: ${MOVED.subject}

Your visit has a new time

${MOVED.body}

[ Confirm my new time ]`}
      </ScriptCard>
      <GuideP>
        A moved visit is a new promise, so it asks for its own confirmation.
      </GuideP>

      <GuideH2>The timing</GuideH2>
      <GuideList
        items={[
          <><strong>Three days before, and the day before.</strong> Three days is early enough to refill the hour if the answer is no. The day before is for the people who forgot.</>,
          <><strong>A week ahead as well, for long visits.</strong> The longer the appointment, the more notice you need to fill it.</>,
          <><strong>Never two in a day.</strong> A visit booked yesterday for tomorrow needs one reminder, not both at once.</>,
          <><strong>Three at most.</strong> After the third, another message is no longer a reminder.</>,
        ]}
      />
      <GuideP>
        And for the visits that are missed anyway, there is a{' '}
        <Link
          href="/resources/dental-cancellation-no-show-policy"
          className="font-semibold text-teal-700 hover:underline"
        >
          cancellation and no-show policy template
        </Link>
        , with the letters that go with it. And for the visits that go well, the{' '}
        <Link
          href="/resources/dental-review-request-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          review request templates
        </Link>{' '}
        are the ask that follows.
      </GuideP>
    </GuideShell>
  )
}
