import Link from 'next/link'
import {
  DAY_WIRE,
  FaqList,
  GhostCta,
  MONO_LABEL,
  PageHero,
  PrimaryCta,
  SectionOpener,
} from '@/components/marketing/ui'
import { formatCheckedOn } from '@/lib/marketing/comparisons'
import { REVIEW_LINK_HELP, REVIEW_RULES } from '@/lib/marketing/guide-sources'
import { JsonLd, breadcrumbLd, faqPageLd, pageMetadata } from '@/lib/marketing/seo'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { GuideSourceLink } from '../resources/guide-ui'
import ReviewCardMaker from './review-card-maker'

const PATH = '/google-review-card'

export const metadata = pageMetadata({
  title: 'Free Google review card maker for dental offices: a printable QR sign',
  description:
    'Paste the review link Google gives your practice and print a counter sign or handout cards with your QR code. Free, and made in your browser.',
  path: PATH,
})

/** Ours, resolved rather than typed. */
const PLAN = getQuotedPlan()

const HELP = REVIEW_LINK_HELP.says
const POLICY = REVIEW_RULES.googlePolicy.says

/**
 * THE REVIEW CARD MAKER — queue item 10 (`docs/organic-go-live.md` Part 10).
 * A tool, because a tool earns links a page does not: it is the thing a
 * practice consultant or a dental blog can point at.
 *
 * WHAT GOOGLE ALREADY GIVES, AND WHAT THIS ADDS. Google hands a practice its
 * review link and a bare QR image (its own help page, quoted below). What a
 * front desk wants is the PRINTED THING: a sign with the practice's name on
 * it and an ask that breaks none of Google's rules. That is all this makes.
 * It builds no link and looks nothing up, so it costs nothing to run and has
 * nothing to leak.
 *
 * THE ASK IS NOT THIS PAGE'S TO WRITE. The wording is `lib/review-card.ts`,
 * shared with the review-request guide's counter card and with the share
 * cards a practice prints inside the app. The three rules it obeys are quoted
 * here from the pages they were read on, each dated.
 *
 * THE PRINT STYLESHEET SWAPS THE PAGE FOR THE SHEET, and only once there is a
 * card: `body:has([data-print-sheet][data-ready])`. Before a link is pasted,
 * printing the page prints the page. It is a `<style>` in this file, the way
 * the app's share cards and the benefits sheet do it, because it applies to
 * this route alone; nothing in it sets a property on screen, so the layer
 * rule about unlayered CSS does not bite.
 *
 * "CARD" IS THIS PAGE'S NOUN AND THE TRIAL'S TOO. The site holds "no card"
 * at zero about our own trial (`tests/marketing/trial-copy.test.ts`), so no
 * sentence here puts "no" beside "card".
 */

const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Is this made by Google?',
    a: `No. ${MARKETING.productName} is not affiliated with Google. The card points at the link Google gives your practice, and at nothing else.`,
  },
  {
    q: 'Do you keep my link or my practice name?',
    a: 'We never receive them. The code is drawn in your browser, and nothing you type on this page is sent to us or stored.',
  },
  {
    q: 'Will the code stop working?',
    a: 'The code holds your Google link exactly as you pasted it. It does not pass through us, so it works for as long as Google keeps that link working.',
  },
  {
    q: 'Can we offer something in return for a review?',
    a: `Google’s help page answers that one: “${HELP.incentives}”`,
  },
  {
    q: 'Can we hand it only to patients who had a good visit?',
    a: `Google’s policy does not allow a business to “${POLICY.gating}”. That is why the card asks how the visit went, and why it is the same card for everyone.`,
  },
  {
    q: 'Does it work for Yelp or Facebook?',
    a: 'Not this one. The card says Google on it, so it is only made for a Google link.',
  },
  {
    q: `Does ${MARKETING.productName} print this for us?`,
    a: `Yes. Inside ${MARKETING.productName} the same card is on the Share page of the Website section, with your review link already in it once your Google listing is set up on the Reviews page. It sits beside cards for online booking, your website and your patient portal.`,
  },
]

/**
 * What prints. Inches, because it is paper: a letter page with a half-inch
 * margin is 7.5 by 10, and both layouts fit A4 as well.
 */
const READY = 'body:has([data-print-sheet][data-ready="true"])'
const PRINT_CSS = `
@media print {
  ${READY} header,
  ${READY} footer,
  ${READY} nav,
  ${READY} .no-print { display: none !important }
  ${READY} main,
  ${READY} section { padding: 0 !important; margin: 0 !important; max-width: none !important }
  [data-print-sheet][data-ready="true"] { display: grid !important; grid-template-columns: 1fr; gap: 0 }
  [data-print-sheet][data-ready="true"][data-format="handouts"] { grid-template-columns: 1fr 1fr }
  [data-print-card] { box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0.4in; break-inside: avoid; page-break-inside: avoid }
  [data-format="sign"] [data-print-card] { min-height: 9.4in }
  [data-format="handouts"] [data-print-card] { height: 4.7in; border: 1px dashed #9ca3af }
  [data-print-headline] { margin: 0; color: #030712; font-size: 44pt; font-weight: 800; line-height: 1.05; letter-spacing: -0.03em }
  [data-format="handouts"] [data-print-headline] { font-size: 19pt }
  [data-print-body] { margin: 0.25in auto 0; max-width: 5.2in; color: #1f2937; font-size: 16pt; line-height: 1.4 }
  [data-format="handouts"] [data-print-body] { margin-top: 0.1in; max-width: 2.9in; font-size: 9.5pt }
  [data-print-code] { margin: 0.45in auto 0; width: 4in; height: 4in }
  [data-format="handouts"] [data-print-code] { margin-top: 0.18in; width: 1.85in; height: 1.85in }
  [data-print-code] svg { display: block; width: 100%; height: 100% }
  [data-print-name] { margin: 0.4in 0 0; color: #030712; font-size: 20pt; font-weight: 700 }
  [data-format="handouts"] [data-print-name] { margin-top: 0.15in; font-size: 11pt }
  @page { margin: 0.5in }
}
`

