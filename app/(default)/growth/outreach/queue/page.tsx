import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { resolvePatientAudience } from '@/lib/services/marketing'
import { OUTREACH_TIERS, ensureOutreachTierAudiences } from '@/lib/services/outreach-tiers'
import { listTemplates } from '@/lib/services/marketing-templates'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { FilterChip } from '@/components/ui/filter-chip'
import { EmptyState } from '@/components/ui/empty-state'
import { EncodingLegend } from '@/components/ui/encoding-legend'

export const metadata = {
  title: 'Outreach Queue - DreamCRM',
  description: 'Patients needing outreach, grouped by urgency tier',
}

export const dynamic = 'force-dynamic'

/**
 * Outreach Queue — the clinic-tenant replacement for the SaaS lead
 * pipeline kanban. Research-grounded (Lighthouse 360 morning task list,
 * Weave overdue-patients sorted list): a filterable list of patients
 * needing outreach, grouped by urgency tier, with per-tier "Send
 * campaign" actions that pre-populate the campaign editor with the
 * right audience + template.
 *
 * Tier definitions live in lib/services/outreach-tiers.ts (shared with
 * the ensure-audiences helper) so the "Send" CTA always carries a real
 * audience id — find-or-created per org, never a name-based guess. No
 * drag-and-drop kanban (zero of 8 surveyed dental products do this —
 * lifecycle is activity-derived).
 */

interface SP {
  tier?: string
}

const TIER_ACCENT_BG: Record<'amber' | 'rose' | 'emerald' | 'violet', string> = {
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  violet: 'bg-violet-50 dark:bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-200 dark:border-violet-500/30',
}

