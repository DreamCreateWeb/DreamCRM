import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { NO_SHOW_SOURCES } from '@/lib/marketing/guide-sources'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { productEmail } from '@/lib/marketing/guide-templates'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-cancellation-no-show-policy')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

const SRC = NO_SHOW_SOURCES

/**
 * THE FIRST-MISS EMAIL IS THE PRODUCT'S OWN, READ RATHER THAN RETYPED
 * (`lib/marketing/guide-templates.ts`): the note the product sends when a
 * visit is marked a no-show, on by default, with its `{{tokens}}` respelled
 * as the blanks every other card here uses. The heading, the button and the
 * last line are literals in the sender (`sendNoShowRebookEmail`,
 * `lib/services/appointments.ts`); the test reads that file for them.
 */
const MISSED_VISIT_NOTE = productEmail('no_show_rebook')

/**
 * THE CANCELLATION & NO-SHOW POLICY — the first guide that touches a fee and
 * a rule about who may be asked for one. Four things on this page are held by
 * `tests/marketing/no-show-policy-guide.test.tsx` and none is about layout:
 *
 * 1. NO NUMBER IN A CARD. Every fee, notice period and look-back is a
 *    `{blank}`. This site has no standing to tell a practice what to charge
 *    its patients, and no first-hand source for what practices do charge. The
 *    one figure in the prose — a full day's notice — is quoted from Open
 *    Dental's own manual, which is where it was read.
 *
 * 2. THE RULE ABOUT PUBLIC PROGRAMS IS QUOTED. Two states, each in its own
 *    words, each linked and dated (`lib/marketing/guide-sources.ts`). The
 *    page says "two" and sends the reader to their own state, because a third
 *    state is reported to differ and we could not open its page.
 *
 * 3. NO DISMISSAL LETTER. The ladder stops at "we will book you differently".
 *
 * 4. THE CLOSE IS WORDED OFF THE CODE. Reminders: `REMINDER_DEFAULTS` (on,
 *    72h + 24h) and the reminder's Confirm / can't-make-it landing
 *    (`app/c/[token]`). Self-serve changes: `DEFAULT_PORTAL_SETTINGS`
 *    (`features.reschedule`, a notice window). The waitlist:
 *    `offerFreedSlot`, called from the one cancel path whoever cancels. A
 *    visit marked missed: `markNoShow` sends the note below and opens a
 *    "rebook" follow-up due the next day. The product has no fee feature,
 *    sends no text today, mails nothing — so the page says the policy and the
 *    fee stay with the practice.
 */
export const metadata = pageMetadata({
  title: 'Dental cancellation & no-show policy: template, letters & scripts',
  description: guide?.description ?? '',
  path: '/resources/dental-cancellation-no-show-policy',
  type: 'article',
})

