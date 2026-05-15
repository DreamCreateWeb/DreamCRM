import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from './db'
import * as schema from './db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      // TODO: hook up real email transport (Resend / SES). For now, log so dev sees it.
      console.log(`[auth] password reset for ${user.email}: ${url}`)
    },
  },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'member', input: false },
      companyName: { type: 'string', required: false },
      city: { type: 'string', required: false },
      postalCode: { type: 'string', required: false },
      streetAddress: { type: 'string', required: false },
      country: { type: 'string', required: false },
      newsletter: { type: 'boolean', defaultValue: false },
      onboardingStep: { type: 'number', defaultValue: 0, input: false },
      onboardingComplete: { type: 'boolean', defaultValue: false, input: false },
      accountType: { type: 'string', required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
  },
  plugins: [nextCookies()],
})

export type Auth = typeof auth
