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
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">
            Intake Forms
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Digital forms patients fill out before their visit. Sent automatically with booking
            confirmations, or share the link directly.
          </p>
        </div>
        <form action={createBlankFormAction}>
          <button
            type="submit"
            className="btn-sm bg-gray-900 text-gray-100 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-800 dark:hover:bg-white"
          >
            + New Form
          </button>
        </form>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-12 text-center">
          <p className="text-3xl mb-3">📝</p>
          <p className="text-gray-700 dark:text-gray-200 font-medium mb-1">
            No intake forms yet
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Click <strong>New Form</strong> above — we&apos;ll seed it with the standard dental
            new-patient template you can edit.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl overflow-hidden">
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
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
                        className="text-base font-semibold text-gray-800 dark:text-gray-100 hover:text-violet-600 dark:hover:text-violet-400 truncate"
                      >
                        {t.title}
                      </Link>
                      {t.isDefault === 1 && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {sections.length} section{sections.length === 1 ? '' : 's'} · {fieldCount}{' '}
                      field{fieldCount === 1 ? '' : 's'}
                      <span className="mx-2">·</span>
                      <span className="font-mono truncate inline-block max-w-[24ch] align-middle">
                        {fillUrl}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <a
                      href={fillUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400"
                    >
                      Preview ↗
                    </a>
                    <Link
                      href={`/intake-forms/${t.id}`}
                      className="text-violet-600 dark:text-violet-400 hover:text-violet-700"
                    >
                      Edit
                    </Link>
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
