import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization, magicLink } from 'better-auth/plugins'
import { nextCookies } from 'better-auth/next-js'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema/auth'
import {
  sendInvitationEmail,
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '@/lib/email'

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

    user: {
      additionalFields: {
        platformAdmin: {
          type: 'boolean',
          defaultValue: false,
          input: false,
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
          await sendMagicLinkEmail(email, url)
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
