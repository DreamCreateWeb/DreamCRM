export const metadata = { title: 'Intake Forms — DreamCRM' }
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  listFormTemplates,
  getSubmissionStatsForTemplates,
  getFormsCompletedPerWeek8,
  listPackets,
} from '@/lib/services/forms'
import PacketsManager, { type PacketView } from './packets-manager'
import CompletedHeartbeat from './completed-heartbeat'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile } from '@/lib/db/schema/platform'
import { createBlankFormAction } from './actions'
import ModuleHint from '@/components/onboarding/module-hint'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'

export default async function IntakeFormsListPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') redirect('/')

  // All six reads are independent — fire them in one wave instead of
  // serial DB round-trips (the Promise.all + two trailing awaits before).
  const [templates, submissionStats, perWeek8, packets, profileRows, orgRows] = await Promise.all([
    listFormTemplates(ctx.organizationId),
    getSubmissionStatsForTemplates(ctx.organizationId),
    getFormsCompletedPerWeek8(ctx.organizationId),
    listPackets(ctx.organizationId),
    db
      .select({ websiteDomain: clinicProfile.websiteDomain })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, ctx.organizationId))
      .limit(1),
    db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, ctx.organizationId))
      .limit(1),
  ])
  const profile = profileRows[0]
  const org = orgRows[0]

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const baseUrl = org
    ? publicSiteUrl({
        slug: org.slug,
        profile: { websiteDomain: profile?.websiteDomain ?? null } as never,
      })
    : ''

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <ModuleHint id="intake-forms" />
      <PageHeader
        eyebrow={`Daily · ${ctx.organizationName}`}
        title="Intake forms"
        subtitle="Digital forms patients fill out before their visit. Sent automatically with booking confirmations, or share the link directly."
        actions={
          <div className="flex items-center gap-2">
            <ActionButton variant="secondary" size="sm" href="/settings/automations/emails?email=intake_request">
              Edit intake email
            </ActionButton>
            <form action={createBlankFormAction}>
              <ActionButton type="submit" variant="primary" size="sm" breath>
                + New Form
              </ActionButton>
            </form>
          </div>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon="📝"
          title="No intake forms yet"
          body={
            <>
              Click <strong>New Form</strong> — we&apos;ll seed it with the standard dental
              new-patient template you can edit.
            </>
          }
          action={
            <form action={createBlankFormAction}>
              <ActionButton type="submit" variant="primary" size="sm">
                + New Form
              </ActionButton>
            </form>
          }
        />
      ) : (
        <>
          {/* The page's ONE heartbeat (law 7) — hides itself without signal. */}
          <CompletedHeartbeat series={perWeek8} />
          <div className="v2-card overflow-hidden">
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {templates.map((t) => {
              const fillUrl = `${baseUrl}/intake/${t.slug}`
              const sections = (t.schema as { sections?: unknown[] }).sections ?? []
              const fieldCount = sections.reduce<number>(
                (n, s) =>
                  n + ((s as { fields?: unknown[] }).fields?.length ?? 0),
                0,
              )
              const stats = submissionStats.get(t.id)
              return (
                <li
                  key={t.id}
                  className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/intake-forms/${t.id}`}
                        className="text-base font-semibold text-gray-800 dark:text-gray-100 hover:text-teal-700 dark:hover:text-teal-300 truncate"
                      >
                        {t.title}
                      </Link>
                      {t.isDefault === 1 && (
                        <StatusPill
                          tone="special"
                          label="Default"
                          title="Sent automatically with booking confirmations"
                        />
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span className="tabular-nums">{sections.length}</span> section{sections.length === 1 ? '' : 's'} ·{' '}
                      <span className="tabular-nums">{fieldCount}</span> field{fieldCount === 1 ? '' : 's'} ·{' '}
                      {stats && stats.count > 0 ? (
                        <span className="text-gray-700 dark:text-gray-200">
                          <span className="tabular-nums font-semibold">{stats.count}</span> submission{stats.count === 1 ? '' : 's'}
                          {stats.lastSubmittedAt && (
                            <span className="text-gray-500 dark:text-gray-400">
                              {' '}· last {fmtDate(stats.lastSubmittedAt)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">No submissions yet</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono truncate max-w-[40ch]">
                      {fillUrl}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <ActionButton variant="secondary" size="sm" href={fillUrl} target="_blank">
                      Preview ↗
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      size="sm"
                      href={`${fillUrl}?kiosk=1`}
                      target="_blank"
                      title="Fill-at-the-desk tablet mode — locked chrome, auto-resets for the next patient after each submission"
                    >
                      Kiosk ↗
                    </ActionButton>
                    <ActionButton variant="ghost" size="sm" href={`/intake-forms/${t.id}`}>
                      Edit
                    </ActionButton>
                  </div>
                </li>
              )
            })}
          </ul>
          </div>
        </>
      )}

      {templates.length > 0 && (
        <PacketsManager
          packets={packets.map(
            (p): PacketView => ({
              id: p.id,
              title: p.title,
              slug: p.slug,
              formCount: p.formIds.length,
              url: baseUrl ? `${baseUrl}/intake/packet/${p.slug}` : null,
            }),
          )}
          forms={templates.map((t) => ({ id: t.id, title: t.title }))}
        />
      )}
    </div>
  )
}
