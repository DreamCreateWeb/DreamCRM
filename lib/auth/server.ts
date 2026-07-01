import { randomUUID } from 'crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization, magicLink } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema/auth'
import { patient } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import {
  sendChangeEmailVerification,
  sendInvitationEmail,
  sendMagicLinkEmail,
  sendPatientPortalInviteEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '@/lib/email'
import { normalizeEmail } from '@/lib/contact-normalize'

/**
 * Resolve the org a brand-new session should be active in.
 *
 * better-auth's plain + magic-link sign-in never sets `activeOrganizationId`,
 * so a multi-clinic patient lands in whichever org they were last in (often
 * the wrong portal). Rules, defensively:
 *   - sole membership → use it (covers single-clinic patients AND single-org
 *     staff);
 *   - multiple memberships → prefer the most recent patient-role one (someone
 *     signing into a portal is almost always a patient);
 *   - genuinely ambiguous staff-in-many-orgs (no patient membership) → leave
 *     null and let the app pick, rather than guess wrong.
 * Never throws — a failed lookup just yields null (no active org set).
 */
export async function resolveDefaultActiveOrg(userId: string): Promise<string | null> {
  try {
    const memberships = await db
      .select({ organizationId: schema.member.organizationId, role: schema.member.role, createdAt: schema.member.createdAt })
      .from(schema.member)
      .where(eq(schema.member.userId, userId))
    if (memberships.length === 0) return null
    if (memberships.length === 1) return memberships[0].organizationId
    const patientMemberships = memberships
      .filter((m) => m.role === 'patient')
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    if (patientMemberships.length > 0) return patientMemberships[0].organizationId
    return null
  } catch (err) {
    console.warn('[auth] resolveDefaultActiveOrg failed', err)
    return null
  }
}

/**
 * Magic-link no-user fallback.
 *
 * `magicLink({ disableSignUp: true })` silently no-ops when no user account
 * exists for the email — but the sign-in form still says "check your inbox",
 * so a patient who was added by the front desk (patient row, but never set up
 * a login) waits for an email that never comes. Instead: if there's no user
 * but there IS a patient row for that email, send them the standard portal
 * INVITE (which lets them create the account + accept), so the dead-end
 * becomes the right onboarding email. Best-effort: any failure is swallowed so
 * we never reveal whether an account exists (no enumeration).
 *
 * Returns true when an invite was sent (so the caller skips the normal magic
 * link, which would no-op anyway).
 */
export async function maybeSendPortalInviteForMagicLink(rawEmail: string): Promise<boolean> {
  try {
    const email = normalizeEmail(rawEmail)
    if (!email) return false

    // A user account already exists → let the normal magic link handle it.
    const [existingUser] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = ${email}`)
      .limit(1)
    if (existingUser) return false

    // No user — find the most recent patient row with this email, any org.
    const [pat] = await db
      .select({
        id: patient.id,
        organizationId: patient.organizationId,
        firstName: patient.firstName,
      })
      .from(patient)
      .where(and(sql`lower(${patient.email}) = ${email}`, eq(patient.isActive, 1)))
      .orderBy(desc(patient.firstSeenAt))
      .limit(1)
    if (!pat) return false

    // Reuse a still-pending invite for this org+email rather than piling up rows.
    const [existing] = await db
      .select({ id: schema.invitation.id })
      .from(schema.invitation)
      .where(
        and(
          eq(schema.invitation.organizationId, pat.organizationId),
          sql`lower(${schema.invitation.email}) = ${email}`,
          eq(schema.invitation.status, 'pending'),
        ),
      )
      .limit(1)
    const inviteId = existing?.id ?? randomUUID()
    if (!existing) {
      // inviterId is NOT NULL; attribute the system-generated invite to a
      // clinic owner/admin so the FK holds. Fall back to any member if needed.
      const [staff] = await db
        .select({ userId: schema.member.userId })
        .from(schema.member)
        .where(eq(schema.member.organizationId, pat.organizationId))
        .orderBy(desc(schema.member.createdAt))
        .limit(1)
      if (!staff) return false
      await db.insert(schema.invitation).values({
        id: inviteId,
        organizationId: pat.organizationId,
        email,
        role: 'patient',
        status: 'pending',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        inviterId: staff.userId,
      })
    }

    // Use the clinic's display name for the email (Tier-1 sender identity is
    // applied by deliver(); the body just needs a friendly clinic name).
    const [profile] = await db
      .select({ displayName: clinicProfile.displayName })
      .from(clinicProfile)
      .where(eq(clinicProfile.organizationId, pat.organizationId))
      .limit(1)
    const [org] = await db
      .select({ name: schema.organization.name })
      .from(schema.organization)
      .where(eq(schema.organization.id, pat.organizationId))
      .limit(1)
    const clinicName = profile?.displayName || org?.name || 'Your dental office'

    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.dreamcreatestudio.com'
    // Editable copy (Settings → Automations → Emails); Tier-1 sender applied by deliver().
    const { renderAutomatedEmail } = await import('@/lib/services/email-automations')
    const rendered = await renderAutomatedEmail(pat.organizationId, 'portal_invite', {
      firstName: pat.firstName,
      clinicName,
    })
    await sendPatientPortalInviteEmail(
      email,
      {
        clinicName,
        patientFirstName: pat.firstName,
        inviteUrl: `${base}/accept-invite?token=${inviteId}`,
      },
      undefined,
      rendered.override,
    )
    return true
  } catch (err) {
    console.warn('[auth] maybeSendPortalInviteForMagicLink failed', err)
    return false
  }
}

/**
 * Best-effort clinic sender identity for a magic-link recipient.
 *
 * A magic-link email should wear the patient's CLINIC brand, not "Dream Create".
 * Same lookup shape as `maybeSendPortalInviteForMagicLink`: find the most-recent
 * active patient row for this email (any org) and resolve that clinic's Tier 1/
 * Tier 2 sender identity. Returns null for staff (no patient row) so the
 * platform-branded fallback copy is used. Never throws — any failure yields null.
 */
export async function maybeClinicSenderForEmail(rawEmail: string): Promise<import('@/lib/email-identity').ClinicSender | null> {
  try {
    const email = normalizeEmail(rawEmail)
    if (!email) return null
    const [pat] = await db
      .select({ organizationId: patient.organizationId })
      .from(patient)
      .where(and(sql`lower(${patient.email}) = ${email}`, eq(patient.isActive, 1)))
      .orderBy(desc(patient.firstSeenAt))
      .limit(1)
    if (!pat) return null
    const { getClinicSenderIdentity } = await import('@/lib/services/clinic-sender')
    return await getClinicSenderIdentity(pat.organizationId)
  } catch (err) {
    console.warn('[auth] maybeClinicSenderForEmail failed', err)
    return null
  }
}

function build() {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),

    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,

    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendPasswordResetEmail(user.email, url)
        } catch (err) {
          console.error('[auth] failed to send password reset email:', err)
          throw err
        }
      },
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await sendVerificationEmail(user.email, url)
        } catch (err) {
          console.error('[auth] failed to send verification email:', err)
        }
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh once a day
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    databaseHooks: {
      session: {
        create: {
          // Set activeOrganizationId at session-create time so sign-in (plain
          // OR magic link) lands the user in the right tenant. The accept-invite
          // flow still sets it explicitly; this only fills the gap when nothing
          // set it. Returning { data } merges our field into the row pre-write.
          before: async (session) => {
            if (session.activeOrganizationId) return
            const orgId = await resolveDefaultActiveOrg(session.userId)
            if (!orgId) return
            return { data: { ...session, activeOrganizationId: orgId } }
          },
        },
      },
    },

    user: {
      additionalFields: {
        platformAdmin: {
          type: 'boolean',
          defaultValue: false,
          input: false,
        },
      },
      // Email is the sign-in identity, so a change must be VERIFIED — never a
      // silent write. With this enabled:
      //   - verified user → a confirmation link is sent to the CURRENT email
      //     (`sendChangeEmailConfirmation`); the change applies only after they
      //     click it (so an attacker on a borrowed session can't repoint the
      //     login without access to the existing mailbox);
      //   - unverified user → `updateEmailWithoutVerification` stays false, so
      //     the change falls through to a verification link sent to the NEW
      //     email (via `emailVerification.sendVerificationEmail`) and applies
      //     only after that's clicked.
      // Either way the email never changes without a click on a mailbox the
      // user controls. (Previously `saveAccount` wrote `user.email` directly —
      // account-takeover-adjacent.)
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
          try {
            await sendChangeEmailVerification(user.email, newEmail, url)
          } catch (err) {
            console.error('[auth] failed to send change-email confirmation:', err)
            throw err
          }
        },
      },
    },

    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        organizationLimit: 10,
        async sendInvitationEmail(data) {
          await sendInvitationEmail(data.invitation.email, {
            inviterName: data.inviter.user.name,
            orgName: data.organization.name,
            role: data.invitation.role,
            inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/accept-invite?token=${data.invitation.id}`,
          })
        },
      }),
      // Passwordless sign-in for returning users — portal visits are
      // episodic (~6 months apart for dental), so "email me a link" beats
      // password recall. disableSignUp: a link can only sign in an EXISTING
      // account (patients arrive via invite / booking), never create one.
      magicLink({
        disableSignUp: true,
        expiresIn: 60 * 15,
        async sendMagicLink({ email, url }) {
          // better-auth calls sendMagicLink for EVERY request, before it knows
          // whether a user exists — and with disableSignUp the verify step then
          // no-ops for a no-user email (the silent dead-end). So: if there's no
          // user but there is a patient row for this email, send the portal
          // invite instead (and skip the link that would no-op). Otherwise send
          // the normal magic link. Same on-screen message either way.
          const sentInvite = await maybeSendPortalInviteForMagicLink(email)
          if (sentInvite) return
          // Wear the patient's clinic brand when we can resolve one; fall back
          // to the platform-branded email for staff (no patient row).
          const sender = await maybeClinicSenderForEmail(email)
          await sendMagicLinkEmail(email, url, sender ?? undefined)
        },
      }),
      nextCookies(),
    ],

    // Trust the Vercel production alias + every preview URL + localhost.
    trustedOrigins: (request?: Request) => {
      const origin = request?.headers.get('origin') ?? ''
      const fixed = [
        process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        process.env.BETTER_AUTH_URL ?? '',
        'http://localhost:3000',
        'https://dreamcrm-dreamcreatewebs-projects.vercel.app',
      ].filter(Boolean)
      if (/^https:\/\/dreamcrm-[a-z0-9]+-dreamcreatewebs-projects\.vercel\.app$/.test(origin)) {
        fixed.push(origin)
      }
      return fixed
    },
  })
}

type AuthInstance = ReturnType<typeof build>

let cached: AuthInstance | null = null

function getAuth(): AuthInstance {
  if (cached) return cached
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is not set. Configure it in your environment.')
  }
  cached = build()
  return cached
}

// Lazy Proxy so `next build` doesn't need BETTER_AUTH_SECRET at module-eval.
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth() as any, prop, receiver)
  },
})

export type Auth = AuthInstance
