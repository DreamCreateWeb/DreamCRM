import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { user, organization, member, account } from '@/lib/db/schema/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// One-shot platform bootstrap: creates the Dream Create platform org + the
// first platform-admin user on a fresh database. Guarded by CRON_SECRET.
// Idempotent. Run once, then this route can be removed.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const body = (await request.json().catch(() => ({}))) as {
    email?: string
    password?: string
    name?: string
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 })
  }
  const name = body.name ?? 'Dustin'

  // 1. Create the user via Better Auth (hashes the password + writes account).
  let userId: string
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, body.email)).limit(1)
  if (existing.length > 0) {
    userId = existing[0].id
  } else {
    const res = await auth.api.signUpEmail({ body: { email: body.email, password: body.password, name } })
    userId = res.user.id
  }

  // 1b. (Re)set the credential password on every run, so this route also
  // resets the admin password for an existing user — not just on creation.
  const ctx = await auth.$context
  const hashedPassword = await ctx.password.hash(body.password)
  const cred = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    .limit(1)
  if (cred.length > 0) {
    await db
      .update(account)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(account.id, cred[0].id))
  } else {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPassword,
    })
  }

  // 2. Promote to platform admin.
  await db.update(user).set({ platformAdmin: true, emailVerified: true }).where(eq(user.id, userId))

  // 3. Ensure the Dream Create platform org.
  let orgId: string
  const org = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, 'dream-create')).limit(1)
  if (org.length > 0) {
    orgId = org[0].id
  } else {
    orgId = randomUUID()
    await db.insert(organization).values({ id: orgId, name: 'Dream Create', slug: 'dream-create', type: 'platform' })
  }

  // 4. Ensure owner membership.
  const mem = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .limit(1)
  if (mem.length === 0) {
    await db.insert(member).values({ id: randomUUID(), organizationId: orgId, userId, role: 'owner' })
  }

  return NextResponse.json({ ok: true, userId, orgId })
}
