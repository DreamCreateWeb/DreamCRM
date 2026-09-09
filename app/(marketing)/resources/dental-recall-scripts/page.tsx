import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, ScriptCard } from '../guide-ui'

const guide = getResourceGuide('dental-recall-scripts')

export const metadata = {
  title: 'Dental recall scripts: email, text & phone templates that work',
  description: guide?.description,
  alternates: { canonical: '/resources/dental-recall-scripts' },
}

export default function RecallScriptsGuide() {
  if (!guide) notFound()
  return (
    <GuideShell guide={guide}>
      <GuideP>
        Most recall messages fail for the same reason: they read like a billing notice.
        “Our records indicate you are overdue for your prophylaxis appointment” makes a
        patient feel audited, and audited people don’t book — they archive. The scripts
        below are the ones our own platform sends for real practices, and they follow
        three rules you can steal even if you never use our software.
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

      <GuideH2>The cadence</GuideH2>
      <GuideList
        items={[
          <><strong>Due date + 2 weeks:</strong> the recall email. Most rebooks happen here.</>,
          <><strong>+3 weeks:</strong> the text (if you have consent), or a second email with a different subject.</>,
          <><strong>+6 weeks:</strong> the phone call for high-value or long-overdue patients. A person calling is your most expensive channel — spend it where the email and text already failed.</>,
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
    </GuideShell>
  )
}
