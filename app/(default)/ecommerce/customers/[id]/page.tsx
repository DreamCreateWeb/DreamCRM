export const metadata = {
  title: 'Clinic Detail - DreamCRM',
}

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getClinicDetail } from '@/lib/services/clinics'
import {
  AGENCY_PROJECT_TYPE_LABELS,
  AGENCY_PROJECT_STATUS_LABELS,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import { formatRelativeDate } from '@/lib/utils/format'

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

const STATUS_COLORS: Record<AgencyProjectStatus, string> = {
  lead: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  discovery: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  review: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  completed: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  on_hold: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
}

const PLAN_LABEL = { basic: 'Basic', pro: 'Pro', premium: 'Premium' } as const

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
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
            >
              View site ↗
            </a>
            <Link
              href="/ecommerce/invoices"
              className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
            >
              Manage subscription
            </Link>
          </div>
        </div>
      </div>

      {clinic.stripeUnavailable && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-400">
          Stripe couldn't be reached, so subscription invoice history isn't shown.
        </div>
      )}

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat label="Plan" value={PLAN_LABEL[planTier]} hint={`Status: ${status.replace('_', ' ')}`} />
        <Stat
          label="Lifetime Revenue"
          value={moneyFull(totalRevenue)}
          hint={`Subs ${moneyFull(clinic.lifetimeSubscriptionCents)} · Proj ${moneyFull(clinic.lifetimeProjectCents)}`}
        />
        <Stat
          label="Patients"
          value={String(clinic.patientCount)}
          hint={`${clinic.upcomingAppointmentCount} upcoming appt${clinic.upcomingAppointmentCount === 1 ? '' : 's'}`}
        />
        <Stat
          label="Active Projects"
          value={String(activeProjects.length)}
          hint={`${completedProjects.length} delivered all-time`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Contact + profile */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Profile
          </h2>
          {!clinic.profile ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No clinic profile data yet. Owner hasn&apos;t filled in their website details.
            </p>
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
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">No members yet.</p>
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
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" suppressHydrationWarning>
                      {m.role} · joined {formatRelativeDate(m.joinedAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Active projects */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Projects
          </h2>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {clinic.projects.length} total · {activeProjects.length} active
          </span>
        </div>
        {clinic.projects.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-6">
            No projects logged for this clinic yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {clinic.projects.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-4 py-3">
                <span className="text-xl shrink-0">
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
                  <span className="shrink-0 text-sm text-gray-600 dark:text-gray-300">
                    {moneyFull(p.budgetCents)}
                  </span>
                )}
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[p.status as AgencyProjectStatus]}`}
                >
                  {AGENCY_PROJECT_STATUS_LABELS[p.status as AgencyProjectStatus]}
                </span>
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
          <span className="text-xs text-gray-500 dark:text-gray-400">
            From Stripe · {clinic.invoices.length} most recent
          </span>
        </div>
        {clinic.invoices.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic text-center py-6">
            {clinic.profile?.stripeCustomerId
              ? 'No invoices yet for this customer.'
              : 'This clinic has no Stripe customer linked yet.'}
          </p>
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
                  className={`shrink-0 font-semibold ${inv.paid ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
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

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'warn'
}) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl px-5 py-4">
      <div className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-1">
        {label}
      </div>
      <div
        className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}
      >
        {value}
      </div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-0.5">
        {label}
      </dt>
      <dd className="text-gray-800 dark:text-gray-100">
        {value && value.trim() ? value : <span className="text-gray-400 italic">—</span>}
      </dd>
    </div>
  )
}
