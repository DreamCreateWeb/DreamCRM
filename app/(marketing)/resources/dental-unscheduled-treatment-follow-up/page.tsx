import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { TREATMENT_FOLLOWUP } from '@/lib/marketing/guide-sources'
import { savedReply, TREATMENT_CHECKIN_TEXT } from '@/lib/marketing/guide-templates'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-unscheduled-treatment-follow-up')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

/**
 * THE UNSCHEDULED-TREATMENT FOLLOW-UP GUIDE — organic queue item 8. What it is
 * held to (`tests/marketing/treatment-follow-up-guide.test.tsx`):
 *
 * 1. NO CARD PRESSES. No deadline of ours, no "before it gets worse", no
 *    exclamation mark. The patient's decision stays the patient's, and the
 *    first rule on the page is the ADA's own sentence about that.
 *
 * 2. THE FRONT DESK NEVER SAYS WHAT HAPPENS IF THE PATIENT WAITS. That is the
 *    dentist's sentence. The one script that needs it carries a blank for the
 *    dentist's words, and the note under it gives the script for when the
 *    chart has none. No card contains a clinical word of ours.
 *
 * 3. THE VOICEMAIL AND THE TEXT NAME NO TREATMENT AND NO COST.
 *
 * 4. THE CHECK-IN MESSAGE IS THE PRODUCT'S — the saved reply that ships in
 *    Messages, read from `DEFAULT_MESSAGE_TEMPLATES` and never retyped.
 *
 * 5. THE YEAR-END NOTE ASKS AND DOES NOT TELL. The ADA's patient site says
 *    most plans' unused benefits do not roll over AND that plans differ; the
 *    page quotes both sentences, and the template says "if your plan runs on
 *    the calendar year".
 *
 * 6. THE CLOSE SAYS WHAT THE PRODUCT DOES NOT DO FIRST: it does not read
 *    treatment plans (`NEVER_TOUCHED`), so the list is the practice
 *    software's own report, and the page names two of those in each vendor's
 *    words.
 */
const CHECK_IN = savedReply('Following up on your treatment plan')
const SAYS = TREATMENT_FOLLOWUP

export const metadata = pageMetadata({
  title: 'Unscheduled dental treatment follow-up scripts: what to say, write and send',
  description: guide?.description ?? '',
  path: '/resources/dental-unscheduled-treatment-follow-up',
  type: 'article',
})

