export const metadata = { title: 'Intake Forms — DreamCRM' }
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { listFormTemplates } from '@/lib/services/forms'
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

  const templates = await listFormTemplates(ctx.organizationId)

  // For the "share link" preview we need the canonical site URL.
  const [profile] = await db
    .select({ websiteDomain: clinicProfile.websiteDomain })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, ctx.organizationId))
    .limit(1)
  const [org] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.organizationId))
    .limit(1)
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
          <form action={createBlankFormAction}>
            <ActionButton type="submit" variant="primary" size="sm" breath>
              + New Form
            </ActionButton>
          </form>
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
                      <span className="tabular-nums">{fieldCount}</span> field{fieldCount === 1 ? '' : 's'}
                      <span className="mx-2">·</span>
                      <span className="font-mono truncate inline-block max-w-[24ch] align-middle">
                        {fillUrl}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Plain <a> (not ActionButton) because the shared button
                        primitive doesn't forward target/rel for new-tab links;
                        styled to match a secondary ActionButton. */}
                    <a
                      href={fillUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-sm bg-[color:var(--color-surface-2)] border-[color:var(--color-hairline)] hover:border-[color:var(--color-hairline-strong)] text-gray-800 dark:text-gray-300 transition-colors"
                    >
                      Preview ↗
                    </a>
                    <ActionButton variant="ghost" size="sm" href={`/intake-forms/${t.id}`}>
                      Edit
                    </ActionButton>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
