import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEffectiveWebsiteProfile, getWebsiteDraftStatus } from '@/lib/services/website-draft'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { getSitePerformance } from '@/lib/services/site-analytics'
import { getBlogStats } from '@/lib/services/blog'
import { getSiteHealth } from '@/lib/services/seo'
import { getCareersStats } from '@/lib/services/careers'
import { getLastWebsiteEdit } from '@/lib/services/website-history'
import { getNewLeadsSince } from '@/lib/services/leads'
import { getClinicSeoPerformance } from '@/lib/services/gsc'
import { getSiteTemplate } from '@/lib/site-templates/registry'
import { contentCompleteness } from '@/lib/website-content-sections'
import { buildSitePagesIndex, hasColoringPages } from '@/lib/clinic-site-helpers'
import { listActivePlans } from '@/lib/services/membership'
import type { ClinicStaff } from '@/lib/types/clinic-content'
import type { CustomDomainStatus } from '@/lib/services/custom-domain'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { ProgressRing } from '@/components/ui/progress-ring'
import PublishCard from './publish-card'
import SiteMiniPreview from './site-mini-preview'
import { EmptyState } from '@/components/ui/empty-state'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'

export const metadata = {
  title: 'Website - DreamCRM',
  description: 'Your website, in one place — editor, design, blog, SEO, careers, domain.',
}

export const dynamic = 'force-dynamic'

/**
 * The Website hub — the workspace home for everything website-shaped, v3
 * redesign ("the site is the hero" + "zones shaped like their contents"):
 * a live scaled preview of the clinic's OWN homepage anchors the page, with
 * identity + setup progress beside it; a 30-day performance band with a
 * real area sparkline; then three zones each shaped like what they hold —
 * WHAT'S HAPPENING (surfaces carrying signal, number-first cards), TOOLS
 * (a compact dock of the daily editing surfaces — no brochure copy), and a
 * quiet utility footer (domain + QR cards, loud only when a state demands
 * it). The full-screen Studio lives at /website/editor; this page is
 * deliberately calm chrome around it.
 *
 * Members can enter (Blog/SEO/Careers have never been role-gated); editing
 * affordances (editor, domain, advanced edits) render for owner/admin only.
 * Plan-gated areas show an honest upsell card, never a hidden module.
 */
