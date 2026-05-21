import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { requireTenant } from '@/lib/auth/context'
import { db, schema } from '@/lib/db'
import { resolvePatientAudience, type PatientAudienceFilterT } from '@/lib/services/marketing'
import { listTemplates } from '@/lib/services/marketing-templates'

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
 * Tiers map 1:1 to the demo-seeded patient-source audiences so the
 * "Send recall to all" CTA links straight to a campaign-new flow with
 * the audience pre-selected. No drag-and-drop kanban (zero of 8
 * surveyed dental products do this — lifecycle is activity-derived).
 */

interface SP {
  tier?: string
}

const TIER_DEFS = [
  {
    key: 'recall_due',
    label: 'Recall due',
    description: 'Last cleaning over 6 months ago, no future booking',
    audienceName: 'Recall due (6+ months)',
    templateCategory: 'reactivation' as const,
    accent: 'amber' as const,
    filter: {
      recallStatuses: ['due', 'overdue'],
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    } satisfies Partial<PatientAudienceFilterT>,
  },
  {
    key: 'lapsed',
    label: 'Lapsed',
    description: 'Lifecycle = lapsed — over 9 months, the cold ones',
    audienceName: 'Lapsed (lifecycle = lapsed)',
    templateCategory: 'reactivation' as const,
    accent: 'rose' as const,
    filter: {
      lifecycles: ['lapsed', 'at_risk'],
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    } satisfies Partial<PatientAudienceFilterT>,
  },
  {
    key: 'new_patient',
    label: 'New patient welcome',
    description: 'Joined in the past 60 days — first-visit follow-up window',
    audienceName: 'New patients (past 60 days)',
    templateCategory: 'welcome' as const,
    accent: 'emerald' as const,
    filter: {
      lifecycles: ['new'],
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    } satisfies Partial<PatientAudienceFilterT>,
  },
  {
    key: 'birthday',
    label: 'Birthday this month',
    description: 'Patients celebrating a birthday this calendar month',
    audienceName: 'Birthday this month',
    templateCategory: 'birthday' as const,
    accent: 'violet' as const,
    filter: {
      birthdayThisMonth: true,
      requireEmailOptIn: true,
      requireSmsOptIn: false,
      includeArchived: false,
    } satisfies Partial<PatientAudienceFilterT>,
  },
]

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
  const selectedTier = params.tier && TIER_DEFS.some((t) => t.key === params.tier) ? params.tier : null
  const tiersToShow = selectedTier ? TIER_DEFS.filter((t) => t.key === selectedTier) : TIER_DEFS

  // Resolve patients per tier + look up corresponding audience id for the
  // "Send campaign" CTA. Audiences seeded by demo-clinic.ts match the
  // tier names; we look them up by name so this works on freshly-seeded
  // clinics + self-healed legacy demos.
  const audienceRows = await db
    .select({ id: schema.audiences.id, name: schema.audiences.name })
    .from(schema.audiences)
    .where(eq(schema.audiences.organizationId, ctx.organizationId))
  const audienceIdByName = new Map(audienceRows.map((r) => [r.name, r.id]))

  // Look up the 3 system templates so the "Send" CTA can pre-select the
  // right one per tier.
  const templates = await listTemplates(ctx.organizationId)
  const templateIdByCategory = new Map(templates.map((t) => [t.category, t.id]))

  const sections = await Promise.all(
    tiersToShow.map(async (tier) => {
      const recipients = await resolvePatientAudience(
        ctx.organizationId,
        tier.filter as PatientAudienceFilterT,
      )
      const audienceId = audienceIdByName.get(tier.audienceName) ?? null
      const templateId = templateIdByCategory.get(tier.templateCategory) ?? null
      return { tier, recipients, audienceId, templateId }
    }),
  )

  const totalCount = sections.reduce((sum, s) => sum + s.recipients.length, 0)

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[96rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
            Outreach queue
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
            Patients needing outreach
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1">
            {totalCount === 0
              ? 'Nobody needs outreach right now. Healthy roster.'
              : `${totalCount} ${totalCount === 1 ? 'patient' : 'patients'} across ${sections.filter((s) => s.recipients.length > 0).length} ${sections.filter((s) => s.recipients.length > 0).length === 1 ? 'tier' : 'tiers'}.`}
          </p>
        </div>
        <Link
          href="/marketing"
          className="text-[12px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
        >
          ← Recall dashboard
        </Link>
      </div>

      {/* ── Tier filter chips ─────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-1.5">
        <TierChip href="/marketing/outreach" active={selectedTier === null} label="All tiers" count={totalCount} />
        {TIER_DEFS.map((tier) => {
          const count = sections.find((s) => s.tier.key === tier.key)?.recipients.length
            ?? (selectedTier !== null && selectedTier !== tier.key ? null : 0)
          return (
            <TierChip
              key={tier.key}
              href={`/marketing/outreach?tier=${tier.key}`}
              active={selectedTier === tier.key}
              label={tier.label}
              count={count}
              accent={tier.accent}
            />
          )
        })}
      </div>

      {/* ── Tier sections ─────────────────────────────────────────────── */}
      {sections.map(({ tier, recipients, audienceId, templateId }) => {
        const sendHref = audienceId
          ? `/marketing/campaigns?prefill_audience=${audienceId}${templateId ? `&prefill_template=${templateId}` : ''}`
          : '/marketing/campaigns'
        return (
          <section key={tier.key} className="mb-6">
            <div className={`flex items-center justify-between px-4 py-3 rounded-t-xl border ${TIER_ACCENT_BG[tier.accent]}`}>
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  {tier.label}
                  <span className="text-[11px] font-medium opacity-80 tabular-nums">
                    · {recipients.length} {recipients.length === 1 ? 'patient' : 'patients'}
                  </span>
                </h2>
                <p className="text-[11px] opacity-75 mt-0.5">{tier.description}</p>
              </div>
              {recipients.length > 0 && (
                <Link
                  href={sendHref}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-white/80 dark:bg-stone-900/80 hover:bg-white dark:hover:bg-stone-900 backdrop-blur shrink-0"
                >
                  Send {tier.label.toLowerCase()} →
                </Link>
              )}
            </div>
            {recipients.length === 0 ? (
              <div className="border border-t-0 border-stone-200 dark:border-stone-700/60 rounded-b-xl bg-white dark:bg-stone-900 px-4 py-8 text-center">
                <p className="text-[13px] text-stone-400 dark:text-stone-500 italic">
                  No patients in this tier right now.
                </p>
              </div>
            ) : (
              <div className="border border-t-0 border-stone-200 dark:border-stone-700/60 rounded-b-xl bg-white dark:bg-stone-900 overflow-hidden">
                <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
                  {recipients.slice(0, 50).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/patients/${r.patientId}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100 truncate">
                            {r.name}
                          </p>
                          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                            {r.email ?? <span className="italic">no email</span>}
                            {r.phone && <span className="ml-2 text-stone-400 dark:text-stone-500">· {r.phone}</span>}
                          </p>
                        </div>
                        {!r.emailOptIn && (
                          <span title="Opted out of marketing email" className="text-stone-400 dark:text-stone-500">🔕</span>
                        )}
                        {!r.email && (
                          <span title="No email on file" className="text-amber-500 dark:text-amber-400">✉?</span>
                        )}
                        <span className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0">View →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {recipients.length > 50 && (
                  <div className="px-4 py-2 border-t border-stone-100 dark:border-stone-700/40 text-[11px] text-stone-400 dark:text-stone-500 italic">
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

function TierChip({
  href,
  active,
  label,
  count,
  accent,
}: {
  href: string
  active: boolean
  label: string
  count: number | null
  accent?: 'amber' | 'rose' | 'emerald' | 'violet'
}) {
  const activeAccent = accent ? TIER_ACCENT_BG[accent] : 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 border-stone-900 dark:border-stone-100'
  return (
    <Link
      href={href}
      className={
        active
          ? `text-[12px] font-semibold px-3 py-1.5 rounded-full border ${activeAccent}`
          : 'text-[12px] font-medium px-3 py-1.5 rounded-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200'
      }
    >
      {label}
      {count != null && (
        <span className={active ? 'ml-1.5 opacity-75 tabular-nums' : 'ml-1.5 text-stone-400 dark:text-stone-500 tabular-nums'}>
          {count}
        </span>
      )}
    </Link>
  )
}
