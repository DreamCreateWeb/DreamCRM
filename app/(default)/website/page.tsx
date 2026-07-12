import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getSitePerformance } from '@/lib/services/site-analytics'
import { getBlogStats } from '@/lib/services/blog'
import { getSiteHealth } from '@/lib/services/seo'
import { getCareersStats } from '@/lib/services/careers'
import { getLastWebsiteEdit } from '@/lib/services/website-history'
import type { CustomDomainStatus } from '@/lib/services/custom-domain'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { NavIcon } from '@/components/ui/nav-icons'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Website - DreamCRM',
  description: 'Your website, in one place — editor, design, blog, SEO, careers, domain.',
}

export const dynamic = 'force-dynamic'

/**
 * The Website hub — the workspace home for everything website-shaped, in the
 * "Online Store" shape owners know from Shopify/Wix: the live site up top
 * (real URL, domain state, open-the-editor), a 30-day performance snapshot,
 * then doorway cards into every sub-area. The full-screen Studio lives at
 * /website/editor; this page is deliberately calm chrome around it.
 *
 * Members can enter (Blog/SEO/Careers have never been role-gated); editing
 * affordances (editor, domain, advanced edits) render for owner/admin only.
 * Plan-gated areas show an honest upsell card, never a hidden module.
 */
