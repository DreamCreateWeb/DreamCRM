'use client'

import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { DAY_WIRE, MONO_LABEL, ToneTile } from '@/components/marketing/ui'
import {
  PRACTICE_NAME_MAX,
  REVIEW_CARD_BODY,
  REVIEW_CARD_FORMATS,
  REVIEW_CARD_HEADLINES,
  cardPracticeName,
  checkReviewLink,
  reviewCodeFileName,
  type ReviewCardFormat,
  type ReviewCardHeadline,
} from '@/lib/review-card'

/**
 * THE REVIEW CARD MAKER.
 *
 * EVERYTHING HAPPENS HERE, IN THE VISITOR'S BROWSER. There is no server
 * action and no fetch in this file, and there must never be one: the page
 * above it says "nothing you type is sent to us", and a practice's review
 * link is the one thing on this site a competitor would like a list of. The
 * code is drawn by the `qrcode` package from the string in the field.
 *
 * THE CODE HOLDS THE PRACTICE'S OWN LINK. Not a short link of ours, not a
 * redirect: a printed card outlives every promise about a redirect, so the
 * card keeps working for as long as Google keeps the link working, whether
 * or not this site exists.
 *
 * NO FREE-TEXT HEADLINE. The card says one of `REVIEW_CARD_HEADLINES` or
 * nothing. A text box would let this layout carry "5 stars gets you 10% off",
 * and the tests in `tests/marketing/review-card.test.ts` could vouch for
 * none of it.
 *
 * TWO COPIES OF THE CARD ARE RENDERED, ON PURPOSE. The preview is what a
 * person reads on screen. The sheet (`data-print-sheet`) is what the printer
 * gets: one card or four, sized in inches, hidden on screen and from screen
 * readers. The page's print stylesheet swaps them, so what prints is the
 * sheet and nothing else on the page.
 */

const LABEL = 'block text-[0.85rem] font-semibold text-gray-800'
const INPUT =
  'mt-1.5 w-full rounded-[10px] border border-gray-300 bg-white px-3.5 py-2.5 text-[0.95rem] text-gray-950 placeholder:text-gray-500 transition-shadow duration-150 ease-out focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/30'
const HINT = 'mt-1.5 block text-[0.8rem] leading-snug text-gray-600'

/** Dark on white, always: a phone camera reads nothing else reliably. */
const CODE_COLORS = { dark: '#111827', light: '#FFFFFF' } as const

