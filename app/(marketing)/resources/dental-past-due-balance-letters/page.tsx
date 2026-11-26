import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getResourceGuide } from '@/lib/marketing/resources'
import { INSTALLMENT_RULE, REMINDER_RULE } from '@/lib/marketing/guide-sources'
import { productEmail } from '@/lib/marketing/guide-templates'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { GuideShell, GuideH2, GuideP, GuideList, GuideNote, GuideSourceLink, ScriptCard } from '../guide-ui'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { pageMetadata } from '@/lib/marketing/seo'
import { getQuotedPlan } from '@/lib/stripe-config'

const guide = getResourceGuide('dental-past-due-balance-letters')

/** Ours, resolved rather than typed — the same read the shell makes. */
const PLAN = getQuotedPlan()

/**
 * THE PAST-DUE BALANCE LETTERS GUIDE — the page in this library with the most
 * ways to hurt somebody. What it is held to
 * (`tests/marketing/past-due-letters-guide.test.tsx`):
 *
 * 1. NO CARD THREATENS. The template names no consequence of its own. The
 *    final notice carries a blank the practice fills from its own financial
 *    policy, and the note under it says to fill it only with something the
 *    practice will do.
 *
 * 2. THE VOICEMAIL SAYS NOTHING ABOUT MONEY.
 *
 * 3. NO TEXT TEMPLATE, and the reason is the calling rule's own sentence —
 *    the one the reminder guide quotes for why a balance does not belong in
 *    a reminder.
 *
 * 4. THE BALANCE EMAIL IS THE PRODUCT'S, read from its spec.
 *
 * 5. THE INSTALLMENT RULE IS QUOTED AND NOT EXPLAINED.
 *
 * 6. THE CLOSE IS CONDITIONAL: a balance in this product comes from the
 *    practice's own software (`patient.pms_balance_cents`, written by the PMS
 *    sync), a pay link needs online payments switched on, and the automatic
 *    reminder is off until chosen and stops at the product's own ceiling
 *    (`BALANCE_OUTREACH_DEFAULTS`).
 */
const BALANCE = productEmail('balance_pay_link')

export const metadata = pageMetadata({
  title: 'Dental past-due balance letters: templates from first reminder to final notice',
  description: guide?.description ?? '',
  path: '/resources/dental-past-due-balance-letters',
  type: 'article',
})