export default async function WebsiteHubPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)

  if (!profile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="🌐"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic to publish your public site — then everything website-shaped lives here."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  const canEdit = ctx.role === 'owner' || ctx.role === 'admin'
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const isPremium = profile.planTier === 'premium'
  const slug = ctx.organizationSlug
  const siteUrl = publicSiteUrl({ slug, profile })
  const siteHost = siteUrl.replace(/^https?:\/\//, '')

  // Every read is best-effort — the hub must render even when a stat hiccups.
  const [performance, blogStats, siteHealth, careersStats, lastEdit] = await Promise.all([
    getSitePerformance(ctx.organizationId).catch(() => null),
    isPro ? getBlogStats(ctx.organizationId).catch(() => null) : null,
    isPro ? getSiteHealth(ctx.organizationId).catch(() => null) : null,
    isPremium ? getCareersStats(ctx.organizationId).catch(() => null) : null,
    getLastWebsiteEdit(ctx.organizationId).catch(() => null),
  ])

  const domain = (profile.customDomainStatus as CustomDomainStatus | null) ?? null
  const domainPill: { tone: Tone; label: string } = domain
    ? domain.state === 'active'
      ? { tone: 'ok', label: 'Custom domain live' }
      : domain.state === 'failed'
        ? { tone: 'urgent', label: 'Domain needs attention' }
        : { tone: 'warn', label: 'Domain waiting on DNS' }
    : { tone: 'neutral', label: 'Free address' }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        title="Website"
        subtitle="Your site, design, blog, search presence, and domain — all in one place."
        actions={
          canEdit ? (
            <div className="flex items-center gap-2">
              <ActionButton variant="secondary" size="sm" href={siteUrl} target="_blank">
                View live ↗
              </ActionButton>
              <ActionButton variant="primary" size="sm" href="/website/editor">
                Open the editor
              </ActionButton>
            </div>
          ) : (
            <ActionButton variant="secondary" size="sm" href={siteUrl} target="_blank">
              View live ↗
            </ActionButton>
          )
        }
      />

      {/* ── The live site ─────────────────────────────────────────────────── */}
      <div className="v2-card p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--r-sm)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <NavIcon name="globe" className="shrink-0 fill-current w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline underline-offset-4 truncate"
              >
                {siteHost}
              </a>
              <StatusPill tone={domainPill.tone} label={domainPill.label} />
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Your site is live — every save in the editor publishes instantly.
              {lastEdit?.label ? <> Last edit: {lastEdit.label}.</> : null}
            </p>
          </div>
        </div>
      </div>

      {/* ── Last 30 days ──────────────────────────────────────────────────── */}
      {performance && (
        <div className="v2-card p-4 sm:p-5 mb-6">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Last 30 days</h2>
            {performance.traffic.totalPrev > 0 && (
              <span
                className={`text-xs tabular-nums font-medium ${
                  performance.traffic.total >= performance.traffic.totalPrev
                    ? TONE_TEXT.ok
                    : TONE_TEXT.warn
                }`}
              >
                {performance.traffic.total >= performance.traffic.totalPrev ? '▲' : '▼'}{' '}
                {Math.abs(
                  Math.round(
                    ((performance.traffic.total - performance.traffic.totalPrev) /
                      performance.traffic.totalPrev) *
                      100,
                  ),
                )}
                % vs prior 30
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-4 max-w-md">
            <div>
              <div className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.traffic.total.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">visits</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.leads30d.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">leads</div>
            </div>
            {performance.conversionPct != null && (
              <div>
                <div className="text-2xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                  {performance.conversionPct}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">visit → lead</div>
              </div>
            )}
          </div>
          {/* 30-bar sparkline straight from the zero-filled dailies. */}
          <div className="flex items-end gap-[2px] h-8 mt-4" aria-hidden="true">
            {performance.traffic.daily.map((d) => {
              const max = Math.max(1, ...performance.traffic.daily.map((x) => x.views))
              return (
                <div
                  key={d.day}
                  className="flex-1 rounded-sm bg-teal-500/60"
                  style={{ height: `${Math.max(6, (d.views / max) * 100)}%` }}
                />
              )
            })}
          </div>
          <Link
            href="/analytics"
            className="mt-3 inline-block text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
          >
            Full analytics →
          </Link>
        </div>
      )}

      {/* ── The areas ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {canEdit && (
          <SectionCard
            href="/website/editor"
            icon="pen"
            title="Editor & design"
            stat={lastEdit?.label ? `Last edit: ${lastEdit.label}` : 'Ready to edit'}
            description="Edit your site in place — text, photos, sections, brand color, and the design picker."
          />
        )}
        {isPro ? (
          <SectionCard
            href="/posts"
            icon="doc"
            title="Blog"
            stat={
              blogStats
                ? `${blogStats.published} published${blogStats.drafts > 0 ? ` · ${blogStats.drafts} draft${blogStats.drafts === 1 ? '' : 's'}` : ''}`
                : '—'
            }
            statTone={blogStats && blogStats.drafts > 0 ? 'warn' : undefined}
            description="Posts publish straight to your site and can feed the patient newsletter."
          />
        ) : (
          <UpsellCard
            upgradeId="blog"
            icon="doc"
            title="Blog"
            plan="Pro"
            description="Publish posts to your site and feed the patient newsletter."
          />
        )}
        {isPro ? (
          <SectionCard
            href="/seo"
            icon="search"
            title="SEO"
            stat={siteHealth ? `Site health ${siteHealth.score}/100` : '—'}
            statTone={siteHealth ? (siteHealth.score >= 80 ? 'ok' : 'warn') : undefined}
            description="Site health, Google Search Console, and how patients find you."
          />
        ) : (
          <UpsellCard
            upgradeId="seo"
            icon="search"
            title="SEO"
            plan="Pro"
            description="Site health checks and Google Search Console, in plain language."
          />
        )}
        {isPremium ? (
          <SectionCard
            href="/careers"
            icon="briefcase"
            title="Careers"
            stat={
              careersStats
                ? `${careersStats.openRoles} open role${careersStats.openRoles === 1 ? '' : 's'}${careersStats.newApplicants > 0 ? ` · ${careersStats.newApplicants} new applicant${careersStats.newApplicants === 1 ? '' : 's'}` : ''}`
                : '—'
            }
            statTone={careersStats && careersStats.newApplicants > 0 ? 'warn' : undefined}
            description="Open roles post to your site and Google for Jobs; applicants land here."
          />
        ) : (
          <UpsellCard
            upgradeId="careers"
            icon="briefcase"
            title="Careers"
            plan="Premium"
            description="Post roles to your site and Google for Jobs; track applicants."
          />
        )}
        {canEdit && (
          <SectionCard
            href="/settings/clinic#custom-domain"
            icon="globe"
            title="Domain"
            stat={domain ? domain.domain : `${slug}.dreamcreatestudio.com`}
            statTone={domainPill.tone === 'neutral' ? undefined : domainPill.tone}
            description={
              domain
                ? 'Manage your custom domain and DNS records.'
                : 'Put your site on your own domain — we walk you through the two DNS records.'
            }
          />
        )}
        <SectionCard
          href="/website/share"
          icon="megaphone"
          title="Share & QR cards"
          stat="Print-ready"
          description="Printable QR cards for the front desk — booking, reviews, and the patient portal."
        />
        {canEdit && (
          <SectionCard
            href="/settings/clinic"
            icon="gear"
            title="Advanced edits"
            stat="Every field, one form"
            description="The deep-edit fallback: all site content as a plain form, plus connections."
          />
        )}
      </div>
    </div>
  )
}

/** A doorway into a website area — same etched, drillable card the Shop hub
 *  uses (whole card is the link; icon + live stat + one-line description). */
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
  stat: string
  statTone?: Tone
  description: string
}) {
  return (
    <Link href={href} className="block h-full group">
      <div className="v2-card-interactive p-4 h-full flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--r-sm)] bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <NavIcon name={icon} className="shrink-0 fill-current w-5 h-5" />
          </span>
          <span
            className="text-gray-400 dark:text-gray-500 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors"
            aria-hidden
          >
            →
          </span>
        </div>
        <div className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</div>
        <div
          className={`mt-0.5 text-sm font-medium tabular-nums font-mono-num ${
            statTone ? TONE_TEXT[statTone] : 'text-gray-600 dark:text-gray-300'
          }`}
        >
          {stat}
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-snug">{description}</p>
      </div>
    </Link>
  )
}

/** The honest plan-gate card — the area exists, the plan doesn't cover it
 *  yet, and the card says exactly that instead of hiding the module. */
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
    <Link href={`/settings/billing?upgrade=${upgradeId}`} className="block h-full group">
      <div className="v2-card-interactive p-4 h-full flex flex-col border-dashed">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-[var(--r-sm)] bg-gray-500/10 text-gray-500 dark:text-gray-400">
            <NavIcon name={icon} className="shrink-0 fill-current w-5 h-5" />
          </span>
          <StatusPill tone="special" label={`${plan} plan`} />
        </div>
        <div className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-snug">{description}</p>
        <span className="mt-2 text-xs font-medium text-teal-700 dark:text-teal-300">
          See plans →
        </span>
      </div>
    </Link>
  )
}