function Read({ on }: { on: string }) {
  return <>Read {formatCheckedOn(on)}.</>
}

export default function ReviewCardPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Google review card maker', path: PATH },
          ]),
          faqPageLd(FAQS),
        ]}
      />
      <style>{PRINT_CSS}</style>

      <div className="no-print">
        <PageHero
          eyebrow="Free tool"
          title="A Google review card for your front desk"
          sub="Paste the review link Google gives your practice. Print a counter sign or handout cards with your QR code, in your practice’s name. It is made in your browser: nothing you type is sent to us."
        />
      </div>

      <section className="mx-auto max-w-6xl px-4 pb-4 pt-2 sm:px-6">
        <ReviewCardMaker />
      </section>

      {/* ── WHERE THE LINK IS — Google's steps, in Google's labels ── */}
      <section className="no-print mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <SectionOpener
          eyebrow="Before you start"
          title="Where your review link is"
          lede={
            <>
              Google’s help page: “{HELP.purpose}” This is how it says to find the link.
            </>
          }
        />
        <ol className="max-w-2xl space-y-3 text-[0.98rem] leading-relaxed text-gray-700">
          <li className="flex gap-3">
            <span className={`mt-0.5 shrink-0 text-teal-700 ${MONO_LABEL}`} aria-hidden="true">
              01
            </span>
            <span>
              <strong className="font-semibold text-gray-950">{HELP.profile}</strong>, signed in as someone who
              manages it.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={`mt-0.5 shrink-0 text-teal-700 ${MONO_LABEL}`} aria-hidden="true">
              02
            </span>
            <span>
              Select <strong className="font-semibold text-gray-950">“{HELP.readReviews}”</strong>, and then{' '}
              <strong className="font-semibold text-gray-950">“{HELP.getMore}”</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className={`mt-0.5 shrink-0 text-teal-700 ${MONO_LABEL}`} aria-hidden="true">
              03
            </span>
            <span>
              In Google’s words: “{HELP.copy}”. Paste it into the box above.
            </span>
          </li>
        </ol>
        <p className="mt-6 max-w-2xl text-[0.9rem] leading-relaxed text-gray-600">
          The same help page says of Google’s own QR image: “{HELP.desktopOnly}” This page only needs the link, so it
          works on a phone as well. <GuideSourceLink source={REVIEW_LINK_HELP.source} />.{' '}
          <Read on={REVIEW_LINK_HELP.source.readOn} />
        </p>
      </section>

      {/* ── WHAT THE CARD MAY SAY — the rules, in their own words ── */}
      <section className="no-print mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:pb-16">
        <SectionOpener
          eyebrow="The rules"
          title="What a review card may say"
          lede="Three of Google’s lines decide the wording above. They are why you choose a headline here and do not type one."
        />
        <div className="grid max-w-5xl gap-4 md:grid-cols-3">
          {[
            {
              title: 'Nothing in return',
              body: (
                <>
                  Google’s help page: “{HELP.incentives}” So the card offers nothing: not a discount, not a drawing.
                </>
              ),
            },
            {
              title: 'The same card for everyone',
              body: (
                <>
                  Google’s policy does not allow a business to “{POLICY.gating}”. So the card asks how the visit
                  went, and it is handed to every patient or to none.
                </>
              ),
            },
            {
              title: 'A sign, not a request at the desk',
              body: (
                <>
                  Google’s help page lists “{HELP.display}”. Its policy says a business “{POLICY.pressure}” So put
                  the card where patients can see it, and let them scan it when they like.
                </>
              ),
            },
          ].map((rule) => (
            <div key={rule.title} className="rounded-[14px] border bg-white p-5" style={{ borderColor: DAY_WIRE }}>
              <h3 className="text-[1rem] font-bold tracking-[-0.02em] text-gray-950">{rule.title}</h3>
              <p className="mt-2 text-[0.9rem] leading-relaxed text-gray-700">{rule.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-[0.9rem] leading-relaxed text-gray-600">
          This is not legal advice, and these are the lines we read, not the whole of either page.{' '}
          <GuideSourceLink source={REVIEW_RULES.googlePolicy.source} />.{' '}
          <Read on={REVIEW_RULES.googlePolicy.source.readOn} /> For the email, the text and what to say at checkout,
          see the{' '}
          <Link
            href="/resources/dental-review-request-templates"
            className="font-semibold text-teal-700 hover:underline"
          >
            review request templates
          </Link>
          .
        </p>
      </section>

      {/* ── QUESTIONS ── */}
      <section className="no-print mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:pb-16">
        <SectionOpener eyebrow="Questions" title="Before you print a stack" />
        <FaqList items={FAQS} className="max-w-3xl" />
      </section>

      {/* ── THE CLOSE ── */}
      <section className="no-print mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            The other half of the ask
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            The card waits on the counter. The email goes out by itself.
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            {MARKETING.productName} emails a review request when a visit is marked complete, and asks any one patient
            at most once a year. Every patient is sent the same page: a button to your Google reviews and, beside it,
            a way to tell you privately instead. It does not send text messages today. {usd(PLAN.price)}/mo, flat,
            after {TRIAL.days} days free.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">{TRIAL.cta}</PrimaryCta>
            <GhostCta href="/resources/dental-review-request-templates">Review request templates</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