export default function TreatmentFollowUpGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the second conversation to stop depending on memory?',
        title: 'Remembering to ask again is a job the software does',
        body: (
          <>
            {MARKETING.productName} does not read treatment plans. They stay in your practice software, and so
            does the list of who has not scheduled. What it holds is the promise you made at the desk: a
            follow-up on the patient’s record has an owner and a due date, shows on that person’s day until it
            is done, and asks how it went when you close it. The check-in above is a saved reply in Messages,
            and the plan can go to the patient as a PDF in the same thread. It does not send text messages
            today. {usd(PLAN.price)}/mo, flat, after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        Dental teams call it unscheduled treatment, pending treatment or case acceptance.
        The patient calls it “that thing the dentist said I need”. A patient who answers
        “let me think about it” has not said no. They have said they need something
        first: an answer, a number, a little time, or somebody to ask again.
      </GuideP>
      <GuideP>
        Below: what to say before the patient leaves, the plan in writing, the check-in
        message, the follow-up call and its voicemail, plain answers for cost, nerves and
        “I’ll wait”, the note about year-end benefits, and the letter that closes the
        loop.
      </GuideP>

      <GuideH2>Three rules for following up on treatment</GuideH2>
      <GuideList
        items={[
          <>
            <strong>The decision is the patient’s.</strong> The American Dental Association’s code of conduct says
            “{SAYS.adaCode.says.involvement}” (
            <GuideSourceLink source={SAYS.adaCode.source}>section 1.A, on ada.org</GuideSourceLink>
            ). A follow-up is the second half of that: another chance to ask a question, away from the chair.
          </>,
          <><strong>Ask what is in the way before you offer a fix.</strong> Cost, nerves, time and doubt each need a different answer. A payment plan does nothing for a patient who is afraid.</>,
          <><strong>The front desk repeats the doctor and adds nothing.</strong> What the treatment is for, and what happens if it waits, are the dentist’s sentences. Get them into the chart in plain words, and say them as written.</>,
        ]}
      />

      <GuideH2>Where the list comes from</GuideH2>
      <GuideP>
        Your practice software already keeps it. Two examples, each in the vendor’s own
        words. Open Dental: “{SAYS.openDental.says.report}” (
        <GuideSourceLink source={SAYS.openDental.source} />
        ). Dentrix Enterprise: “{SAYS.dentrix.says.report}” (
        <GuideSourceLink source={SAYS.dentrix.source} />, in a post dated {SAYS.dentrix.source.pageSays}). If you
        use something else, search its help for “unscheduled treatment”.
      </GuideP>
      <GuideP>
        Pick one day a week to run it, so that no plan sits unasked for longer than that.
        The pages quoted in this guide were read {formatCheckedOn(SAYS.adaCode.source.readOn)}.
      </GuideP>

      <GuideH2>Before the patient leaves</GuideH2>
      <GuideP>
        The easiest follow-up is the one you agree on while the patient is still standing
        at the desk.
      </GuideP>
      <ScriptCard label="In person · the handoff at the front desk">
        {`“{first name}, {doctor} would like to see you back for {treatment, in the doctor’s words}. I can find you a time now. Would {day} or {day} work?”

If they hesitate: “Of course. Can I ask what would help you decide? Is it the timing, the cost, or a question about the treatment itself?”

If they want to think it over: “That’s completely fine. I’ll send you the plan in writing today. Would it be all right if I checked in with you on {day}?”`}
      </ScriptCard>
      <GuideNote>
        The last question is the one that matters. A patient who agreed to a check-in is
        expecting your call, and you are keeping a promise.
      </GuideNote>

      <GuideH2>The treatment plan in writing, the same day</GuideH2>
      <ScriptCard label="Email · the plan in writing">
        {`Subject: Your treatment plan from {practice name}

Hi {first name},

Thank you for coming in today. As promised, the treatment plan {doctor} went over with you is attached, with our estimate of your part.

The estimate is our best reading of your insurance benefits. What your insurance pays is decided by your insurer.

If you have questions, reply to this email or call us at {phone}. When you are ready, you can book at {booking link}.

{your name}
{practice name}`}
      </ScriptCard>
      <GuideNote>
        The email says a treatment plan is attached and nothing about what is in it.
        Where your practice puts clinical detail, in an email or behind a portal sign-in,
        is a decision for whoever handles privacy there.
      </GuideNote>

      <GuideH2>The check-in message</GuideH2>
      <GuideP>
        On the day you agreed. This is the saved reply that ships in{' '}
        {MARKETING.productName}’s Messages for this moment. It is short on purpose.
      </GuideP>
      <ScriptCard label="Message · the check-in">{CHECK_IN.body}</ScriptCard>
      <ScriptCard label="Text · the check-in">{TREATMENT_CHECKIN_TEXT}</ScriptCard>
      <GuideNote>
        Text only patients who have agreed to get texts from you. The text names no
        treatment and no cost on purpose: a phone screen is read by whoever is holding
        the phone.
      </GuideNote>

      <GuideH2>The follow-up call</GuideH2>
      <ScriptCard label="Phone · the check-in call">
        {`“Hi {first name}, it’s {your name} at {practice name}. You asked me to check in about the treatment {doctor} recommended. Is this a good time?”

If yes: “Did any questions come up when you looked at the plan?” Then: “Would you like me to find you a time?”

If they are not ready: “No problem at all. Would you like me to check back in a few weeks, or would you rather call us when you’re ready?”

If they say no: “Thank you for telling me. I’ll let {doctor} know, and we’ll look at it again together at your next check-up.”`}
      </ScriptCard>
      <ScriptCard label="Voicemail · the check-in call, unanswered">
        {`“Hi {first name}, it’s {your name} at {practice name}, following up on your visit. Please call me at {phone} when you have a moment. Thank you.”`}
      </ScriptCard>
      <GuideNote>
        A voicemail is heard by whoever plays it. No treatment, no tooth, no cost. Your
        name, the practice and the number are the whole message.
      </GuideNote>

      <GuideH2>When something is in the way</GuideH2>
      <GuideP>
        Four reasons, four answers. None is a rebuttal: each offers a next step and
        leaves the choice with the patient.
      </GuideP>
      <ScriptCard label="Phone · when it is the cost">
        {`“That makes sense. There are a few ways to make it easier. Some treatment can be done in stages, and I can ask {doctor} whether yours can. We also have {the payment options your practice offers}. Would it help if I wrote those out with the numbers for you?”`}
      </ScriptCard>
      <GuideP>
        If your practice has its own membership plan, this is the conversation it belongs
        in. Pricing one is{' '}
        <Link href="/resources/dental-membership-plan-pricing" className="font-semibold text-teal-700 hover:underline">
          a guide of its own
        </Link>
        .
      </GuideP>
      <ScriptCard label="Phone · when it is nerves">
        {`“Thank you for telling me. You are not alone in that, and {doctor} would rather know. Would it help to come in and ask your questions first, with nothing scheduled? Or I can walk you through what the visit is like.”`}
      </ScriptCard>
      <ScriptCard label="Phone · when it does not hurt">
        {`“I understand. Here is what {doctor} noted about waiting: {what the doctor said about waiting, word for word}. If you would like to hear that from {doctor}, I can set up a call.”`}
      </ScriptCard>
      <GuideNote>
        The middle of that script belongs to the dentist. If it is not in the chart, the
        script is: “That is a good question for the doctor. Let me have them call you.”
      </GuideNote>
      <ScriptCard label="Phone · when it is time">
        {`“We can work around that. The visit takes about {length of visit}, and we have {the early, late or lunch-hour times you offer}. Which would be easiest for you?”`}
      </ScriptCard>

      <GuideH2>The year-end benefits note</GuideH2>
      <GuideP>
        For a patient whose dental plan runs on the calendar year, the end of December
        is a real deadline, and it is fair to say so once. MouthHealthy, the American
        Dental Association’s site for patients, puts it this way: “
        {SAYS.benefits.says.deadline}” The same page goes on: “{SAYS.benefits.says.varies}” (
        <GuideSourceLink source={SAYS.benefits.source} />
        ). That second sentence is why the note below asks and does not tell.
      </GuideP>
      <GuideP>
        Send it to the patients it can help: the ones with benefits left. The two reports
        above show that. Open Dental’s has a filter for it: “{SAYS.openDental.says.remaining}” Of
        its own report, the Dentrix Enterprise post says: “{SAYS.dentrix.says.remaining}”
      </GuideP>
      <ScriptCard label="Email or letter · the year-end benefits note">
        {`Subject: Your dental benefits and the end of the year

Hi {first name},

At your visit on {date of visit}, {doctor} recommended treatment that has not been scheduled yet.

If your dental plan runs on the calendar year, benefits you have not used by the end of December may not carry into next year. Your plan document, or the number on your insurance card, will tell you for certain, and we are glad to check what your plan shows.

If you would like to use this year’s benefits, we still have times in {month}. Call {phone} or book at {booking link}.

If you have decided to wait, that is your call. Tell us and we will not send another note about it.

{your name}
{practice name}`}
      </ScriptCard>
      <GuideNote>
        Send it once. A note about benefits running out, sent to a patient who has none
        left, is an untruth with your name on it.
      </GuideNote>

      <GuideH2>The letter that closes the loop</GuideH2>
      <GuideP>
        When the calls have gone unanswered, the last thing to send is a letter that says
        the asking is over and the door is open.
      </GuideP>
      <ScriptCard label="Letter · closing the loop">
        {`Dear {first name},

At your visit on {date of visit}, {doctor} recommended treatment, and we have not been able to reach you to schedule it.

We do not want to keep calling if you would rather we did not, so this is our last note about it for now. The recommendation stays in your record, and {doctor} will go over it with you again at your next check-up.

If anything changes, or you have a question about the treatment, the cost or the timing, call us at {phone}. We would be glad to hear from you.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <GuideNote>
        Keep a copy with the patient’s record. What a practice should document when a
        patient declines or puts off recommended treatment is a question for your
        malpractice carrier: ask them, then make their answer the routine. This is not
        legal advice.
      </GuideNote>

      <GuideH2>A cadence that ends</GuideH2>
      <GuideList
        items={[
          <><strong>Before they leave:</strong> ask to schedule. If the answer is “not yet”, agree on a day to check in.</>,
          <><strong>The same day:</strong> the plan in writing.</>,
          <><strong>On the day you agreed:</strong> the check-in, by message or by phone.</>,
          <><strong>A few weeks later:</strong> one more call.</>,
          <><strong>Once, in the autumn:</strong> the benefits note, for the patients who have benefits left.</>,
          <>
            <strong>Then stop.</strong> Send the closing letter, and let the dentist bring it up at the next check-up
            (getting them in for that one is what the{' '}
            <Link href="/resources/dental-recall-scripts" className="font-semibold text-teal-700 hover:underline">
              recall scripts
            </Link>{' '}
            are for).
          </>,
        ]}
      />
      <GuideP>
        Every attempt gets a line in the patient’s record: the date, who reached out, and
        what the patient said. The next person to open that record should not have to
        guess.
      </GuideP>
    </GuideShell>
  )
}
