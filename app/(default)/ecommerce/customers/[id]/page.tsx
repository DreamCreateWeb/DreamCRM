export const metadata = {
  title: 'Clinic Detail - DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getClinicDetail } from '@/lib/services/clinics'
import { getClinicReferral, listActivePartners } from '@/lib/services/referrals'
import ReferralCard from './referral-card'
import {
  AGENCY_PROJECT_TYPE_LABELS,
  AGENCY_PROJECT_STATUS_LABELS,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { formatRelativeDate } from '@/lib/utils/format'
import { type Tone } from '@/lib/ui/encodings'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { KpiStat } from '@/components/ui/kpi-stat'
import { EmptyState } from '@/components/ui/empty-state'

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const TYPE_ICONS: Record<AgencyProjectType, string> = {
  website: '🌐',
  ecommerce: '🛒',
  intake_form: '📝',
  videography: '🎥',
  photography: '📸',
  content: '✍️',
  other: '📦',
}

const STATUS_TONE: Record<AgencyProjectStatus, Tone> = {
  lead: 'neutral',
  discovery: 'warn',
  in_progress: 'special',
  review: 'info',
  completed: 'ok',
  on_hold: 'warn',
  cancelled: 'urgent',
}

const PLAN_LABEL = { basic: 'Basic', pro: 'Pro', premium: 'Premium' } as const

// Subscription status → tone (active/trialing healthy, past-due family a
// problem, everything else inert).
function subStatusTone(status: string): Tone {
  if (status === 'active' || status === 'trialing') return 'ok'
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete_expired') return 'urgent'
  return 'neutral'
}

function moneyFull(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default async function ClinicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') redirect('/')

  const { id } = await params
  const clinic = await getClinicDetail(id)
  if (!clinic) notFound()

  // Referral attribution (platform owner/admin can change it from here).
  const isPlatformManager = ctx.role === 'owner' || ctx.role === 'admin'
  const [referral, activePartners] = isPlatformManager
    ? await Promise.all([getClinicReferral(id), listActivePartners()])
    : [null, []]

  const siteUrl = `https://${clinic.slug}.${SITE_DOMAIN}`
  const planTier = (clinic.profile?.planTier ?? 'basic') as keyof typeof PLAN_LABEL
  const status = clinic.profile?.subscriptionStatus ?? 'inactive'
  const totalRevenue = clinic.lifetimeSubscriptionCents + clinic.lifetimeProjectCents

  const activeProjects = clinic.projects.filter((p) =>
    ['lead', 'discovery', 'in_progress', 'review'].includes(p.status),
  )
  const completedProjects = clinic.projects.filter((p) => p.status === 'completed')

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2">
          Platform · Dream Create
        </div>
        <Link
          href="/ecommerce/customers"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-3 inline-block"
        >
          ← All Clinics
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {clinic.profile?.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={clinic.profile.logoUrl}
                alt=""
                className="w-16 h-16 rounded-xl object-cover shrink-0"
              />
            ) : (
              <span
                className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
                style={{ backgroundColor: clinic.profile?.brandColor ?? '#6d28d9' }}
              >
                {(clinic.profile?.displayName ?? clinic.name).charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
                {clinic.profile?.displayName ?? clinic.name}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {clinic.profile?.tagline ?? `Joined ${clinic.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton href={siteUrl} variant="secondary" size="sm" target="_blank">
              View site ↗
            </ActionButton>
            <ActionButton href="/ecommerce/invoices" variant="primary" size="sm">
              Manage subscription
            </ActionButton>
          </div>
        </div>
      </div>

      {clinic.stripeUnavailable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300">
          Stripe couldn't be reached, so subscription invoice history isn't shown.
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiStat label="Plan" value={PLAN_LABEL[planTier]} sub={`Status: ${status.replace('_', ' ')}`} />
        <KpiStat
          label="Lifetime Revenue"
          value={moneyFull(totalRevenue)}
          sub={`Subs ${moneyFull(clinic.lifetimeSubscriptionCents)} · Proj ${moneyFull(clinic.lifetimeProjectCents)}`}
        />
        <KpiStat
          label="Patients"
          value={String(clinic.patientCount)}
          sub={`${clinic.upcomingAppointmentCount} upcoming appt${clinic.upcomingAppointmentCount === 1 ? '' : 's'}`}
        />
        <KpiStat
          label="Active Projects"
          value={String(activeProjects.length)}
          sub={`${completedProjects.length} delivered all-time`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Contact + profile */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Profile
          </h2>
          {!clinic.profile ? (
            <EmptyState
              title="No clinic profile data yet"
              body="The owner hasn't filled in their website details."
            />
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <ProfileRow label="Legal name" value={clinic.profile.legalName} />
              <ProfileRow label="Email" value={clinic.profile.email} />
              <ProfileRow label="Phone" value={clinic.profile.phone} />
              <ProfileRow label="Slug" value={clinic.slug} />
              <ProfileRow
                label="Address"
                value={[
                  clinic.profile.addressLine1,
                  clinic.profile.addressLine2,
                  [clinic.profile.city, clinic.profile.state, clinic.profile.postalCode]
                    .filter(Boolean)
                    .join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
              <ProfileRow label="Country" value={clinic.profile.country} />
              <ProfileRow label="Brand color" value={clinic.profile.brandColor} />
              <ProfileRow label="Template" value={clinic.profile.template} />
              <ProfileRow
                label="Stripe customer"
                value={
                  clinic.profile.stripeCustomerId
                    ? clinic.profile.stripeCustomerId
                    : 'Not yet linked'
                }
              />
              <ProfileRow
                label="Subscription"
                value={clinic.profile.stripeSubscriptionId ?? 'No subscription'}
              />
            </dl>
          )}
        </div>

        {/* Members */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Members ({clinic.members.length})
          </h2>
          {clinic.members.length === 0 ? (
            <EmptyState title="No members yet" body="Invite-accepted members will appear here." />
          ) : (
            <ul className="space-y-3">
              {clinic.members.map((m) => (
                <li key={m.userId} className="flex items-start gap-3">
                  <span
                    className="shrink-0 w-8 h-8 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-400 text-sm font-semibold flex items-center justify-center"
                    aria-hidden
                  >
                    {(m.name || m.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                      {m.name || m.email}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {m.email}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5" suppressHydrationWarning>
                      {m.role} · joined {formatRelativeDate(m.joinedAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Referral attribution (platform owner/admin only) */}
      {isPlatformManager && (
        <div className="mb-8 max-w-xl">
          <ReferralCard
            organizationId={clinic.orgId}
            current={
              referral
                ? {
                    partnerId: referral.partnerId,
                    partnerName: referral.partnerName,
                    percentBps: referral.percentBps,
                    termMonths: referral.termMonths,
                    hasPercentOverride: referral.hasPercentOverride,
                  }
                : null
            }
            partners={activePartners}
          />
        </div>
      )}

      {/* Active projects */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Projects
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {clinic.projects.length} total · {activeProjects.length} active
          </span>
        </div>
        {clinic.projects.length === 0 ? (
          <EmptyState title="No projects logged yet" body="Agency projects for this clinic will appear here." />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {clinic.projects.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-4 py-3">
                <span className="text-xl shrink-0" aria-hidden="true">
                  {TYPE_ICONS[p.type as AgencyProjectType] ?? '📦'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">
                    {p.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate" suppressHydrationWarning>
                    {AGENCY_PROJECT_TYPE_LABELS[p.type as AgencyProjectType]}
                    {p.dueDate &&
                      ` · Due ${p.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {' · Updated '}
                    {formatRelativeDate(p.updatedAt)}
                  </div>
                </div>
                {p.budgetCents != null && (
                  <span className="shrink-0 text-sm text-gray-600 dark:text-gray-300 tabular-nums">
                    {moneyFull(p.budgetCents)}
                  </span>
                )}
                <StatusPill
                  tone={STATUS_TONE[p.status as AgencyProjectStatus]}
                  label={AGENCY_PROJECT_STATUS_LABELS[p.status as AgencyProjectStatus]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invoices */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Subscription Invoices
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            From Stripe · {clinic.invoices.length} most recent
          </span>
        </div>
        {clinic.invoices.length === 0 ? (
          <EmptyState
            title={clinic.profile?.stripeCustomerId ? 'No invoices yet' : 'No Stripe customer linked'}
            body={
              clinic.profile?.stripeCustomerId
                ? 'Paid subscription invoices will appear here.'
                : 'This clinic has no Stripe customer linked yet.'
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {clinic.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 py-3">
                <span
                  className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full text-sm ${
                    inv.paid
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                  }`}
                  aria-hidden
                >
                  {inv.paid ? '✓' : '!'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100">
                    {inv.number ?? inv.id}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {inv.status} · {inv.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${inv.paid ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
                >
                  {inv.paid ? '+' : ''}
                  {moneyFull(inv.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold mb-0.5">
        {label}
      </dt>
      <dd className="text-gray-800 dark:text-gray-100">
        {value && value.trim() ? value : <span className="text-gray-500 dark:text-gray-400 italic">—</span>}
      </dd>
    </div>
  )
}
