'use client'

import { PlatformPostCard, type PreviewChannel, type PreviewContent } from '@/components/social-posts/post-preview'

/**
 * ARTIFACT RENDERERS for the Approval Inbox (owner design directive,
 * 2026-08-13): staff should LOOK at the work, not read a paragraph about
 * it. Each card type shows its artifact the way it will actually exist in
 * the world — a social post in the platform's own chrome (the same preview
 * components the Social composer uses, so the two can never drift), an
 * email as an email, a Google reply nested under its review, a month plan
 * as its four pieces.
 *
 * LAW carried over unchanged: what the card shows is what sends. These are
 * presentational only — read mode renders the LIVE edit state (body/subject
 * from the card's own state), edit mode still shows the raw text with the
 * token legend, and nothing here reorders or rewrites content.
 */

export interface ArtifactChannel {
  accountId: string
  platform: string
  label: string
  handle: string | null
}

export interface PlanArtifactItem {
  kind: 'social' | 'blog'
  title: string | null
  body: string
}

/** The per-capability artifact payload the server attaches to a card. */
export type ProposalArtifact =
  | { kind: 'social'; channel: ArtifactChannel | null }
  | { kind: 'email'; toLine: string | null }
  | { kind: 'plan'; items: PlanArtifactItem[]; channel: ArtifactChannel | null }
  | { kind: 'gbp'; targetUrl: string; previousUri: string | null }

/**
 * The send's real button colour. `authEmailShell` takes an optional accent
 * and falls back to this; no executor passes one, so this IS what patients
 * see. Kept beside the preview so the two can be compared at a glance —
 * the artifact is only worth anything while it matches the send.
 */
const EMAIL_BUTTON_BG = '#1c1a17'

function postContent(body: string, clinicName: string, imageUrl: string | null): PreviewContent {
  return {
    summary: body,
    imageUrl,
    clinicName,
    postType: 'standard',
    ctaLabel: null,
    eventTitle: '',
    eventStartLabel: null,
    offerCouponCode: '',
  }
}

/** A social post in its destination's own chrome. Falls back to a neutral
 *  feed-card mock when the platform is unknown (legacy payloads). */
export function SocialArtifact({
  body,
  clinicName,
  channel,
  imageUrl = null,
}: {
  body: string
  clinicName: string
  channel: ArtifactChannel | null
  /** Staff-attached photo — the preview shows exactly what will publish. */
  imageUrl?: string | null
}) {
  if (channel) {
    const pc: PreviewChannel = {
      accountId: channel.accountId,
      platform: channel.platform,
      label: channel.label,
      handle: channel.handle,
    }
    const card = <PlatformPostCard channel={pc} content={postContent(body, clinicName, imageUrl)} />
    if (card !== null) {
      return <div className="max-w-sm">{card}</div>
    }
  }
  return <GenericFeedCard body={body} clinicName={clinicName} imageUrl={imageUrl} />
}

function GenericFeedCard({
  body,
  clinicName,
  imageUrl = null,
}: {
  body: string
  clinicName: string
  imageUrl?: string | null
}) {
  const initial = clinicName.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || 'C'
  return (
    <div className="max-w-sm rounded-xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{clinicName}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">Just now</p>
        </div>
      </div>
      <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{body}</p>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="Attached photo" className="mt-2 w-full rounded-lg object-cover max-h-64" />
      )}
    </div>
  )
}

/**
 * An email the way the patient's inbox will show it: sender, recipient
 * line, subject, body — and the booking button REALLY rendered when the
 * send appends one, instead of a sentence promising it.
 */