export default async function WebsiteHubPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  // Effective (draft-merged) profile for editing-progress stats; the raw row
  // for what actually serves (live pages, domain state).
  const effectiveLoad = await getEffectiveWebsiteProfile(ctx.organizationId)
  const profile = effectiveLoad?.profile
  const liveProfile = effectiveLoad?.raw

  if (!profile || !liveProfile) {
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
  const [performance, blogStats, siteHealth, careersStats, lastEdit, gscScope, leads7d, activePlans] = await Promise.all([
    getSitePerformance(ctx.organizationId).catch(() => null),
    isPro ? getBlogStats(ctx.organizationId).catch(() => null) : null,
    isPro ? getSiteHealth(ctx.organizationId).catch(() => null) : null,
    isPremium ? getCareersStats(ctx.organizationId).catch(() => null) : null,
    getLastWebsiteEdit(ctx.organizationId).catch(() => null),
    // Only the checklist reads this — owner/admin only, best-effort.
    canEdit ? getClinicSeoPerformance(ctx.organizationId, 28).catch(() => null) : null,
    getNewLeadsSince(ctx.organizationId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).catch(() => 0),
    listActivePlans(ctx.organizationId).catch(() => []),
  ])

  const completeness = contentCompleteness(profile)
  // What's staged and not yet live — the publish card (owner/admin only).
  const draftStatus = canEdit
    ? await getWebsiteDraftStatus(ctx.organizationId).catch(() => ({ count: 0, changes: [] }))
    : { count: 0, changes: [] }
  // The real live-page count — same index the Pages manager renders; the RAW
  // row on purpose (a staged team list hasn't published /team yet).
  const pageGates = {
    hasTeam: ((liveProfile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasBlog: (blogStats?.published ?? 0) > 0,
    hasCareers: (careersStats?.openRoles ?? 0) > 0,
    hasDentalPlans: activePlans.length > 0,
    hasColoringPages: hasColoringPages(liveProfile),
    isPro,
    selfBooking: liveProfile.selfBookingEnabled !== false,
  }
  const livePages = buildSitePagesIndex({
    ...pageGates,
    extraPages: templateDefExtras(liveProfile.template, pageGates),
  }).filter((pg) => pg.live).length
  const domain = (profile.customDomainStatus as CustomDomainStatus | null) ?? null
  const domainPill: { tone: Tone; label: string } = domain
    ? domain.state === 'active'
      ? { tone: 'ok', label: 'Custom domain live' }
      : domain.state === 'failed'
        ? { tone: 'urgent', label: 'Domain needs attention' }
        : { tone: 'warn', label: 'Domain waiting on DNS' }
    : { tone: 'neutral', label: 'Free address' }

  // ── Go-live checklist — REAL stored states only, anti-shame copy. Rows a
  //    plan doesn't cover are omitted (the upsell cards below own that story);
  //    optional rows say so. Fully-done checklists collapse to quiet facts. ──
  const templateDef = getSiteTemplate(profile.template)
  const checklist: { label: string; done: boolean; href: string; optional?: boolean; hint?: string }[] =
    canEdit
      ? [
          {
            label: 'Personalize your site',
            done: !!profile.onboardingInterviewCompletedAt,
            href: '/welcome',
            hint: 'A 3-minute interview drafts every page in your voice.',
          },
          {
            label: profile.template && profile.template !== 'modern' ? `Design: ${templateDef.label}` : 'Try a design',
            done: !!profile.template && profile.template !== 'modern',
            href: '/website/design',
            optional: true,
            hint: 'Preview any design on your own content — switching is instant and reversible.',
          },
          {
            label: 'Connect your own domain',
            done: domain?.state === 'active',
            href: '/website/domain',
            optional: true,
            hint: 'Two DNS records put your site on yourpractice.com.',
          },
          ...(isPro
            ? [
                {
                  label: 'Search data flowing',
                  done: !!gscScope?.platformConnected && !gscScope.customDomain,
                  href: '/website/seo',
                  hint: 'Google Search Console clicks + queries, scoped to your pages.',
                },
                {
                  label: 'Publish your first blog post',
                  done: (blogStats?.published ?? 0) > 0,
                  href: '/website/blog',
                  optional: true,
                  hint: 'Posts feed your site and the patient newsletter.',
                },
              ]
            : []),
        ]
      : []
  const checklistOpen = checklist.filter((c) => !c.done)
  const checklistDone = checklist.length - checklistOpen.length
  const showChecklist = checklist.length > 0 && checklistOpen.length > 0

  // Traffic delta vs the prior 30 days, for the performance band.
  const delta =
    performance && performance.traffic.totalPrev > 0
      ? Math.round(
          ((performance.traffic.total - performance.traffic.totalPrev) /
            performance.traffic.totalPrev) *
            100,
        )
      : null

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-6xl mx-auto">
      <PageHeader
        eyebrow={`Website · ${ctx.organizationName}`}
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

      {/* ── The hero: your actual website, alive in a browser frame ───────── */}
      <div className="v2-card overflow-hidden mb-6">
        <div className="grid lg:grid-cols-[minmax(0,26rem)_1fr]">
          <SiteMiniPreview slug={slug} template={templateDef.id} siteUrl={siteUrl} host={siteHost} />

          <div className="p-5 sm:p-6 flex flex-col justify-center min-w-0">
            {/* Identity: the address + its state. */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-base font-bold text-gray-900 dark:text-gray-100 hover:underline underline-offset-4 truncate"
              >
                {siteHost}
              </a>
              <StatusPill tone={domainPill.tone} label={domainPill.label} />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Your site is live — edits save to a draft, and Publish updates it when you’re ready.
              {lastEdit?.label ? <> Last edit: {lastEdit.label}.</> : null}
            </p>

            {showChecklist ? (
              /* Setup progress — the ring is the surface's one heartbeat. */
              <div className="mt-4 pt-4 border-t border-[color:var(--color-hairline)]">
                <div className="flex items-center gap-3">
                  <ProgressRing
                    value={checklistDone}
                    max={checklist.length}
                    size={44}
                    label={`${checklistDone} of ${checklist.length} setup steps done`}
                  />
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      Make the most of your site
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {checklistOpen.length} step{checklistOpen.length === 1 ? '' : 's'} left — each takes a few minutes.
                    </p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1">
                  {checklistOpen.map((c) => (
                    <li key={c.label}>
                      <Link
                        href={c.href}
                        className="group flex items-start gap-2.5 rounded-[var(--r-xs)] px-2 py-1.5 -mx-2 hover:bg-teal-500/5 transition-colors"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 inline-flex w-4.5 h-4.5 rounded-full border-2 border-gray-300 dark:border-gray-600 group-hover:border-teal-500 shrink-0 transition-colors"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                            {c.label}
                            {c.optional && (
                              <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">optional</span>
                            )}
                          </span>
                          {c.hint && (
                            <span className="block text-xs text-gray-500 dark:text-gray-400">{c.hint}</span>
                          )}
                        </span>
                        <span
                          aria-hidden="true"
                          className="mt-0.5 text-gray-300 dark:text-gray-600 group-hover:text-teal-600 dark:group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all"
                        >
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              /* All set up (or a member's view) — quiet living facts. */
              <div className="mt-4 pt-4 border-t border-[color:var(--color-hairline)] grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                    {livePages}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    page{livePages === 1 ? '' : 's'} live
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                    {completeness.filled}
                    <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">/{completeness.total}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">sections filled</div>
                </div>
                <div className="min-w-0">
                  <div
                    className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-none truncate"
                    title={templateDef.label}
                  >
                    {templateDef.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">design</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Unpublished changes — the Publish button's home on the hub ────── */}
      {canEdit && draftStatus.count > 0 && (
        <PublishCard count={draftStatus.count} labels={draftStatus.changes.map((c) => c.label)} />
      )}

      {/* ── Last 30 days — KPIs + the area sparkline ──────────────────────── */}
      {performance && (
        <div className="v2-card p-5 sm:p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Last 30 days</h2>
            <div className="flex items-center gap-3">
              {delta != null && (
                <span
                  className={`text-xs tabular-nums font-semibold ${delta >= 0 ? TONE_TEXT.ok : TONE_TEXT.warn}`}
                  title={`Site visits vs the prior 30 days`}
                >
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% vs prior 30
                </span>
              )}
              <Link
                href="/growth/analytics"
                className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
              >
                Full analytics →
              </Link>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:max-w-md">
            <div>
              <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.traffic.total.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">visits</div>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.leads30d.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">leads</div>
            </div>
            {performance.conversionPct != null && (
              <div>
                <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                  {performance.conversionPct}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">visit → lead</div>
              </div>
            )}
          </div>
          <AreaSpark daily={performance.traffic.daily} />
        </div>
      )}

      {/* ── What's happening — only the surfaces carrying signal, number
          first. These earn card space because they have news; navigation
          lives in the dock below. ─────────────────────────────────────── */}
      <section className="mb-7">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)] dark:text-gray-400 mb-3">
          What’s happening
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {canEdit && (
            <NewsCard
              href="/website/forms"
              value={String(leads7d)}
              label={`form submission${leads7d === 1 ? '' : 's'} · 7d`}
              tone={leads7d > 0 ? 'ok' : undefined}
              aria={`Forms — ${leads7d} submission${leads7d === 1 ? '' : 's'} in the last 7 days`}
            />
          )}
          {isPro ? (
            <NewsCard
              href="/website/blog"
              value={String(blogStats?.published ?? 0)}
              label={
                blogStats && blogStats.drafts > 0
                  ? `published · ${blogStats.drafts} draft${blogStats.drafts === 1 ? '' : 's'} waiting`
                  : 'posts published'
              }
              tone={blogStats && blogStats.drafts > 0 ? 'warn' : undefined}
              aria={`Blog — ${blogStats?.published ?? 0} published${blogStats && blogStats.drafts > 0 ? `, ${blogStats.drafts} draft${blogStats.drafts === 1 ? '' : 's'} waiting` : ''}`}
            />
          ) : (
            <UpsellCard upgradeId="blog" title="Blog" plan="Pro" />
          )}
          {isPro ? (
            <NewsCard
              href="/website/seo"
              value={siteHealth ? String(siteHealth.score) : '—'}
              valueSuffix={siteHealth ? '/100' : undefined}
              label="site health"
              tone={siteHealth ? (siteHealth.score >= 80 ? 'ok' : 'warn') : undefined}
              aria={`SEO — site health ${siteHealth ? `${siteHealth.score}/100` : 'unavailable'}`}
            />
          ) : (
            <UpsellCard upgradeId="seo" title="SEO" plan="Pro" />
          )}
          {isPremium ? (
            <NewsCard
              href="/website/careers"
              value={String(careersStats?.openRoles ?? 0)}
              label={
                careersStats && careersStats.newApplicants > 0
                  ? `open role${careersStats.openRoles === 1 ? '' : 's'} · ${careersStats.newApplicants} new applicant${careersStats.newApplicants === 1 ? '' : 's'}`
                  : `open role${(careersStats?.openRoles ?? 0) === 1 ? '' : 's'}`
              }
              tone={careersStats && careersStats.newApplicants > 0 ? 'warn' : undefined}
              aria={`Careers — ${careersStats?.openRoles ?? 0} open role${(careersStats?.openRoles ?? 0) === 1 ? '' : 's'}${careersStats && careersStats.newApplicants > 0 ? `, ${careersStats.newApplicants} new applicant${careersStats.newApplicants === 1 ? '' : 's'}` : ''}`}
            />
          ) : (
            <UpsellCard upgradeId="careers" title="Careers" plan="Premium" />
          )}
        </div>
      </section>

      {/* ── Tools — the daily editing surfaces as a dock: reach, don't read.
          One quiet state line each; the descriptions live on the pages
          themselves. Owner/admin only. ────────────────────────────────── */}
      {canEdit && (
        <section className="mb-7">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)] dark:text-gray-400 mb-3">
            Tools
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <DockButton
              href="/website/editor"
              icon="✏️"
              title="Editor"
              state={lastEdit?.label ? `Last edit: ${lastEdit.label}` : 'Ready to edit'}
            />
            <DockButton href="/website/design" icon="🎨" title="Design" state={templateDef.label} />
            <DockButton
              href="/website/pages"
              icon="📑"
              title="Pages"
              state={`${livePages} live`}
            />
            <DockButton
              href="/website/content"
              icon="📝"
              title="Content"
              state={`${completeness.filled}/${completeness.total} filled`}
            />
          </div>
        </section>
      )}

      {/* ── The quiet utilities — present, findable, silent (until a domain
          state demands attention: the pill only renders off-neutral). ──── */}
      <div className="pt-5 border-t border-[color:var(--color-hairline)] flex flex-wrap items-center gap-x-8 gap-y-3">
        {canEdit && (
          <Link
            href="/website/domain"
            className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
          >
            <span aria-hidden="true">🌐</span>
            <span className="font-semibold">Domain</span>
            <span className="text-gray-500 dark:text-gray-400 truncate max-w-[16rem] tabular-nums">
              {domain ? domain.domain : `${slug}.dreamcreatestudio.com`}
            </span>
            {domainPill.tone !== 'neutral' && <StatusPill tone={domainPill.tone} label={domainPill.label} />}
          </Link>
        )}
        <Link
          href="/website/share"
          className="group inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
        >
          <span aria-hidden="true">📇</span>
          <span className="font-semibold">Share & QR cards</span>
          <span className="text-gray-500 dark:text-gray-400">print-ready for the front desk</span>
        </Link>
      </div>
    </div>
  )
}

/**
 * The 30-day traffic line as a soft gradient area — server-rendered SVG, no
 * client JS. Decorative (the KPI numbers above carry the truth), so it's
 * aria-hidden; degenerate inputs (0–1 days) draw a flat baseline.
 */
function AreaSpark({ daily }: { daily: { day: string; views: number }[] }) {
  const W = 600
  const H = 64
  const PAD = 2
  const n = daily.length
  const max = Math.max(1, ...daily.map((d) => d.views))
  const pts =
    n >= 2
      ? daily.map((d, i) => {
          const x = PAD + (i / (n - 1)) * (W - PAD * 2)
          const y = H - PAD - (d.views / max) * (H - PAD * 2)
          return `${x.toFixed(1)},${y.toFixed(1)}`
        })
      : [`${PAD},${H - PAD}`, `${W - PAD},${H - PAD}`]
  const line = pts.join(' ')
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-5 w-full h-16"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hub-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-teal-500)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-teal-500)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#hub-spark-fill)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--color-teal-500)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** A "what's happening" card — a door that earns its card space by carrying
 *  news. The NUMBER is the hero (mono, tone-colored when it's a signal);
 *  the label whispers; there is no brochure copy. */
function NewsCard({
  href,
  value,
  valueSuffix,
  label,
  tone,
  aria,
}: {
  href: string
  value: string
  valueSuffix?: string
  label: string
  tone?: Tone
  aria: string
}) {
  return (
    <Link href={href} aria-label={aria} className="block h-full group">
      <div className="v2-card-interactive p-4 sm:p-5 h-full flex flex-col">
        <div
          className={`text-3xl font-bold tabular-nums font-mono-num leading-none ${
            tone ? TONE_TEXT[tone] : 'text-gray-900 dark:text-gray-100'
          }`}
        >
          {value}
          {valueSuffix && (
            <span className="text-base font-semibold text-gray-400 dark:text-gray-500">{valueSuffix}</span>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 leading-snug">{label}</span>
          <span
            className="text-gray-300 dark:text-gray-600 group-hover:text-teal-700 dark:group-hover:text-teal-300 group-hover:translate-x-0.5 transition-all shrink-0"
            aria-hidden
          >
            →
          </span>
        </div>
      </div>
    </Link>
  )
}

/** A dock button — a tool you reach for, not a card you read: a real
 *  (emoji) glyph in a soft gradient bubble, name, one quiet state line.
 *  Emoji over flat SVG on purpose: the dashboard's glyph language is emoji
 *  everywhere (encodings registry, empty states, ⌘K), they carry their own
 *  color, and the flat single-tone NavIcons read lifeless here. */
function DockButton({
  href,
  icon,
  title,
  state,
}: {
  href: string
  icon: string
  title: string
  state: string
}) {
  return (
    <Link href={href} className="block h-full group">
      <div className="v2-card-interactive px-4 py-3.5 h-full flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--r-sm)] bg-gradient-to-br from-teal-500/10 to-teal-500/20 group-hover:from-teal-500/15 group-hover:to-teal-500/25 transition-colors">
          <span className="text-xl leading-none" aria-hidden="true">
            {icon}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
          <span
            className="block text-xs text-gray-500 dark:text-gray-400 truncate tabular-nums"
            title={state}
          >
            {state}
          </span>
        </span>
      </div>
    </Link>
  )
}

/** The honest plan-gate card — the area exists, the plan doesn't cover it
 *  yet, and the card says exactly that instead of hiding the module. Sized
 *  to sit beside the news cards without pretending to carry news. */
function UpsellCard({ upgradeId, title, plan }: { upgradeId: string; title: string; plan: string }) {
  return (
    <Link href={`/settings/billing?upgrade=${upgradeId}`} className="block h-full group">
      <div className="v2-card-interactive p-4 sm:p-5 h-full flex flex-col border-dashed">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</span>
          <StatusPill tone="special" label={`${plan} plan`} />
        </div>
        <span className="mt-auto pt-3 text-xs font-semibold text-teal-700 dark:text-teal-300">
          See plans →
        </span>
      </div>
    </Link>
  )
}

// The template's gate-filtered extra marketing pages (client-safe shape for
// the live-page count — same filtering the Pages manager applies).
function templateDefExtras(
  template: string | null,
  gates: Parameters<typeof buildSitePagesIndex>[0] & { hasColoringPages: boolean; isPro: boolean; selfBooking: boolean },
): Array<{ path: string; label: string }> {
  return getSiteTemplate(template)
    .extraMarketingPages.filter((p) => !p.gate || p.gate(gates))
    .map((p) => ({ path: p.path, label: p.label }))
}