export default async function OutreachQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/marketing/pipeline')

  const params = await searchParams
  const selectedTier = params.tier && OUTREACH_TIERS.some((t) => t.key === params.tier) ? params.tier : null
  const tiersToShow = selectedTier ? OUTREACH_TIERS.filter((t) => t.key === selectedTier) : OUTREACH_TIERS

  // Guarantee each tier's saved audience exists (find-or-create, idempotent)
  // so the "Send" CTA can never silently degrade to an unprefilled campaign
  // the way the old name-based lookup could.
  const audienceIdByTier = await ensureOutreachTierAudiences(ctx.organizationId)

  // Look up the system templates so the "Send" CTA can pre-select the
  // right one per tier ("Start from" in the new-campaign modal).
  const templates = await listTemplates(ctx.organizationId)
  const templateIdByCategory = new Map(templates.map((t) => [t.category, t.id]))

  const sections = await Promise.all(
    tiersToShow.map(async (tier) => {
      const recipients = await resolvePatientAudience(ctx.organizationId, tier.filter)
      const audienceId = audienceIdByTier.get(tier.key) ?? null
      const templateId = templateIdByCategory.get(tier.templateCategory) ?? null
      return { tier, recipients, audienceId, templateId }
    }),
  )

  const totalCount = sections.reduce((sum, s) => sum + s.recipients.length, 0)

  const activeTierCount = sections.filter((s) => s.recipients.length > 0).length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      {/* ── Header — this page IS the queue; the per-tier "Send" buttons are
          the actions, so no fabricated header primary. Back to the recall
          dashboard sits as a ghost link. ──────────────────────────────── */}
      <PageHeader
        eyebrow={`Growth · ${ctx.organizationName}`}
        title="Patients needing outreach"
        subtitle={
          totalCount === 0
            ? 'Nobody needs outreach right now. Healthy roster.'
            : `${totalCount} ${totalCount === 1 ? 'patient' : 'patients'} across ${activeTierCount} ${activeTierCount === 1 ? 'tier' : 'tiers'} — pick a tier and send.`
        }
        legend={
          <EncodingLegend
            label="What the tiers mean"
            pills={[
              { tone: 'warn', label: 'Recall due', meaning: 'Last cleaning over 6 months ago, no future booking' },
              { tone: 'urgent', label: 'Lapsed', meaning: 'The cold ones — well past their recall window, no future booking' },
              { tone: 'ok', label: 'New patient', meaning: 'Joined in the past 60 days — first-visit follow-up' },
              { tone: 'special', label: 'Birthday', meaning: 'Celebrating a birthday this calendar month' },
              { tone: 'neutral', label: 'Opted out', meaning: 'Opted out of marketing email — appointment reminders and receipts still go out' },
              { tone: 'warn', label: 'No email', meaning: 'No email on file — add one to include them' },
            ]}
          />
        }
        actions={
          <ActionButton variant="ghost" href="/growth/outreach">
            ← Recall dashboard
          </ActionButton>
        }
      />

      {/* ── Tier filter chips (server-rendered Links — navigation, not local
          toggle state — styled to the shared chip recipe) ──────────────── */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        <FilterChip href="/growth/outreach/queue" active={selectedTier === null} count={totalCount}>
          All tiers
        </FilterChip>
        {OUTREACH_TIERS.map((tier) => {
          const count = sections.find((s) => s.tier.key === tier.key)?.recipients.length
            ?? (selectedTier !== null && selectedTier !== tier.key ? null : 0)
          return (
            <FilterChip
              key={tier.key}
              href={`/growth/outreach/queue?tier=${tier.key}`}
              active={selectedTier === tier.key}
              count={count ?? undefined}
            >
              {tier.label}
            </FilterChip>
          )
        })}
      </div>

      {/* ── Tier sections ─────────────────────────────────────────────── */}
      {sections.map(({ tier, recipients, audienceId, templateId }) => {
        const sendHref = audienceId
          ? `/growth/outreach?prefill_audience=${audienceId}${templateId ? `&prefill_template=${templateId}` : ''}`
          : '/growth/outreach'
        return (
          <section key={tier.key} className="mb-6">
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-t-[var(--r-lg)] border ${TIER_ACCENT_BG[tier.accent]}`}>
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  {tier.label}
                  <span className="text-xs font-medium opacity-80 tabular-nums font-mono-num">
                    · {recipients.length} {recipients.length === 1 ? 'patient' : 'patients'}
                  </span>
                </h2>
                <p className="text-xs opacity-80 mt-0.5">{tier.description}</p>
              </div>
              {recipients.length > 0 && (
                <ActionButton variant="primary" size="sm" href={sendHref} className="shrink-0">
                  Send {tier.label.toLowerCase()}
                </ActionButton>
              )}
            </div>
            {recipients.length === 0 ? (
              <div className="border border-t-0 border-[color:var(--color-hairline)] rounded-b-[var(--r-lg)] bg-[color:var(--color-surface-2)]">
                <EmptyState
                  icon="✅"
                  title="No patients in this tier right now."
                  body="When someone falls into this group, they'll appear here ready to message."
                />
              </div>
            ) : (
              <div className="border border-t-0 border-[color:var(--color-hairline)] rounded-b-[var(--r-lg)] bg-[color:var(--color-surface-2)] overflow-hidden">
                <ul className="divide-y divide-[color:var(--color-hairline)]">
                  {recipients.slice(0, 50).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                            {r.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {r.email ?? <span className="italic">no email</span>}
                            {r.phone && <span className="ml-2 text-gray-500 dark:text-gray-400">· {r.phone}</span>}
                          </p>
                        </div>
                        {!r.emailOptIn && (
                          <StatusPill tone="neutral" label="Opted out" title="Opted out of marketing email — appointment reminders and receipts still go out" />
                        )}
                        {!r.email && (
                          <StatusPill tone="warn" label="No email" title="No email on file — add one to include them in email sends" />
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">View →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {recipients.length > 50 && (
                  <div className="px-4 py-2 border-t border-[color:var(--color-hairline)] text-xs text-gray-500 dark:text-gray-400">
                    … and {recipients.length - 50} more — narrow with filters above or send the full campaign.
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

