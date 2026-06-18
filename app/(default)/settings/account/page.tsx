import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import AccountPanel from './account-panel'
import { requireUser } from '@/lib/session'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = {
  title: 'Account Settings - DreamCRM',
  description: 'Manage your profile and credentials',
}

export const dynamic = 'force-dynamic'

export default async function AccountSettings() {
  const user = await requireUser()
  // bio isn't on the better-auth session user — read it fresh (force-dynamic).
  const [row] = await db
    .select({ bio: schema.user.bio })
    .from(schema.user)
    .where(eq(schema.user.id, user.id))
    .limit(1)

  return (
    <>
      <PageHeader eyebrow="Account" title="Profile" subtitle="Your name, photo, bio, and sign-in email." />
      <div className="v2-panel mb-8">
        <AccountPanel
          initialUser={{
            id: user.id,
            name: user.name ?? '',
            email: user.email ?? '',
            image: user.image ?? null,
            bio: row?.bio ?? null,
          }}
        />
      </div>
    </>
  )
}
