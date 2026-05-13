import { config } from 'dotenv'
config({ path: '.env.local' })

import { auth } from '../lib/auth/server'
import { db } from '../lib/db'
import { user, organization, member, account } from '../lib/db/schema/auth'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

const EMAIL = 'Dustin@dreamcreateweb.com'
const PASSWORD = 'Silver.Mouth(00)'
const NAME = 'Dustin'
const ORG_NAME = 'Dream Create'
const ORG_SLUG = 'dream-create'

async function main() {
  // 1. Create or find the user
  let userId: string
  const [existing] = await db.select().from(user).where(eq(user.email, EMAIL)).limit(1)

  if (existing) {
    console.log(`✓ User exists: ${existing.id}`)
    userId = existing.id
  } else {
    // Use Better Auth's API so the password is hashed correctly
    const result = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: NAME },
      headers: new Headers(),
    })
    userId = result.user.id
    console.log(`✓ Created user: ${userId}`)
  }

  // 2. Set platform_admin = true and verify email
  await db
    .update(user)
    .set({ platformAdmin: true, emailVerified: true })
    .where(eq(user.id, userId))
  console.log(`✓ Set platform_admin=true and email_verified=true`)

  // 3. Create or find the Dream Create platform organization
  let orgId: string
  const [existingOrg] = await db
    .select()
    .from(organization)
    .where(eq(organization.slug, ORG_SLUG))
    .limit(1)

  if (existingOrg) {
    console.log(`✓ Platform org exists: ${existingOrg.id}`)
    orgId = existingOrg.id
  } else {
    orgId = randomUUID()
    await db.insert(organization).values({
      id: orgId,
      name: ORG_NAME,
      slug: ORG_SLUG,
      type: 'platform',
    })
    console.log(`✓ Created platform org: ${orgId}`)
  }

  // 4. Add user as owner member of the platform org
  const [existingMember] = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1)

  if (existingMember && existingMember.organizationId === orgId) {
    console.log(`✓ Member row exists for platform org`)
  } else if (!existingMember) {
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: 'owner',
    })
    console.log(`✓ Added user as owner of platform org`)
  } else {
    // Member exists but for a different org — add an additional membership
    await db.insert(member).values({
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: 'owner',
    })
    console.log(`✓ Added platform org membership (user is also in org ${existingMember.organizationId})`)
  }

  console.log('\nLogin credentials:')
  console.log(`  Email:    ${EMAIL}`)
  console.log(`  Password: ${PASSWORD}`)
  console.log(`  Platform: https://dreamcrm-dreamcreatewebs-projects.vercel.app/signin`)
}

main().catch((err) => { console.error(err); process.exit(1) })
