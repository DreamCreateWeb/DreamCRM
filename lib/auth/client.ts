import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

// No baseURL — Better Auth defaults to same-origin requests, which works
// across any deployment URL (production alias, preview URLs, custom domains)
// without CORS preflight failures.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  organization,
} = authClient