export default function ReviewCardMaker() {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [headline, setHeadline] = useState<ReviewCardHeadline>(REVIEW_CARD_HEADLINES[0])
  const [format, setFormat] = useState<ReviewCardFormat>(REVIEW_CARD_FORMATS[0].id)
  const [code, setCode] = useState('')
  // Has the link been pasted, or the field left? Until then nothing is said
  // about it: somebody typing "g.page/…" passes through "g", which is no
  // link at all, and a red sentence over the second keystroke teaches a
  // person to distrust the form.
  const [judged, setJudged] = useState(false)

  const check = useMemo(() => checkReviewLink(link), [link])
  const url = check.ok ? check.url : ''
  const practice = cardPracticeName(name)
  const perPage = REVIEW_CARD_FORMATS.find((f) => f.id === format)!.perPage
  // An empty field is a hint, not a mistake: nothing has been got wrong yet.
  const problem = judged && !check.ok && check.reason !== 'empty' ? check.message : null

  useEffect(() => {
    let live = true
    if (!url) {
      setCode('')
      return
    }
    // `margin: 0` — the card's own padding is the quiet zone. Level M keeps
    // the code coarse enough to scan off a counter sign from arm's length.
    QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: CODE_COLORS })
      .then((svg) => {
        if (live) setCode(svg)
      })
      .catch(() => {
        if (live) setCode('')
      })
    return () => {
      live = false
    }
  }, [url])

  const ready = Boolean(url && code)

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── What the practice types ── */}
      <div
        className="no-print rounded-[14px] border bg-white p-6 shadow-[0_1px_4px_-2px_rgb(58_103_217/0.14),0_18px_44px_-34px_rgb(58_103_217/0.45)]"
        style={{ borderColor: DAY_WIRE }}
      >
        <h2 className="text-[1.05rem] font-bold tracking-[-0.02em] text-gray-950">Your practice</h2>

        <div className="mt-4">
          <label htmlFor="review-card-name" className={LABEL}>
            Practice name
          </label>
          <input
            id="review-card-name"
            type="text"
            value={name}
            maxLength={PRACTICE_NAME_MAX}
            autoComplete="organization"
            placeholder="Maple Street Dental"
            onChange={(e) => setName(e.target.value)}
            className={INPUT}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="review-card-link" className={LABEL}>
            Your Google review link
          </label>
          <input
            id="review-card-link"
            type="text"
            inputMode="url"
            value={link}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://g.page/r/…/review"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? 'review-card-link-hint review-card-link-problem' : 'review-card-link-hint'}
            onChange={(e) => setLink(e.target.value)}
            onPaste={() => setJudged(true)}
            onBlur={() => setJudged(true)}
            className={INPUT}
          />
          <span id="review-card-link-hint" className={HINT}>
            The link Google gives you in your Business Profile. Where to find it is just below.
          </span>
          {problem && (
            <p
              id="review-card-link-problem"
              role="status"
              className="mt-2 rounded-[10px] border border-rose-200 bg-white px-3.5 py-2.5 text-[0.85rem] leading-relaxed text-rose-700"
            >
              {problem}
            </p>
          )}
        </div>

        <fieldset className="mt-5">
          <legend className={LABEL}>What the card says</legend>
          <div className="mt-2 space-y-2">
            {REVIEW_CARD_HEADLINES.map((h) => (
              <label key={h} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[0.92rem] text-gray-800">
                <input
                  type="radio"
                  name="review-card-headline"
                  value={h}
                  checked={headline === h}
                  onChange={() => setHeadline(h)}
                  className="h-4 w-4 accent-teal-600"
                />
                {h}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className={LABEL}>How it prints</legend>
          <div className="mt-2 space-y-2">
            {REVIEW_CARD_FORMATS.map((f) => (
              <label key={f.id} className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[0.92rem] text-gray-800">
                <input
                  type="radio"
                  name="review-card-format"
                  value={f.id}
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                  className="h-4 w-4 accent-teal-600"
                />
                <span>
                  {f.label}
                  <span className="text-gray-600"> · {f.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <p
          className="mt-6 flex items-start gap-2.5 border-t pt-4 text-[0.8rem] leading-relaxed text-gray-600"
          style={{ borderColor: DAY_WIRE }}
        >
          <ToneTile glyph="shield" className="mt-px" />
          <span>This is made in your browser. Nothing you type is sent, stored, or seen by us.</span>
        </p>
      </div>

      {/* ── What they get ── */}
      <div className="no-print">
        <p className={`mb-2.5 text-gray-500 ${MONO_LABEL}`}>Your card</p>
        <div
          role="group"
          aria-label="Your card"
          className="rounded-[14px] border bg-white px-6 py-8 text-center sm:px-10"
          style={{ borderColor: DAY_WIRE }}
        >
          <p className="text-[1.6rem] font-extrabold leading-tight tracking-[-0.03em] text-gray-950 sm:text-[1.9rem]">
            {headline}
          </p>
          <p className="mx-auto mt-3 max-w-sm text-[0.95rem] leading-relaxed text-gray-700">{REVIEW_CARD_BODY}</p>

          {ready ? (
            <div
              role="img"
              aria-label="QR code for your Google review link"
              className="mx-auto mt-6 h-48 w-48 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: code }}
            />
          ) : (
            <div
              className="mx-auto mt-6 flex h-48 w-48 items-center justify-center rounded-[12px] border border-dashed border-gray-300 px-4 text-[0.82rem] leading-snug text-gray-600"
            >
              Your code appears here when you paste your link
            </div>
          )}

          {practice && (
            <p data-card-name className="mt-6 text-[1rem] font-bold tracking-[-0.01em] text-gray-950">
              {practice}
            </p>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            disabled={!ready}
            onClick={() => window.print()}
            className="min-h-11 rounded-[10px] bg-gradient-to-r from-teal-600 to-teal-700 px-5 py-2.5 text-[0.92rem] font-semibold text-white shadow-[0_6px_20px_-8px_rgb(58_103_217/0.6)] transition-all duration-150 ease-out hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Print the card
          </button>
          {ready && (
            <a
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`}
              download={reviewCodeFileName(practice, 'svg')}
              className="inline-flex min-h-11 items-center text-[0.9rem] font-semibold text-teal-700 underline underline-offset-2"
            >
              Download the QR code (SVG)
            </a>
          )}
        </div>
        <p className="mt-3 text-[0.8rem] leading-relaxed text-gray-600">
          Print opens your browser’s own print window, where you can also save the page as a PDF. Before you print a
          stack, scan the code with your phone and check that it opens your reviews.
        </p>
      </div>

      {/* ── What the printer gets. Hidden on screen and from screen readers;
             the page's print stylesheet shows this and hides everything else —
             but only once there is a card (`data-ready`). A visitor who
             prints the page before pasting a link gets the page, not a blank
             sheet. ── */}
      <div
        data-print-sheet
        data-format={format}
        data-ready={ready ? 'true' : undefined}
        aria-hidden="true"
        className="hidden"
      >
        {ready &&
          Array.from({ length: perPage }, (_, i) => (
            <div key={i} data-print-card>
              <p data-print-headline>{headline}</p>
              <p data-print-body>{REVIEW_CARD_BODY}</p>
              <div data-print-code dangerouslySetInnerHTML={{ __html: code }} />
              {practice && <p data-print-name>{practice}</p>}
            </div>
          ))}
      </div>
    </div>
  )
}
