export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Side by side — DreamCRM demo',
  robots: { index: false, follow: false },
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { readDemoSkin } from '@/lib/demo-skin'
import { isFrameBlocked } from '@/lib/frame-embed'
import { buildDemoCompareUrl } from '@/lib/demo-skin-build'
import { deriveDemoGaps } from '@/lib/demo-gaps'
import { getProspectDetail } from '@/lib/services/prospecting'
import { DEMO_BEATS } from '@/lib/types/demo-script'
import { endBrandedDemoAction } from '@/app/(default)/ecommerce/customers/admin-actions'
import type { ProspectAiVerdict, ProspectCrawlSignals } from '@/lib/types/prospecting'

/**
 * The compare moment — chrome-less (the (preview) route-group pattern):
 * the prospect's real site on the LEFT, the demo clinic's public site
 * re-themed in THEIR brand color on the RIGHT (same-origin path-based
 * iframe, so our global X-Frame-Options passes untouched). Gated hard:
 * platform admin + demo mode + a skin, or redirect home.
 */

async function checkLeftEmbeddable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5_000),
      headers: { 'user-agent': 'DreamCreateBot/1.0 (+https://www.dreamcreatestudio.com)' },
    })
    return !isFrameBlocked({
      xfo: res.headers.get('x-frame-options'),
      csp: res.headers.get('content-security-policy'),
    })
  } catch {
    return false // unreachable = blocked; the indictment card carries the pane
  }
}

export default async function DemoComparePage() {
  const ctx = await requireTenant()
  const skin = await readDemoSkin(ctx)
  if (!ctx.platformAdmin || !ctx.isDemo || !skin) redirect('/')

  const compareIndex = DEMO_BEATS.findIndex((b) => b.id === 'compare')
  const prevBeat = compareIndex > 0 ? DEMO_BEATS[compareIndex - 1] : null
  const nextBeat = compareIndex < DEMO_BEATS.length - 1 ? DEMO_BEATS[compareIndex + 1] : null

  const [leftEmbeddable, detail] = await Promise.all([
    skin.websiteUrl ? checkLeftEmbeddable(skin.websiteUrl) : Promise.resolve(false),
    getProspectDetail(skin.prospectId),
  ])
  const signals = (detail?.prospect.enrichment ?? null) as ProspectCrawlSignals | null
  const verdict = (detail?.prospect.aiVerdict ?? null) as ProspectAiVerdict | null
  const gaps = detail
    ? deriveDemoGaps(signals, verdict, {
        ratingTenths: detail.prospect.googleRatingTenths,
        reviewCount: detail.prospect.reviewCount,
      })
    : []
  const staleYear = signals?.copyrightYear ?? null

  const rightUrl = buildDemoCompareUrl(skin.brandColor)

  return (
    <div
      className="flex h-[100dvh] flex-col bg-gray-950 text-gray-100"
      style={
        skin.brandColor
          ? ({ '--demo-accent': skin.brandColor } as React.CSSProperties)
          : undefined
      }
    >
      {/* Presenter bar — the panel isn't mounted on chrome-less pages, so it
          carries its own beat navigation. */}
      <div className="shrink-0">
        <div className="h-[3px]" style={{ background: 'var(--demo-accent, #f59e0b)' }} aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 bg-gray-900 px-4 py-2.5">
          <div className="min-w-0 truncate text-sm font-semibold">
            🎬 {skin.clinicName} — today vs. on DreamCRM
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {prevBeat && (
              <Link href={prevBeat.href} className="text-gray-400 hover:text-gray-200">
                ← Beat {compareIndex} · {prevBeat.title}
              </Link>
            )}
            {nextBeat && (
              <Link
                href={nextBeat.href}
                className="rounded-md px-2 py-1 font-semibold text-gray-900"
                style={{ background: 'var(--demo-accent, #2dd4bf)' }}
              >
                Beat {compareIndex + 2} · {nextBeat.title} →
              </Link>
            )}
            <form action={endBrandedDemoAction}>
              <button
                type="submit"
                className="text-gray-500 hover:text-gray-300"
                title="End the demo and log the outcome"
              >
                ■ End demo
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* The two panes */}
      <div className="grid min-h-0 grow grid-cols-1 gap-2 p-2 md:grid-cols-2">
        {/* LEFT — their site today */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-gray-900 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <span>Their site today</span>
            {skin.websiteUrl && (
              <a
                href={skin.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium normal-case tracking-normal text-gray-400 hover:text-gray-200"
              >
                Open in new tab ↗
              </a>
            )}
          </div>
          {skin.websiteUrl && leftEmbeddable ? (
            <iframe
              src={skin.websiteUrl}
              title={`${skin.clinicName} — current website`}
              className="min-h-0 grow bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            // The indictment card — honestly, the stronger moment.
            <div className="flex min-h-0 grow flex-col items-center justify-center gap-4 p-8 text-center">
              <div className="text-4xl" aria-hidden="true">
                🕰
              </div>
              <p className="max-w-sm text-sm text-gray-300">
                {skin.websiteUrl
                  ? `Their site won't allow itself to be shown side-by-side — but the crawl already told the story.`
                  : `${skin.clinicName} has no website at all — every patient searching in ${skin.city ?? 'their area'} finds nothing.`}
                {staleYear != null && staleYear < new Date().getFullYear() - 1 && (
                  <> Their site&apos;s working hard. It just hasn&apos;t had help since {staleYear}.</>
                )}
              </p>
              {gaps.length > 0 && (
                <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                  {gaps.slice(0, 6).map((g) => (
                    <span
                      key={g.label}
                      className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300"
                    >
                      {g.label}
                    </span>
                  ))}
                </div>
              )}
              {skin.websiteUrl && (
                <a
                  href={skin.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-white/20"
                >
                  Open their site in a new tab ↗
                </a>
              )}
            </div>
          )}
        </section>

        {/* RIGHT — the same practice on DreamCRM, in their colors */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-gray-900 ring-1 ring-white/10">
          <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            <span>
              On DreamCRM{skin.brandColor ? ' — in their brand color' : ''}
            </span>
            <a
              href={rightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium normal-case tracking-normal text-gray-400 hover:text-gray-200"
            >
              Open full screen ↗
            </a>
          </div>
          <iframe
            src={rightUrl}
            title="The demo practice site on DreamCRM"
            className="min-h-0 grow bg-white"
          />
        </section>
      </div>
    </div>
  )
}
