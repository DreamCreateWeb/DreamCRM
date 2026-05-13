import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema/auth'

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
    requireEmailVerification: false, // flip to true once we have an email provider wired up
    minPasswordLength: 8,
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
    }),
  ],

  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ],
})

export type Auth = typeof auth
