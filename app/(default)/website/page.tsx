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
import { getNewPatientCounts } from '@/lib/services/patients'
import { getClinicSeoPerformance } from '@/lib/services/gsc'
import { getSiteTemplate } from '@/lib/site-templates/registry'
import { contentCompleteness } from '@/lib/website-content-sections'
import { buildSitePagesIndex, hasColoringPages } from '@/lib/clinic-site-helpers'
import { listActivePlans } from '@/lib/services/membership'
import { listLibraryForPicker } from '@/lib/services/service-library'
import type { ClinicService, ClinicStaff, ClinicOfficePhoto } from '@/lib/types/clinic-content'
import { activeAnnouncement } from '@/lib/types/clinic-content'
import { clinicDayKey } from '@/lib/format-datetime'
import type { CustomDomainStatus } from '@/lib/services/custom-domain'
import type { HoursGridEntry } from '../settings/clinic/hours-grid'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { NewsCard } from '@/components/ui/news-card'
import { StatusPill } from '@/components/ui/status-pill'
import { ProgressRing } from '@/components/ui/progress-ring'
import PublishCard from './publish-card'
import SiteMiniPreview from './site-mini-preview'
import QuickEdits from './quick-edits'
import { EmptyState } from '@/components/ui/empty-state'
import { TONE_TEXT, type Tone } from '@/lib/ui/encodings'
import { TrendChart } from '@/components/ui/charts'
import { siteNeedsPersonalization } from '@/lib/services/starter-pack'
import { getReadinessReport } from '@/lib/services/readiness'
import GoLiveCard, { TakeOfflineLink } from './go-live-card'

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
  const slug = ctx.organizationSlug
  const siteUrl = publicSiteUrl({ slug, profile })
  const siteHost = siteUrl.replace(/^https?:\/\//, '')

  // Every read is best-effort — the hub must render even when a stat hiccups.
  const [performance, blogStats, siteHealth, careersStats, lastEdit, gscScope, leads7d, activePlans, newPatients30d] = await Promise.all([
    getSitePerformance(ctx.organizationId).catch(() => null),
    getBlogStats(ctx.organizationId).catch(() => null),
    getSiteHealth(ctx.organizationId).catch(() => null),
    getCareersStats(ctx.organizationId).catch(() => null),
    getLastWebsiteEdit(ctx.organizationId).catch(() => null),
    // Only the checklist reads this — owner/admin only, best-effort.
    canEdit ? getClinicSeoPerformance(ctx.organizationId, 28).catch(() => null) : null,
    getNewLeadsSince(ctx.organizationId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).catch(() => 0),
    listActivePlans(ctx.organizationId).catch(() => []),
    getNewPatientCounts(ctx.organizationId).catch(() => null),
  ])
  // The Quick-edits services modal needs the picker library (owner/admin only).
  const library = canEdit ? await listLibraryForPicker(ctx.organizationId).catch(() => []) : []
  // The go-live card's honest state — only loaded while the lever is
  // un-pulled (raw row on purpose: live-ness is a serving fact, not a draft).
  const goLiveReport =
    canEdit && !liveProfile.siteLiveAt
      ? await getReadinessReport(ctx.organizationId).catch(() => null)
      : null

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

  // ── Go-live checklist — REAL stored states only, anti-shame copy; optional
  //    rows say so. Fully-done checklists collapse to quiet facts. Rows that
  //    CANNOT complete for this clinic (custom-domain search data) are omitted
  //    rather than shown forever-unfinished. ──
  const templateDef = getSiteTemplate(profile.template)
  const checklist: { label: string; done: boolean; href: string; optional?: boolean; hint?: string }[] =
    canEdit
      ? [
          {
            label: 'Personalize your site',
            // THE one personalization predicate (starter-pack.ts) — the same
            // rule the Overview uses, so the two surfaces can't disagree.
            done: !siteNeedsPersonalization({
              onboardingInterviewCompletedAt: profile.onboardingInterviewCompletedAt,
              tagline: profile.tagline,
            }),
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
          ...[
                // The Search-data row only exists where it CAN complete: the
                // platform's shared Search Console property can't see a
                // custom-domain clinic's pages, so for them this row was
                // permanently un-tickable — a checklist item no action could
                // ever clear. Not their failure → not their row.
                ...(gscScope?.customDomain
                  ? []
                  : [
                      {
                        label: 'Search data flowing',
                        done: !!gscScope?.platformConnected,
                        href: '/website/seo',
                        hint: 'Google Search Console clicks + queries, scoped to your pages.',
                      },
                    ]),
                {
                  label: 'Publish your first blog post',
                  done: (blogStats?.published ?? 0) > 0,
                  href: '/website/blog',
                  optional: true,
                  hint: 'Posts feed your site and the patient newsletter.',
                },
              ],
        ]
      : []
  const checklistOpen = checklist.filter((c) => !c.done)
  const checklistDone = checklist.length - checklistOpen.length
  const showChecklist = checklist.length > 0 && checklistOpen.length > 0

  // The Quick-edits services modal edits the EFFECTIVE (draft-merged) list —
  // a staged edit reads back exactly like a saved one, same as Content.
  const quickServices = (profile.services as ClinicService[] | null) ?? []

  // The announcement bar (live-immediate) — resolve to what's showing NOW at
  // the clinic-local day so the state line matches the public site.
  const clinicTz = profile.timezone || 'America/New_York'
  const liveAnnouncement = activeAnnouncement(profile.announcement, clinicDayKey(new Date(), clinicTz))

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
                {liveProfile.siteLiveAt ? 'View live ↗' : 'Preview site ↗'}
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

      {/* ── THE GO-LIVE LEVER — the one deliberate act that makes the site
          (booking included) public. Rendered only while un-pulled; fed by
          the readiness resolver so the clinic decides with the truth in
          front of them. "View live" above still shows THEM the real site
          (editors bypass the coming-soon gate). ── */}
      {canEdit && !liveProfile.siteLiveAt && goLiveReport && (
        <GoLiveCard
          siteHost={siteHost}
          attention={goLiveReport.attention.map((f) => ({ id: f.id, label: f.label }))}
          openRequired={goLiveReport.openRequired.map((f) => ({ id: f.id, label: f.label }))}
          waiting={goLiveReport.waiting.map((f) => ({ id: f.id, label: f.label }))}
        />
      )}

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
              {/* Gated on the LEVER: this sentence used to claim "live" in the
                  same viewport where GoLiveCard asked the clinic to go live. */}
              {liveProfile.siteLiveAt
                ? 'Your site is live — edits save to a draft, and Publish updates it when you’re ready.'
                : 'Only you can see your site until you go live — edits save to a draft in the meantime.'}
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
                        {/* A to-do marker, not a radio: the circle says "not
                            done yet"; the hover arrow inside says "this row
                            takes you there" (clicking navigates, it doesn't
                            tick). */}
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid w-4.5 h-4.5 place-items-center rounded-full border-2 border-gray-300 dark:border-gray-600 group-hover:border-teal-500 shrink-0 transition-colors"
                        >
                          <span className="text-xs leading-none text-teal-600 opacity-0 group-hover:opacity-70 transition-opacity">
                            →
                          </span>
                        </span>
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
            <Link
              href="/growth/analytics"
              className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
            >
              Full analytics →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:max-w-md">
            <div>
              <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.traffic.total.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                visits
                {/* The delta lives WITH its subject, not orphaned in the header. */}
                {delta != null && (
                  <span
                    className={`ml-1.5 tabular-nums font-semibold ${delta >= 0 ? TONE_TEXT.ok : TONE_TEXT.warn}`}
                    title="Site visits vs the prior 30 days"
                  >
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {(newPatients30d?.viaSite ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                new patients booked online
              </div>
            </div>
            <div>
              <div className="text-3xl font-bold tabular-nums font-mono-num text-gray-900 dark:text-gray-100 leading-none">
                {performance.leads30d.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                inquir{performance.leads30d === 1 ? 'y' : 'ies'} to answer
              </div>
            </div>
          </div>
          <TrendChart
            data={performance.traffic.daily.map((d) => ({
              bucket: new Date(`${d.day}T00:00:00`).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              }),
              value: d.views,
            }))}
            kind="area"
            height={150}
            label="visits"
            className="mt-5"
            ariaLabel="Site visits per day over the last 30 days"
          />
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
                    <NewsCard
            href="/website/seo"
            value={siteHealth ? String(siteHealth.score) : '—'}
            valueSuffix={siteHealth ? '/100' : undefined}
            label="site health"
            tone={siteHealth ? (siteHealth.score >= 80 ? 'ok' : 'warn') : undefined}
            aria={`SEO — site health ${siteHealth ? `${siteHealth.score}/100` : 'unavailable'}`}
          />
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
        </div>
      </section>

      {/* ── Quick edits — what a front desk actually changes, as modals
          right here (hours live-instant; the rest stage to the draft).
          Deep/rare editing lives behind the header's "Open the editor" and
          the utility links below. Owner/admin only. ───────────────────── */}
      {canEdit && (
        <section className="mb-7">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ink-500)] dark:text-gray-400 mb-3">
            Quick edits
          </h2>
          <QuickEdits
            data={{
              orgId: ctx.organizationId,
              clinicName: profile.displayName ?? '',
              city: profile.city ?? null,
              hours: (profile.hours as Record<string, HoursGridEntry> | null) ?? {},
              services: quickServices,
              staff: (profile.staff as ClinicStaff[] | null) ?? null,
              officePhotos: (profile.officePhotos as ClinicOfficePhoto[] | null) ?? null,
              announcement: liveAnnouncement,
              library,
            }}
            states={{
              announcement: liveAnnouncement ? 'Showing now' : 'Off',
              hours: todayHoursLabel(
                (profile.hours as Record<string, HoursGridEntry> | null) ?? {},
                clinicTz,
              ),
              services: `${quickServices.length} offered`,
              team: `${((profile.staff as ClinicStaff[] | null) ?? []).length} listed`,
              photos: `${((profile.officePhotos as ClinicOfficePhoto[] | null) ?? []).length} on the site`,
            }}
          />
        </section>
      )}

      {/* ── The quiet utilities — present, findable, silent (until a domain
          state demands attention: the pill only renders off-neutral). ──── */}
      <div className="pt-5 border-t border-[color:var(--color-hairline)] flex flex-wrap items-center gap-x-8 gap-y-3">
        {canEdit && (
          <Link
            href="/website/domain"
            className="group inline-flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
          >
            <span aria-hidden="true">🌐</span>
            <span className="font-semibold">Domain</span>
            <span className="text-gray-500 dark:text-gray-400 truncate max-w-[16rem] tabular-nums">
              {domain ? domain.domain : `${slug}.dreamcreatestudio.com`}
            </span>
            {domainPill.tone !== 'neutral' && <StatusPill tone={domainPill.tone} label={domainPill.label} />}
          </Link>
        )}
        {canEdit && (
          <Link
            href="/website/design"
            className="group inline-flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
          >
            <span aria-hidden="true">🎨</span>
            <span className="font-semibold">Design</span>
          </Link>
        )}
        {canEdit && (
          <Link
            href="/website/pages"
            className="group inline-flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
          >
            <span aria-hidden="true">📑</span>
            <span className="font-semibold">Pages</span>
          </Link>
        )}
        <Link
          href="/website/share"
          className="group inline-flex items-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-700 dark:hover:text-teal-300"
        >
          <span aria-hidden="true">📇</span>
          <span className="font-semibold">Share & QR cards</span>
          <span className="text-gray-500 dark:text-gray-400">print-ready for the front desk</span>
        </Link>
        {/* The lever's reverse gear — quiet on purpose (a footer utility, not
            a red button): "we found a problem, hide the site while we fix it"
            is a legitimate, reversible ask. */}
        {canEdit && liveProfile.siteLiveAt && <TakeOfflineLink />}
      </div>
    </div>
  )
}


/** Today's hours at the clinic's wall-clock, for the Hours quick-edit state
 *  line ("Today 8:00 AM–5:00 PM" / "Closed today"). Server runs UTC — the
 *  weekday MUST come from the clinic timezone (a 7 PM Central Friday is
 *  already Saturday in UTC). */
function todayHoursLabel(hours: Record<string, HoursGridEntry>, timeZone: string): string {
  let day: string
  try {
    day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone })
      .format(new Date())
      .toLowerCase()
  } catch {
    day = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date()).toLowerCase()
  }
  const entry = hours[day]
  if (!entry || entry.closed) return 'Closed today'
  if (entry.byAppointment) return 'By appointment today'
  if (!entry.open || !entry.close) return 'Closed today'
  return `Today ${to12h(entry.open)}–${to12h(entry.close)}`
}

/** "17:00" → "5:00 PM" (stored HH:MM 24h; staff read wall-clock). */
function to12h(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return hhmm
  const h = Number(m[1])
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${suffix}`
}

/** The honest plan-gate card — the area exists, the plan doesn't cover it
 *  yet, and the card says exactly that instead of hiding the module. Sized
 *  to sit beside the news cards without pretending to carry news. */


// The template's gate-filtered extra marketing pages (client-safe shape for
// the live-page count — same filtering the Pages manager applies).
function templateDefExtras(
  template: string | null,
  gates: Parameters<typeof buildSitePagesIndex>[0] & { hasColoringPages: boolean; selfBooking: boolean },
): Array<{ path: string; label: string }> {
  return getSiteTemplate(template)
    .extraMarketingPages.filter((p) => !p.gate || p.gate(gates))
    .map((p) => ({ path: p.path, label: p.label }))
}
