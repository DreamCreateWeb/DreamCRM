import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { slugify } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * One-time admin endpoint. Removed after use.
 *
 * POST /api/admin/bootstrap
 * Authorization: Bearer <ADMIN_BOOTSTRAP_TOKEN>
 *
 * Actions:
 *   { "action": "create-platform-admin", "email": "...", "password": "...",
 *     "name": "...", "orgName": "Dream Create", "orgSlug": "dream-create" }
 *
 *     Creates a user via better-auth, flips platformAdmin=true, creates a
 *     type='platform' organization (or reuses an existing one with the same
 *     slug), inserts member(role='owner'), and sets the user's active org
 *     to the platform org on every session row they currently have.
 */

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function checkAuth(request: Request): boolean {
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return false
  const provided = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}

export async function POST(request: Request) {
  if (!checkAuth(request)) return unauthorized()
  const body = (await request.json().catch(() => ({}))) as {
    action?: string
    email?: string
    password?: string
    name?: string
    orgName?: string
    orgSlug?: string
  }

  if (body.action === 'create-platform-admin') {
    const { email, password, name } = body
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'email, password, name required' }, { status: 400 })
    }
    const orgName = body.orgName || 'Dream Create'
    const orgSlug = body.orgSlug || slugify(orgName) || 'dream-create'

    // 1. Create or reuse user
    let userId: string
    const [existingUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1)

    let userCreated = false
    if (existingUser) {
      userId = existingUser.id
    } else {
      const result: any = await auth.api.signUpEmail({
        body: { email, password, name },
      })
      if (!result?.user?.id) {
        return NextResponse.json(
          { error: 'sign-up failed', detail: result },
          { status: 500 }
        )
      }
      userId = result.user.id
      userCreated = true
    }

    // 2. Flip platformAdmin
    await db
      .update(schema.user)
      .set({ platformAdmin: true, updatedAt: new Date() })
      .where(eq(schema.user.id, userId))

    // 3. Create or reuse platform org
    let orgId: string
    const [existingOrg] = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.slug, orgSlug))
      .limit(1)

    if (existingOrg) {
      orgId = existingOrg.id
      // Ensure type='platform'
      if (existingOrg.type !== 'platform') {
        await db
          .update(schema.organization)
          .set({ type: 'platform' })
          .where(eq(schema.organization.id, orgId))
      }
    } else {
      orgId = crypto.randomUUID()
      await db.insert(schema.organization).values({
        id: orgId,
        name: orgName,
        slug: orgSlug,
        type: 'platform',
      })
    }

    // 4. Ensure membership(role=owner)
    const [existingMember] = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.organizationId, orgId))
      .limit(50)
      .then((rows) => rows.filter((m) => m.userId === userId))

    if (!existingMember) {
      await db.insert(schema.member).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId,
        role: 'owner',
      })
    } else if (existingMember.role !== 'owner') {
      await db
        .update(schema.member)
        .set({ role: 'owner' })
        .where(eq(schema.member.id, existingMember.id))
    }

    // 5. Set active org on any current session rows for this user (so login
    //    immediately lands them in the platform admin dashboard).
    await db
      .update(schema.session)
      .set({ activeOrganizationId: orgId })
      .where(eq(schema.session.userId, userId))

    return NextResponse.json({
      ok: true,
      userId,
      userCreated,
      orgId,
      orgSlug,
      message: userCreated
        ? 'User created, marked as platformAdmin, linked to Dream Create platform org as owner.'
        : 'User already existed; marked as platformAdmin and ensured ownership of Dream Create platform org.',
    })
  }

  return NextResponse.json({ error: `unknown action: ${body.action}` }, { status: 400 })
}
