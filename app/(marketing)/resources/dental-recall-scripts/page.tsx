import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-recall-scripts')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

/**
 * WHO SENDS WHAT, SAID ON THE PAGE.
 *
 * This guide used to close on the shell's default — "everything in this guide
 * is a job the software does" — and open by calling every script one "our own
 * platform sends". Both were written when the page held an email and were
 * never true of the phone scripts; the text scripts made them a claim the
 * product cannot back (texting is not available today — `listing-kit.ts`
 * says so in those words), and the letter, added 2026-11-25 because Search
 * Console was showing this page for "dental patient recall letter template",
 * made them plainly false. So the page says which one the software sends, and
 * leaves the rest with the practice. `tests/marketing/resources.test.tsx`
 * holds both sentences out.
 *
 * The close is worded off `lib/services/retention-automation.ts`, not off the
 * old line: reactivation is OPT-IN ("flips on once") and goes to patients as
 * they pass the practice's own recall interval — so "switch it on once", and
 * "as patients pass your recall interval", and nothing about a patient being
 * emailed the day they come due.
 */
export const metadata = pageMetadata({
  title: 'Dental recall scripts: email, text, letter & phone templates',
  description: guide?.description ?? '',
  path: '/resources/dental-recall-scripts',
})

export default function RecallScriptsGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the email to send itself?',
        title: 'The recall email is a job the software does',
        body: (
          <>
            Switch it on once and {MARKETING.productName} sends the recall email as patients pass your recall
            interval, then reports who booked back. The text, the letter and the phone call stay with your team: it
            does not send text messages today, and it does not print or mail letters. {usd(PLAN.price)}/mo, flat,
            after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        Most recall messages fail for the same reason: they read like a billing notice.
        “Our records indicate you are overdue for your prophylaxis appointment” makes a
        patient feel audited, and audited people don’t book — they archive. The scripts
        below follow three rules you can steal even if you never use our software. The
        email is the template that ships inside our own platform; the text, the letter
        and the phone scripts are written to the same rules.
      </GuideP>

      <GuideH2>The three voice rules</GuideH2>
      <GuideList
        items={[
          <><strong>Warm, never clinical.</strong> “It’s been a while — let’s get you back in” beats “you are overdue for recall.” The patient should feel missed, not flagged.</>,
          <><strong>One job per message.</strong> Every script below asks for exactly one thing: pick a time. No newsletter, no five links, no survey.</>,
          <><strong>Make booking one tap.</strong> A recall message without a booking link converts at a fraction of one with it — the moment of “fine, I’ll book” is fragile, and a phone tree kills it.</>,
        ]}
      />

      <GuideH2>The recall email (6+ months since last visit)</GuideH2>
      <GuideP>
        This is the actual reactivation template that ships inside DreamCRM — practices
        edit the details, but the shape is deliberate: a subject that sounds like a
        person, two short paragraphs, one button.
      </GuideP>
      <ScriptCard label="Email · subject line">
        Has it been a minute? Let’s get you scheduled.
      </ScriptCard>
      <ScriptCard label="Email · body">
        {`Hi {first name},

It’s been a little while since your last visit with us, and we’d love to see you again. Regular cleanings are the cheapest dentistry there is — they keep the small stuff small.

Grabbing a time takes about a minute:

[ Book a time ]

If mornings, evenings, or a certain day works best, just reply to this email and we’ll find it for you.

— The team at {practice name}`}
      </ScriptCard>
      <GuideP>
        Why it works: the first line carries no blame, the value claim (“keeps the small
        stuff small”) is concrete rather than scary, and the reply path is a real
        fallback for patients who won’t self-book.
      </GuideP>

      <GuideH2>The recall text (with the fine print that matters)</GuideH2>
      <ScriptCard label="Text · first recall ask">
        {`Hi {first name}, it’s {practice name}. It’s been a while since your last cleaning — want to grab a time? Book here: {link} Or just reply and we’ll set it up. Reply STOP to opt out.`}
      </ScriptCard>
      <ScriptCard label="Text · gentle follow-up (2–3 weeks later)">
        {`Hi {first name}, {practice name} here — still holding a spot for you. A quick cleaning now beats a long visit later: {link} Reply STOP to opt out.`}
      </ScriptCard>
      <GuideNote>
        Recall texts are marketing under US telecom rules (TCPA), so they need the
        patient’s prior consent to receive texts, a STOP line, and a working opt-out.
        Appointment reminders for a booked visit are different — but a “come back in”
        text is an ask, not a reminder. When in doubt, get the opt-in at check-in and
        honor STOP forever.
      </GuideNote>
      <GuideP>
        Keep texts to plain characters. One emoji or curly “smart quote” silently
        switches the message to a different SMS encoding and cuts the per-segment
        length from 160 characters to 70 — the same sentence suddenly costs double
        and arrives as two texts.
      </GuideP>

      <GuideH2>The phone script (for the call list)</GuideH2>
      <ScriptCard label="Phone · live answer">
        {`“Hi {first name}, this is {your name} from {practice name} — how are you? I was looking at the schedule and realized it’s been about {time} since we saw you. I’ve got a couple of openings {day} — would morning or afternoon be easier?”`}
      </ScriptCard>
      <ScriptCard label="Phone · voicemail (under 20 seconds)">
        {`“Hi {first name}, it’s {your name} at {practice name}. It’s been a while since your last visit and we’d love to get you back on the books. You can call us at {phone}, or book online at {website} — whichever’s easier. Talk soon!”`}
      </ScriptCard>
      <GuideP>
        The “morning or afternoon” close matters: it replaces “would you like to
        schedule?” (a yes/no question that invites no) with a choice between two yeses.
      </GuideP>

      <GuideH2>The recall letter template (for patients email can’t reach)</GuideH2>
      <GuideP>
        Some overdue patients have no email on file, a number that changed, or an inbox
        that swallowed everything above. A letter still arrives. Keep it to one page, sign it
        by hand if you can, and give two ways to book: a web address short enough to
        type, and the phone number.
      </GuideP>
      <ScriptCard label="Letter · one page, signed">
        {`Dear {first name},

It’s been a while since we last saw you, and we’d love to have you back. A cleaning and a quick look now is the easiest way to keep small things small.

Booking takes about a minute:

Online, any time: {booking link}
By phone: {phone} — we’ll find a time that suits you

If anything has changed since your last visit — your schedule, your insurance — tell us and we’ll work around it.

Warmly,

{dentist name}
and the team at {practice name}`}
      </ScriptCard>
      <ScriptCard label="Postcard · the short version">
        {`{first name}, it’s been a while — we’d love to see you.

Book a visit in about a minute at {booking link}, or call {phone}.

— The team at {practice name}`}
      </ScriptCard>
      <GuideNote>
        A postcard can be read by anyone who picks up the mail. Keep it to the
        invitation: no treatment, no balance, nothing clinical. If it needs to say more
        than “come back in”, it belongs in an envelope.
      </GuideNote>
      <GuideP>
        Why it works: it is the email’s shape on paper — no blame in the first line, one
        ask, two easy ways to say yes. The line about what has changed earns its place
        here more than anywhere else, because the patients a letter reaches are often
        the ones who drifted when something did.
      </GuideP>

      <GuideH2>The cadence</GuideH2>
      <GuideList
        items={[
          <><strong>Due date + 2 weeks:</strong> the recall email. Most rebooks happen here.</>,
          <><strong>+3 weeks:</strong> the text (if you have consent), or a second email with a different subject.</>,
          <><strong>+6 weeks:</strong> the phone call for high-value or long-overdue patients. A person calling is your most expensive channel — spend it where the email and text already failed.</>,
          <><strong>+8 weeks:</strong> the letter, for patients with no email on file and the ones who stayed quiet everywhere else. It costs a stamp and a signature, so it goes last.</>,
          <><strong>Every 6 months after:</strong> stay in the cycle quietly. A patient who ignores three asks isn’t gone; they’re busy. The practices that win recall are simply still asking in month nine.</>,
        ]}
      />
      <GuideNote>
        Frequency-cap the whole thing per patient, not per campaign. A patient reachable
        by two channels should never get double the messages — that’s how you earn
        opt-outs and one-star reviews at the same time.
      </GuideNote>

      <GuideH2>Measure booked visits, not opens</GuideH2>
      <GuideP>
        An open rate tells you the subject line worked. The only number that pays rent
        is <em>booked back</em>: of the patients who were due and reachable, how many
        ended up with a visit on the schedule? Track that funnel — due → sent → opened
        → booked — and change one thing at a time. (This is exactly the funnel
        DreamCRM’s recall engine reports out of the box, if you’d rather not build the
        spreadsheet.) Curious what the whole gap is worth in dollars?{' '}
        <Link href="/roi" className="font-semibold text-teal-700 hover:underline">
          Run your numbers through the recall ROI calculator
        </Link>{' '}
        — it takes thirty seconds and nothing you type leaves your browser.
      </GuideP>
      <GuideP>
        Recall is for the patient who never booked. For the one who booked and did not
        come, there is a{' '}
        <Link
          href="/resources/dental-cancellation-no-show-policy"
          className="font-semibold text-teal-700 hover:underline"
        >
          cancellation and no-show policy template
        </Link>
        , with the letters and the phone scripts that go with it.
      </GuideP>
    </GuideShell>
  )
}