export default function NoShowPolicyGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want fewer of these letters to send?',
        title: 'The reminders and the rebooking are jobs the software does',
        body: (
          <>
            {MARKETING.productName} emails a reminder three days before and the day before each visit, on from day
            one, with a button to confirm or to say they can’t make it. Patients can move or cancel a visit
            themselves, outside your notice window, and a cancelled time is offered by email to matching patients
            on your waitlist: the first to claim it gets it. Mark a visit missed and the patient is sent the note
            above, while your team gets a follow-up to rebook them the next day. The policy and the fee stay with
            you. It does not charge a missed-appointment fee, it does not send text messages today, and it does not
            print or mail letters. {usd(PLAN.price)}/mo, flat, after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        Most no-show policies are written the afternoon after a bad one, and they read that
        way: capital letters, “failure to”, a fee announced before a single courtesy.
        Patients don’t read that as a rule. They read it as how the practice feels about
        them, and then they miss the visit anyway, because the policy never said how to
        cancel.
      </GuideP>
      <GuideP>
        A broken-appointment policy that works does three things a notice on the wall
        can’t. It says how much notice you need and how to give it. It says what happens
        each time, in a ladder everyone at the desk applies the same way. And it is signed
        before there is anything to argue about. Below: the policy to sign, the words for
        the phone, the three letters, and the patients you may not charge at all.
      </GuideP>

      <GuideH2>Three rules before you write it</GuideH2>
      <GuideList
        items={[
          <><strong>Ask first, charge second.</strong> Say the notice you need, and the easy ways to give it, before the word “fee” appears. A patient who can cancel by answering an email at night has an easier thing to do than not showing up.</>,
          <><strong>One ladder, used by everyone.</strong> The front desk should never have to decide who deserves the fee. First miss, second miss, third miss: the policy decides, and it decides the same way for the patient you love and the one you dread.</>,
          <><strong>Forgive the first one in writing.</strong> Everybody misses one. A first miss forgiven on paper is what gives the second one’s fee its standing.</>,
        ]}
      />

      <GuideH2>The cancellation and no-show policy (to sign)</GuideH2>
      <GuideP>
        Hand it over with the new-patient forms and get a signature. Put the same words on
        your website and in your reminders, so nobody meets the policy for the first time
        on the day it applies to them.
      </GuideP>
      <ScriptCard label="Policy · one page, signed at the first visit">
        {`Our appointment policy

When we book your visit, we set that time aside for you alone. If your plans change, please tell us at least {notice period} ahead, so we can offer the time to another patient who is waiting.

To move or cancel a visit: call {phone}, reply to your reminder, or go to {booking link}. Any of the three counts as telling us.

If a visit is missed, or cancelled with less than {notice period} of notice:

The first time: we will call to find you a new time. No fee.
The second time within {period}: a fee of {fee} is added to your account.
The third time within {period}: we will ask for a deposit of {deposit}, or offer you openings on short notice, before we set aside another long appointment.

Emergencies and illness are different. Tell us what happened and we will listen.

The fee is not sent to your insurance. It does not apply to visits covered by Medicaid.

Patient name ____________   Signature ____________   Date ____________`}
      </ScriptCard>

      <GuideH2>How to fill in the blanks</GuideH2>
      <GuideList
        items={[
          <><strong>{'{notice period}'}.</strong> A full day is the familiar one: <GuideSourceLink source={SRC.openDental} /> describes its cancelled-appointment code as the one for “less than a 24-hour notice”. Write yours in business days, so a Sunday-night message about a Monday-morning visit is answered by the policy and not argued at the desk.</>,
          <><strong>{'{fee}'}.</strong> An amount you could say out loud to a patient you like. It is there to make the second miss rarer, not to pay for the hour. A fee big enough to start an argument gets waived at the desk, and a policy that is waived stops being one.</>,
          <><strong>{'{period}'}.</strong> A rolling twelve months works: long enough to see a pattern, short enough that a miss from years ago stops counting.</>,
          <><strong>The third rung.</strong> Pick the deposit or the short-notice booking and delete the other. If you keep the deposit, say that it goes toward the visit when the patient comes in.</>,
          <><strong>The last line.</strong> Keep the Medicaid sentence if you see patients on a public program, and read the section on who you may not charge before you change it.</>,
        ]}
      />

      <GuideH2>When a patient cancels late: the phone script</GuideH2>
      <ScriptCard label="Phone · a late cancellation, the first time">
        {`“Thanks for calling to tell us, {first name}. That helps. I’ll take {day} off the schedule. It is inside our {notice period} window, so I’ll note it as the free one our policy allows; a second within {period} would carry the {fee} fee. While I have you, let’s find a new time. I have {first opening} or {second opening}. Which is easier?”`}
      </ScriptCard>
      <GuideP>
        Three things happen in that script, in order. The patient is thanked for calling
        rather than scolded for cancelling. The policy is restated as a fact about the
        calendar, not a threat. And the call ends with a visit on the books, which is the
        part that matters: a late cancellation that rebooks on the same call has cost you
        an hour, and one that doesn’t may have cost you the patient.
      </GuideP>
      <ScriptCard label="Voicemail · ten minutes after a missed start">
        {`“Hi {first name}, it’s {your name} at {practice name}. We had you down for {time} today and wanted to check that you’re alright. Call us at {phone} when you get a moment and we’ll find you a new time.”`}
      </ScriptCard>
      <GuideNote>
        A voicemail is heard by whoever plays it. Say who is calling and that you would
        like to find a new time. Leave out the treatment, and leave out anything about
        money.
      </GuideNote>

      <GuideH2>The missed-appointment letters</GuideH2>
      <GuideP>
        The first one is an email, sent the same day, and it says nothing about money or
        the policy. This is the missed-visit note that ships inside {MARKETING.productName}.
        It goes out when a visit is marked a no-show, and it works the same pasted into
        your own email.
      </GuideP>
      <ScriptCard label="Email · the first miss, same day (no fee)">
        {`Subject: ${MISSED_VISIT_NOTE.subject}

We missed you — no big deal

${MISSED_VISIT_NOTE.body}

[ Find a new time ]

Prefer to talk it through? Call us at {phone}.`}
      </ScriptCard>
      <GuideP>
        Put the second and the third on paper as well as in email. A fee that arrives only
        by email is a fee the patient says they never heard about.
      </GuideP>
      <ScriptCard label="Letter · the second miss (the fee)">
        {`Dear {first name},

We had {date} at {time} set aside for you, and we were not able to fill it.

This is the second visit missed within {period}. As the appointment policy you signed on {date signed} says, we have added a missed-appointment fee of {fee} to your account. It is not sent to your insurance.

If something serious kept you away, please call and tell us. We would rather hear it than charge it.

We would still like to see you. You can book at {booking link} or call {phone}.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <ScriptCard label="Letter · the third miss (how we book from here)">
        {`Dear {first name},

You have now missed {number} visits we had set aside for you, most recently on {date}. We know schedules get hard, and we want to keep seeing you.

From here we will book your visits a little differently.

[Option A] We will ask for a deposit of {deposit} to hold a longer appointment, and put it toward your visit when you come in.

[Option B] We will offer you openings on the same day or the next, as we have them, rather than booking far ahead.

Call us at {phone} when you would like to come in.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <GuideP>
        What is not on this page is a fourth letter, the one that ends the relationship.
        Dismissing a patient has rules about notice, emergency care and records that
        change from state to state. <GuideSourceLink source={SRC.cda}>The California Dental Association</GuideSourceLink>{' '}
        puts it this way: “Dentists should consider potential risks and
        follow laws and ethical standards before choosing to dismiss a patient.” That
        letter comes from your malpractice carrier or your state dental association. Ask
        them before you write it.
      </GuideP>

      <GuideH2>Who you may not charge</GuideH2>
      <GuideNote>
        This is not legal advice. The rules for public programs are set state by state and
        plan by plan, and we have read two of them. Read your own state’s Medicaid dental
        manual, and your contract with any plan you are in network with, before a fee goes
        on anyone’s account.
      </GuideNote>
      <GuideP>
        Two programs, in their own words. North Carolina Medicaid: “{SRC.ncMedicaid.quote}”
        Its page gives the reasoning as well, quoting the federal Medicaid agency: a missed
        appointment “is not a distinct reimbursable Medicaid service, but a part of
        providers’ overall costs of doing business.” And the California Dental
        Association, on that state’s program: “{SRC.cda.quote}”
      </GuideP>
      <GuideP>
        Leave the deposit on the third rung out for these patients as well. The North
        Carolina page says a provider may bill a Medicaid patient for covered services
        “only the allowable co-payments, co-insurance, or deductibles.” Use the
        short-notice booking instead.
      </GuideP>
      <GuideP>
        The same page carries a rule worth borrowing for everyone else. It quotes
        Medicare’s position that a missed-appointment charge is allowed “provided that they
        do not discriminate against Medicare beneficiaries but also charge non-Medicare
        patients for missed appointments.” Whatever you charge, charge it to every patient
        the policy covers, or to no one.
      </GuideP>
      <GuideP>
        Read {formatCheckedOn(SRC.ncMedicaid.readOn)}:{' '}
        <GuideSourceLink source={SRC.ncMedicaid} />, and{' '}
        <GuideSourceLink source={SRC.cda}>the California Dental Association’s article on missed Medi-Cal appointments</GuideSourceLink>{' '}
        (dated {SRC.cda.pageSays}).
      </GuideP>

      <GuideH2>Track every miss, even the ones you forgive</GuideH2>
      <GuideP>
        “The second time within twelve months” only works if the first time was written
        down. There are already two procedure codes for a broken appointment, D9986 for a
        missed one and D9987 for a cancelled one, and posting a code is not the same thing
        as charging a fee. <GuideSourceLink source={SRC.openDental} /> says breaking an
        appointment as Missed adds D9986, used “when the patient simply did not show up
        for the appointment”, and breaking it as Cancelled adds D9987.{' '}
        <GuideSourceLink source={SRC.dentrix}>The Dentrix Enterprise blog</GuideSourceLink>{' '}
        suggests posting the code to the Ledger whether or not you charge, so missed visits
        can be reported by date range.
      </GuideP>
      <GuideP>Then count three things each month:</GuideP>
      <GuideList
        items={[
          <><strong>Missed with no word</strong>: the true no-shows.</>,
          <><strong>Cancelled inside the notice period.</strong> These patients did the right thing late, and deserve a different conversation.</>,
          <><strong>How many of those hours you filled.</strong> If this number stays near zero, the fix is a short-notice list, not a bigger fee.</>,
        ]}
      />

      <GuideH2>Make the miss rarer before you price it</GuideH2>
      <GuideList
        items={[
          <><strong>Remind twice, and make confirming one step.</strong> A reminder that takes a phone call to answer asks more of a busy patient than a button does.</>,
          <><strong>Make cancelling as easy as booking.</strong> A no-show is often a cancellation that had nowhere to go: the patient knew at nine at night, and the phones were off. A link that lets them move the visit turns a no-show into notice you can use.</>,
          <><strong>Keep a short-notice list.</strong> Ask every patient who wants an earlier time whether you may contact them when one opens. A late cancellation is only a loss if nobody takes the hour.</>,
          <><strong>Confirm the long ones by voice.</strong> For a long appointment, a call from a person two days ahead is worth the minutes.</>,
        ]}
      />
      <GuideP>
        The reminders themselves are their own page:{' '}
        <Link
          href="/resources/dental-appointment-reminder-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          appointment reminder templates
        </Link>{' '}
        for email, text and phone. And for the patient who cancels and then goes quiet, the{' '}
        <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
          dental recall scripts
        </Link>{' '}
        pick up where this page stops.
      </GuideP>
    </GuideShell>
  )
}
