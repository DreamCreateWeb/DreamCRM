import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema/auth'
import { sendInvitationEmail, sendPasswordResetEmail, sendVerificationEmail } from '@/lib/email'

export const auth = betterAuth({
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

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip to true once dreamcreateweb.com is verified in Resend
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmail(user.email, url)
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url)
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh session every day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },

  user: {
    additionalFields: {
      platformAdmin: {
        type: 'boolean',
        defaultValue: false,
        input: false, // never settable from sign-up; granted manually
      },
    },
  },

  plugins: [
    organization({
      // A user can belong to multiple organizations (e.g., Dream Create staff
      // helping multiple clinics, or a family helping multiple patients).
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
  ],

  // Trust any Vercel deployment URL for this project (production alias +
  // every preview/unique URL) plus localhost. A function lets us pattern-match
  // dynamic preview URLs that change every deploy.
  trustedOrigins: (request?: Request) => {
    const origin = request?.headers.get('origin') ?? ''
    const fixed = [
      process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      'http://localhost:3000',
      'https://dreamcrm-dreamcreatewebs-projects.vercel.app',
    ]
    if (/^https:\/\/dreamcrm-[a-z0-9]+-dreamcreatewebs-projects\.vercel\.app$/.test(origin)) {
      fixed.push(origin)
    }
    return fixed
  },
})

export type Auth = typeof auth
