import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getServerSession, requireUser } from '@/lib/session'
import SecurityPanel, { type SessionRow } from './security-panel'
import { SettingsPage, SettingsSection } from '../settings-kit'
import { getTenantContext } from '@/lib/auth/context'
import { listRecentExports } from '@/lib/services/patient-access-log'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { formatClinicDayTime } from '@/lib/format-datetime'

export const metadata = {
  title: 'Security - DreamCRM',
  description: 'Active sessions and password',
}

export const dynamic = 'force-dynamic'

export default async function SecuritySettings() {
  const user = await requireUser()
  const current = await getServerSession()

  const rows = await db
    .select({
      id: schema.session.id,
      userAgent: schema.session.userAgent,
      ipAddress: schema.session.ipAddress,
      createdAt: schema.session.createdAt,
      updatedAt: schema.session.updatedAt,
      expiresAt: schema.session.expiresAt,
    })
    .from(schema.session)
    .where(eq(schema.session.userId, user.id))
    .orderBy(desc(schema.session.updatedAt))

  // Owner/admin of a clinic also see who took the patient list out, and when.
  const ctx = await getTenantContext()
  const showExports = !!ctx && ctx.tenantType === 'clinic' && (ctx.role === 'owner' || ctx.role === 'admin')
  const [exportRows, timeZone] = showExports
    ? await Promise.all([listRecentExports(ctx.organizationId, 10), getClinicTimeZone(ctx.organizationId)])
    : [[], 'America/New_York']

  const sessions: SessionRow[] = rows.map((r) => ({
    id: r.id,
    isCurrent: r.id === current?.session.id,
    userAgent: r.userAgent,
    ipAddress: r.ipAddress,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }))

  return (
    <>
      <SettingsPage title="Security" subtitle="Active sessions and your password.">
        <SecurityPanel sessions={sessions} />
        {showExports && (
          <SettingsSection
            title="Recent exports"
            description="Who downloaded the patient list, and when. Only owners and admins see this."
            className="mt-4"
          >
            {exportRows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No one has exported the patient list yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {exportRows.map((r) => {
                  const count = typeof r.detail?.rows === 'number' ? r.detail.rows : null
                  return (
                    <li key={r.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className="text-gray-800 dark:text-gray-100">
                        {r.userName ?? 'Someone'}
                        {count !== null && (
                          <span className="text-gray-500 dark:text-gray-400"> · {count} {count === 1 ? 'patient' : 'patients'}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                        {formatClinicDayTime(r.at, timeZone)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SettingsSection>
        )}
      </SettingsPage>
    </>
  )
}
