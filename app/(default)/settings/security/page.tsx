import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getServerSession, requireUser } from '@/lib/session'
import { getTenantContext } from '@/lib/auth/context'
import SettingsSidebar from '../settings-sidebar'
import SecurityPanel, { type SessionRow } from './security-panel'

export const metadata = {
  title: 'Security - DreamCRM',
  description: 'Active sessions and password',
}

export const dynamic = 'force-dynamic'

export default async function SecuritySettings() {
  const user = await requireUser()
  const ctx = await getTenantContext()
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
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[96rem] mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl text-gray-800 dark:text-gray-100 font-bold">Account Settings</h1>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-sm rounded-xl mb-8">
        <div className="flex flex-col md:flex-row md:-mr-px">
          <SettingsSidebar tenantType={ctx?.tenantType} />
          <SecurityPanel sessions={sessions} />
        </div>
      </div>
    </div>
  )
}
