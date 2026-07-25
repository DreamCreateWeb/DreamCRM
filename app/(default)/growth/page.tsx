import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import { getGoogleReviewStats, getReviewsReceivedPerWeek8 } from '@/lib/services/google-reviews'
import { PageHeader } from '@/components/ui/page-header'
import { NavIcon } from '@/components/ui/nav-icons'
import Sparkline from '@/components/ui/sparkline'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Growth - DreamCRM',
  description: 'Outreach, campaigns, reviews, social, and analytics — how your practice grows, in one place.',
}

export const dynamic = 'force-dynamic'

/**
 * The Growth hub — the workspace home for everything growth-shaped, mirroring
 * the Website workspace: one sidebar entry, doorway cards into every sub-area,
 * honest upsell cards for below-plan areas (never a hidden module), and the
 * Social door reflecting what's actually connected. The heavy surfaces
 * (recall dashboard, campaigns, reviews, composer, analytics) live on their
 * own sub-pages; this page is deliberately calm chrome around them.
 */
export default async function GrowthHubPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  // Best-effort reads — the hub must render even when a stat hiccups.
  const [bundles, reviewStats, reviewsPerWeek] = await Promise.all([
    getActiveBundlesForSidebar(ctx.organizationId).catch(() => new Set<string>()),
    getGoogleReviewStats(ctx.organizationId).catch(() => null),
    getReviewsReceivedPerWeek8(ctx.organizationId).catch(() => []),
  ])
  const hasChannel = bundles.has('social') || bundles.has('google')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Growth"
        subtitle="How your practice grows — outreach, campaigns, reviews, social, and the numbers behind them."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Campaigns live INSIDE Recall & Outreach since the phase-3 fold —
            one door for the whole outreach story (automations + campaigns
            with real funnels), not two doors to the same machine. */}
        <SectionCard
          href="/growth/outreach"
          icon="megaphone"
          title="Recall & Outreach"
          description="Who needs a nudge, the automations that reach them, and your campaigns with real funnels — sent, opened, clicked, booked."
        />
        <SectionCard
          href="/growth/audiences"
          icon="users"
          title="Audiences"
          description="Saved patient segments with live counts — the targeting layer every campaign reuses."
        />
        <SectionCard
          href="/growth/reviews"
          icon="star"
          title="Reviews"
          stat={
            reviewStats && reviewStats.count > 0 && reviewStats.averageRating != null
              ? `${reviewStats.averageRating.toFixed(1)}★ · ${reviewStats.count} Google review${reviewStats.count === 1 ? '' : 's'}`
              : undefined
          }
          statTone={reviewStats && reviewStats.count > 0 ? 'ok' : undefined}
          spark={reviewsPerWeek}
          description="The Google-first review loop — auto-requests after visits, synced reviews, private feedback."
        />
        {hasChannel ? (
          <SectionCard
            href="/growth/social"
            icon="megaphone"
            title="Social Posts"
            description="Compose once — publish or schedule to Google Business and your connected socials."
          />
        ) : (
          <SectionCard
            href="/integrations"
            icon="plug"
            title="Social Posts"
            stat="Nothing connected yet"
            description="Connect Google Business or a social account in Integrations — the composer unlocks here."
          />
        )}
        <SectionCard
          href="/growth/analytics"
          icon="chart"
          title="Analytics"
          description="The whole picture — acquisition, schedule health, retention, reputation, and social reach."
        />
      </div>
    </div>
  )
}

function SectionCard({
  href,
  icon,
  title,
  stat,
  statTone,
  spark,
  description,
}: {
  href: string
  icon: string
  title: string
  stat?: string
  statTone?: Tone
  /** The door's heartbeat (v3 law 7): a small real-data weekly series drawn
   *  top-right in the brand hue. ONE heartbeat on this hub — the Reviews door
   *  carries it; don't add sparks to the other doors. Decorative + silent to
   *  AT (the stat line tells the story); hidden when the series is empty. */
  spark?: Array<{ bucket: string; value: number }>
  description: string
}) {
  return (
    <Link href={href} className="v2-card relative p-4 sm:p-5 block group hover:shadow-[var(--shadow-pop)] transition-shadow">
      {spark && spark.length > 1 && (
        <div className="pointer-events-none absolute top-4 right-4 hidden xs:block" aria-hidden="true">
          <Sparkline data={spark} color="var(--color-teal-500)" width={72} height={24} labels={false} />
        </div>
      )}
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--r-sm)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
          <NavIcon name={icon} className="shrink-0 fill-current w-4.5 h-4.5" />
        </span>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:underline underline-offset-4">
          {title}
        </h2>
      </div>
      {stat && (
        <p className={`text-xs font-medium mb-1 ${statTone ? TONE_TEXT[statTone] : 'text-gray-600 dark:text-gray-300'}`}>
          {stat}
        </p>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </Link>
  )
}

/** Honest below-plan door — names the plan, links the upgrade panel. */