export function EmailArtifact({
  clinicName,
  toLine,
  subject,
  body,
  showBookingButton,
  showSignoff,
}: {
  clinicName: string
  toLine: string | null
  subject: string | null
  body: string
  showBookingButton: boolean
  showSignoff: boolean
}) {
  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] overflow-hidden bg-white dark:bg-gray-900/60">
      <div className="px-3 py-2 bg-[color:var(--color-surface-sunk)] border-b border-[color:var(--color-hairline)]">
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          <span className="font-semibold text-gray-600 dark:text-gray-300">From</span> {clinicName}
          {toLine && (
            <>
              {' · '}
              <span className="font-semibold text-gray-600 dark:text-gray-300">To</span> {toLine}
            </>
          )}
        </p>
        {subject != null && (
          <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {subject.trim() || '(no subject)'}
          </p>
        )}
      </div>
      <div className="px-3 py-3">
        <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{body}</p>
        {showSignoff && <p className="mt-3 text-sm text-gray-800 dark:text-gray-100">— {clinicName}</p>}
        {showBookingButton && (
          <div className="mt-3">
            {/* THE BUTTON THE PATIENT ACTUALLY GETS (D13). This painted
                `var(--color-brand-600)` — a token that does not exist — so
                it silently fell back to sky, a hue v3 retired, and showed a
                small blue pill for a button that arrives as a wide near-black
                block. The whole premise of these artifacts is "look at the
                work as it will exist", so the recipe here mirrors
                authEmailShell's: its `#1c1a17` default (no caller passes an
                accent), 8px radius, bold white. */}
            <span
              className="inline-block select-none rounded-lg px-6 py-2.5 text-sm font-bold text-white"
              style={{ backgroundColor: EMAIL_BUTTON_BG }}
            >
              Book a time
            </span>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Added automatically — links to your booking page.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** The Google review with the drafted reply nested beneath it, the way the
 *  listing will actually show the exchange. */
export function ReviewReplyArtifact({
  author,
  starRating,
  reviewText,
  reply,
  clinicName,
}: {
  author: string | null
  starRating: number | null
  reviewText: string | null
  reply: string
  clinicName: string
}) {
  const name = author?.trim() || 'Anonymous'
  const initial = name.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || 'A'
  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900/60 p-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex w-8 h-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white bg-gray-400 dark:bg-gray-600"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{name}</p>
          {starRating != null && (
            <p className="text-xs leading-none" aria-label={`${starRating} of 5 stars`}>
              <span className="text-amber-400">{'★'.repeat(Math.max(0, Math.min(5, starRating)))}</span>
              <span className="text-gray-300 dark:text-gray-600">
                {'★'.repeat(Math.max(0, 5 - Math.max(0, Math.min(5, starRating))))}
              </span>
              <span className="ml-1.5 align-middle text-xs text-gray-400 dark:text-gray-500">on Google</span>
            </p>
          )}
        </div>
      </div>
      {reviewText && (
        <p className="mt-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{reviewText}</p>
      )}
      <div className="mt-3 ml-4 pl-3 border-l-2 border-[color:var(--color-hairline)]">
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
          Reply from {clinicName} <span className="font-normal text-gray-400 dark:text-gray-500">(owner)</span>
        </p>
        <p className="mt-1 text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap">{reply}</p>
      </div>
    </div>
  )
}

/**
 * The month plan, compressed (D20 — the owner's screenshot verdict). The
 * first cut rendered all four pieces as FULL mini-cards, which made the
 * page's focal card a scroll-length wall with the Approve button somewhere
 * below the fold. Now the FIRST piece is previewed in full (the "look at
 * the work" promise survives — you see a real post as it will exist) and
 * the rest are compact expandable rows: one tap opens any piece, nothing
 * is hidden, and the card fits on a screen. Native <details>, no state.
 */
export function PlanArtifact({
  items,
  clinicName,
  channel,
}: {
  items: PlanArtifactItem[]
  clinicName: string
  channel: ArtifactChannel | null
}) {
  const initial = clinicName.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() || 'C'
  const dest = channel?.handle?.trim() || channel?.label || null
  const pieceLabel = (item: PlanArtifactItem, i: number) =>
    item.kind === 'blog'
      ? `📝 Blog article · piece ${i + 1} of ${items.length}`
      : `📣 Social post · piece ${i + 1} of ${items.length}${dest ? ` · ${dest}` : ''}`

  const fullPiece = (item: PlanArtifactItem, i: number) => (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {pieceLabel(item, i)}
      </p>
      {item.kind === 'blog' ? (
        <>
          {item.title && (
            <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
          )}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2 whitespace-pre-wrap">
            {item.body}
          </p>
        </>
      ) : (
        <div className="mt-1.5 flex items-start gap-2">
          <span
            className="inline-flex w-6 h-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initial}
          </span>
          <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap line-clamp-3">
            {item.body}
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-2">
      {items.length > 0 && fullPiece(items[0], 0)}
      {items.slice(1).map((item, k) => {
        const i = k + 1
        return (
          <details
            key={i}
            className="group rounded-xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900/60"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {pieceLabel(item, i)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {item.kind === 'blog' && item.title ? item.title : item.body}
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 text-gray-400 transition-transform group-open:rotate-90"
              >
                ›
              </span>
            </summary>
            <div className="border-t border-[color:var(--color-hairline)] px-3 pb-3 pt-2">
              {item.kind === 'blog' && item.title && (
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.title}</p>
              )}
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{item.body}</p>
            </div>
          </details>
        )
      })}
    </div>
  )
}

/** The Google listing's Website button, before → after. */
export function GbpFixArtifact({ targetUrl, previousUri }: { targetUrl: string; previousUri: string | null }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-white dark:bg-gray-900/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 rounded-full border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
          Website
        </span>
        <span className="text-gray-500 dark:text-gray-400 truncate">
          {previousUri ? previousUri : 'no website button today'}
        </span>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 pl-1" aria-hidden="true">
        ↓ becomes
      </p>
      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 rounded-full border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Website
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100 truncate">{targetUrl}</span>
      </div>
    </div>
  )
}
