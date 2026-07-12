import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getActiveBundlesForSidebar } from '@/lib/services/integration-bundles'
import { getGoogleReviewStats } from '@/lib/services/google-reviews'
import { PageHeader } from '@/components/ui/page-header'
import { NavIcon } from '@/components/ui/nav-icons'
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

  const isPro = ctx.planTier === 'pro' || ctx.planTier === 'premium'
  const isPremium = ctx.planTier === 'premium'

  // Best-effort reads — the hub must render even when a stat hiccups.
  const [bundles, reviewStats] = await Promise.all([
    getActiveBundlesForSidebar(ctx.organizationId).catch(() => new Set<string>()),
    isPro ? getGoogleReviewStats(ctx.organizationId).catch(() => null) : null,
  ])
  const hasChannel = bundles.has('social') || bundles.has('google')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        title="Growth"
        subtitle="How your practice grows — outreach, campaigns, reviews, social, and the numbers behind them."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isPremium ? (
          <SectionCard
            href="/growth/outreach"
            icon="megaphone"
            title="Recall & Outreach"
            description="Who needs a nudge today — recall due, lapsed, birthdays — and the automations that reach them."
          />
        ) : (
          <UpsellCard
            upgradeId="recall"
            icon="megaphone"
            title="Recall & Outreach"
            plan="Premium"
            description="Recall-due, lapsed, and birthday outreach with automations that run themselves."
          />
        )}
        {isPremium ? (
          <SectionCard
            href="/growth/campaigns"
            icon="pen"
            title="Campaigns"
            description="Email campaigns with real funnels — sent, opened, clicked, booked."
          />
        ) : (
          <UpsellCard
            upgradeId="recall"
            icon="pen"
            title="Campaigns"
            plan="Premium"
            description="Email campaigns with real funnels — sent, opened, clicked, booked."
          />
        )}
        {isPremium ? (
          <SectionCard
            href="/growth/audiences"
            icon="users"
            title="Audiences"
            description="Saved patient segments with live counts — the targeting layer every campaign reuses."
          />
        ) : (
          <UpsellCard
            upgradeId="recall"
            icon="users"
            title="Audiences"
            plan="Premium"
            description="Saved patient segments with live counts, reusable across campaigns."
          />
        )}
        {isPro ? (
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
            description="The Google-first review loop — auto-requests after visits, synced reviews, private feedback."
          />
        ) : (
          <UpsellCard
            upgradeId="reviews"
            icon="star"
            title="Reviews"
            plan="Pro"
            description="Automatic review requests after visits, synced Google reviews, private-feedback triage."
          />
        )}
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
        {isPremium ? (
          <SectionCard
            href="/growth/analytics"
            icon="chart"
            title="Analytics"
            description="The whole picture — acquisition, schedule health, retention, reputation, and social reach."
          />
        ) : (
          <UpsellCard
            upgradeId="analytics"
            icon="chart"
            title="Analytics"
            plan="Premium"
            description="Scorecard, funnels, and proof panels for everything above."
          />
        )}
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
  description,
}: {
  href: string
  icon: string
  title: string
  stat?: string
  statTone?: Tone
  description: string
}) {
  return (
    <Link href={href} className="v2-card p-4 sm:p-5 block group hover:shadow-[var(--shadow-pop)] transition-shadow">
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
function UpsellCard({
  upgradeId,
  icon,
  title,
  plan,
  description,
}: {
  upgradeId: string
  icon: string
  title: string
  plan: string
  description: string
}) {
  return (
    <Link
      href={`/settings/billing?upgrade=${upgradeId}`}
      className="v2-card p-4 sm:p-5 block group border-dashed hover:shadow-[var(--shadow-pop)] transition-shadow"
    >
      <div className="flex items-center gap-2.5 mb-1.5">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-[var(--r-sm)] bg-gray-500/10 text-gray-500 dark:text-gray-400">
          <NavIcon name={icon} className="shrink-0 fill-current w-4.5 h-4.5" />
        </span>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 group-hover:underline underline-offset-4">
          {title}
        </h2>
        <span className="ml-auto text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 text-gray-500 dark:text-gray-400">
          {plan}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
    </Link>
  )
}
