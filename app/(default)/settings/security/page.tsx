import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getServerSession, requireUser } from '@/lib/session'
import SecurityPanel, { type SessionRow } from './security-panel'
import { PageHeader } from '@/components/ui/page-header'

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
      <PageHeader eyebrow="Account" title="Security" subtitle="Active sessions and your password." />
      <div className="v2-panel mb-8">
        <SecurityPanel sessions={sessions} />
      </div>
    </>
  )
}