export default function PastDueLettersGuide() {
  if (!guide) notFound()
  return (
    <GuideShell
      guide={guide}
      close={{
        eyebrow: 'Want the first ask to send itself?',
        title: 'The balance email and the pay link are jobs the software does',
        body: (
          <>
            With your practice software connected and online payments switched on, {MARKETING.productName} shows who
            owes what and emails a patient their balance with a link to pay it. It can send that reminder on a
            schedule if you turn it on, and it stops after three, because by then it is a phone call. The letters
            and the calls stay with your team: it does not print or mail letters, it does not send text messages
            today, and it is not a collection agency. {usd(PLAN.price)}/mo, flat, after {TRIAL.days} days free.
          </>
        ),
      }}
    >
      <GuideP>
        A past-due letter has two readers: the patient who forgot, and the patient who
        cannot pay right now. Written for the first, it gets paid. Written for the second,
        it gets a phone call and a plan. Written for neither, in capital letters with
        “final notice” on the first page, it gets ignored by both.
      </GuideP>
      <GuideP>
        Below: the balance email, three letters that get firmer without getting louder, the
        phone call, the payment-plan letter, and why there is no text template on this
        page.
      </GuideP>

      <GuideH2>Three rules for asking for money</GuideH2>
      <GuideList
        items={[
          <><strong>Assume it was missed.</strong> Until a patient tells you otherwise, an unpaid balance is an envelope that never got opened. Write to that person.</>,
          <><strong>Say the amount, what it is for, and how to pay. Every time.</strong> A notice that makes the patient call to find out what they owe has added a step to getting paid.</>,
          <><strong>Promise only what you will do.</strong> One final notice, with a date. Then do the thing it says.</>,
        ]}
      />

      <GuideH2>Before you send anything</GuideH2>
      <GuideList
        items={[
          <><strong>Is the claim settled?</strong> A balance that is really an unpaid insurance claim is not the patient’s yet.</>,
          <><strong>Has a payment come in?</strong> Check what has been paid online and not yet posted.</>,
          <><strong>Did the statement go out?</strong> A reminder for a bill nobody sent is the fastest way to lose the argument.</>,
        ]}
      />

      <GuideH2>The balance email</GuideH2>
      <GuideP>
        This is the balance email that ships inside {MARKETING.productName}. It names the
        amount, gives one button, and leaves room for “something looks off”.
      </GuideP>
      <ScriptCard label="Email · the balance, with a link to pay">
        {`Subject: ${BALANCE.subject}

${BALANCE.body}

[ Pay my balance ]`}
      </ScriptCard>

      <GuideH2>The past-due letters</GuideH2>
      <GuideP>
        Three letters, about a month apart. Each one is shorter than the last and says
        the same three things: how much, what for, and how to pay.
      </GuideP>
      <ScriptCard label="Letter · the first reminder">
        {`Dear {first name},

There is a balance of {balance} on your account for your visit on {date of visit}. It may simply have been missed, so this is a friendly reminder.

You can pay online at {pay link}, by phone at {phone}, or by mail with the slip below.

If your insurance should have covered this, or anything here looks wrong, please call us. We would rather fix a mistake than collect one.

Thank you,

{your name}
{practice name}`}
      </ScriptCard>
      <ScriptCard label="Letter · the second notice, with a payment plan">
        {`Dear {first name},

We wrote on {date of first letter} about a balance of {balance} for your visit on {date of visit}, and we have not heard from you.

If paying it all at once is hard right now, we can split it. We could do {installment} a month for {number of months} months.

You can pay online at {pay link}, or call {phone} and ask for {your name} to set up a plan.

If you believe this balance is wrong, please tell us and we will look at it with you.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <ScriptCard label="Letter · the final notice">
        {`Dear {first name},

This is our third letter about a balance of {balance} for your visit on {date of visit}.

We would still like to settle this with you directly. If we receive payment, or set up a payment plan with you, by {date}, nothing further happens.

After {date}: {what your financial policy says happens next}.

You can pay online at {pay link} or call {phone}.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <GuideNote>
        Fill the last blank from your own financial policy, and only with something you
        will do. A notice that names a consequence the practice has never carried out
        teaches a patient to ignore the next one. What a practice, or an agency acting
        for it, may say and do when collecting is set by federal and state law. This page
        is wording. This is not legal advice.
      </GuideNote>

      <GuideH2>The phone call</GuideH2>
      <ScriptCard label="Phone · the balance call">
        {`“Hi {first name}, it’s {your name} at {practice name}. Is this a good time for a quick question about your account?”

If yes: “There’s a balance of {balance} from your visit on {date of visit}, and I wanted to make sure the statement reached you. Would you like to take care of it now, or would it help to split it into a few payments?”

If they say it is wrong: “Thank you for telling me. Let me look into it and call you back by {day}.”`}
      </ScriptCard>
      <ScriptCard label="Voicemail · the balance call, unanswered">
        {`“Hi {first name}, it’s {your name} at {practice name}. Please give me a call at {phone} when you have a moment. Thank you.”`}
      </ScriptCard>
      <GuideNote>
        A voicemail is heard by whoever plays it. No amount, no “balance”, no “account”.
        Your name, the practice and the number are the whole message.
      </GuideNote>

      <GuideH2>The payment-plan letter</GuideH2>
      <ScriptCard label="Letter · confirming a payment plan">
        {`Dear {first name},

Thank you for setting this up. To confirm what we agreed:

Balance: {balance}
Each payment: {installment}, on the {day of the month} of each month
First payment: {first date}
Last payment: {last date}

If a month is going to be hard, call us before the payment is due and we will work it out.

Sincerely,

{your name}
{practice name}`}
      </ScriptCard>
      <GuideNote>
        A plan in writing can be more than a courtesy. The federal lending rule defines a
        creditor as “{INSTALLMENT_RULE.says.creditor}”. Whether that reaches your practice
        depends on how often you do it and on the rest of the rule, so ask an attorney
        before a plan with more than four payments, or any added charge, goes on paper.
        This is not legal advice.
      </GuideNote>
      <GuideP>
        Read {formatCheckedOn(INSTALLMENT_RULE.source.readOn)}:{' '}
        <GuideSourceLink source={INSTALLMENT_RULE.source} />.
      </GuideP>

      <GuideH2>Why there is no text template here</GuideH2>
      <GuideP>
        On purpose. The federal calling rule’s allowance for health-care messages says
        such a message “{REMINDER_RULE.conditions.noBilling}” (
        <GuideSourceLink source={REMINDER_RULE.source}>the rule, as published by Cornell’s Legal Information Institute</GuideSourceLink>
        ; the{' '}
        <Link
          href="/resources/dental-appointment-reminder-templates"
          className="font-semibold text-teal-700 hover:underline"
        >
          reminder templates
        </Link>{' '}
        quote the rest). A balance text falls outside that allowance, so it needs the
        patient’s agreement like any other text. And a phone screen is read by whoever is
        holding the phone. Send the email, or call.
      </GuideP>

      <GuideH2>When to stop writing</GuideH2>
      <GuideList
        items={[
          <><strong>After the final notice, do what it said</strong>, or write the balance off on purpose. A fourth letter tells the patient the third meant nothing.</>,
          <><strong>Keep the two decisions apart.</strong> Collecting a balance and deciding whether to keep seeing a patient are different questions, and the second has rules of its own. Ask your malpractice carrier before you answer it.</>,
        ]}
      />
    </GuideShell>
  )
}
