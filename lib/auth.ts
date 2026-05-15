import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { db } from './db'
import * as schema from './db/schema'
import { sendPasswordResetEmail } from './email'

function build() {
  return betterAuth({
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
        try {
          await sendPasswordResetEmail(user.email, url)
        } catch (err) {
          console.error('[auth] failed to send password reset email:', err)
          throw err
        }
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

// Proxy so importing `auth` doesn't throw at module-eval time when env vars
// aren't configured (e.g. during `next build` without runtime envs).
export const auth = new Proxy({} as AuthInstance, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth() as any, prop, receiver)
  },
})

export type Auth = AuthInstance
