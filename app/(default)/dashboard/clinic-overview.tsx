import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile, type ClinicProfile } from '@/lib/db/schema/platform'
import { listActiveProjectsForOrg } from '@/lib/services/projects'
import {
  AGENCY_PROJECT_TYPE_LABELS,
  AGENCY_PROJECT_STATUS_LABELS,
  type AgencyProjectStatus,
  type AgencyProjectType,
} from '@/lib/db/schema/platform'
import type { TenantContext } from '@/lib/auth/context'
import { formatRelativeDate } from '@/lib/utils/format'

const TYPE_ICONS: Record<AgencyProjectType, string> = {
  website: '🌐',
  ecommerce: '🛒',
  intake_form: '📝',
  videography: '🎥',
  photography: '📸',
  content: '✍️',
  other: '📦',
}

const STAGE_COLORS: Record<AgencyProjectStatus, string> = {
  lead: 'bg-gray-500/20 text-gray-700 dark:text-gray-300',
  discovery: 'bg-amber-500/20 text-amber-700 dark:text-amber-400',
  in_progress: 'bg-violet-500/20 text-violet-700 dark:text-violet-400',
  review: 'bg-sky-500/20 text-sky-700 dark:text-sky-400',
  completed: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  on_hold: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  cancelled: 'bg-red-500/20 text-red-700 dark:text-red-400',
}

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

const PLAN_LABELS = { basic: 'Basic', pro: 'Pro', premium: 'Premium' } as const

// Postgres reports missing columns as code 42703 — treat as "migration pending"
// and degrade gracefully so the page renders even before 0001 is applied.
function isMissingSchema(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code
  if (code === '42P01' || code === '42703') return true
  const msg = err instanceof Error ? err.message : String(err)
  return /relation .* does not exist|column .* does not exist/i.test(msg)
}

async function loadClinicProfile(orgId: string): Promise<ClinicProfile | null> {
  try {
    const rows = await db
      .select()
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, orgId))
      .limit(1)
    return rows[0] ?? null
  } catch (err) {
    if (isMissingSchema(err)) {
      console.warn('[clinic-overview] clinic_profile column missing — apply migration 0001')
      return null
    }
    throw err
  }
}

export default async function ClinicOverview({ ctx }: { ctx: TenantContext }) {
  const [profile, projects] = await Promise.all([
    loadClinicProfile(ctx.organizationId),
    listActiveProjectsForOrg(ctx.organizationId),
  ])

  const siteUrl = profile?.websiteDomain
    ? `https://${profile.websiteDomain}`
    : `https://${ctx.organizationSlug}.${SITE_DOMAIN}`

  // What's the first thing the clinic owner should do? Compute a small
  // "getting started" checklist based on what they've configured.
  const hasTagline = !!profile?.tagline
  const hasAbout = !!profile?.about
  const hasHours = profile?.hours && Object.keys(profile.hours as object).length > 0
  const hasLogo = !!profile?.logoUrl
  const hasServices = Array.isArray(profile?.services) && profile.services.length > 0
  const hasStaff = Array.isArray(profile?.staff) && profile.staff.length > 0
  const setupComplete = hasTagline && hasAbout && hasHours && hasServices
  const checklist = [
    { done: hasTagline, label: 'Add a tagline' },
    { done: hasAbout, label: 'Write your "About" paragraph' },
    { done: hasHours, label: 'Set office hours' },
    { done: hasServices, label: 'List your services' },
    { done: hasLogo, label: 'Upload your logo' },
    { done: hasStaff, label: 'Add staff bios' },
  ]
  const checklistDone = checklist.filter((c) => c.done).length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Welcome, {profile?.displayName ?? ctx.organizationName}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your website, projects, and clinic operations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-200"
          >
            View website ↗
          </a>
          <Link
            href="/settings/clinic"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            Edit website
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Your Plan */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6">
          <p className="text-xs uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold mb-2">
            Your Plan
          </p>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              {PLAN_LABELS[ctx.planTier]}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                profile?.subscriptionStatus === 'active' || profile?.subscriptionStatus === 'trialing'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                  : 'bg-gray-500/20 text-gray-600 dark:text-gray-300'
              }`}
            >
              {profile?.subscriptionStatus ?? 'inactive'}
            </span>
          </div>
          <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1.5 mb-4">
            <li>✓ Public clinic website</li>
            <li>✓ Custom domain &amp; SSL</li>
            {ctx.planTier !== 'basic' && <li>✓ Admin portal &amp; analytics</li>}
            {ctx.planTier === 'premium' && (
              <>
                <li>✓ Patient portal</li>
                <li>✓ Online booking</li>
              </>
            )}
          </ul>
          <Link
            href="/settings/plans"
            className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
          >
            {ctx.planTier === 'premium' ? 'Manage subscription →' : 'Upgrade plan →'}
          </Link>
        </div>

        {/* Getting Started checklist */}
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              {setupComplete ? 'Your website is set up' : 'Get your website ready'}
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {checklistDone} of {checklist.length} done
            </span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700/60 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(checklistDone / checklist.length) * 100}%` }}
            />
          </div>
          <ul className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            {checklist.map((c) => (
              <li
                key={c.label}
                className={`flex items-center gap-2 ${c.done ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${c.done ? 'bg-emerald-500 text-white' : 'border border-gray-300 dark:border-gray-600'}`}
                >
                  {c.done ? '✓' : ''}
                </span>
                {c.label}
              </li>
            ))}
          </ul>
          {!setupComplete && (
            <Link
              href="/settings/clinic"
              className="inline-block mt-4 text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Finish setting up →
            </Link>
          )}
        </div>
      </div>

      {/* Active engagements with Dream Create */}
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
              Your Projects with Dream Create
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Ecommerce builds, intake forms, videography, photography — anything beyond your subscription.
            </p>
          </div>
        </div>
        {projects.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 dark:border-gray-700/60 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              No active projects.
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              When you start a new engagement with Dream Create (a new website refresh, a content shoot,
              a custom intake form, etc.), it'll appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center gap-4 py-3">
                <span className="text-2xl shrink-0">{TYPE_ICONS[p.type as AgencyProjectType] ?? '📦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 dark:text-gray-100 truncate">{p.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {AGENCY_PROJECT_TYPE_LABELS[p.type as AgencyProjectType]}
                    {p.dueDate && ` · Due ${new Date(p.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {' · Updated '}
                    {formatRelativeDate(p.updatedAt)}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${STAGE_COLORS[p.status as AgencyProjectStatus]}`}>
                  {AGENCY_PROJECT_STATUS_LABELS[p.status as AgencyProjectStatus]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLink href="/settings/clinic" icon="🌐" label="Website Editor" />
        {ctx.planTier !== 'basic' && (
          <QuickLink href="/calendar" icon="📅" label="Appointments" />
        )}
        {ctx.planTier !== 'basic' && (
          <QuickLink href="/ecommerce/customers" icon="👥" label="Patients" />
        )}
        <QuickLink href="/settings/billing" icon="💳" label="Billing" />
      </div>
    </div>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 bg-white dark:bg-gray-800 shadow-sm rounded-xl px-4 py-3 hover:shadow-md transition"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
    </Link>
  )
}
