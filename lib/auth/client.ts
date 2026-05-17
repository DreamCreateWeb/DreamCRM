'use client'

import { createAuthClient } from 'better-auth/react'
import { organizationClient } from 'better-auth/client/plugins'

// IMPORTANT: do NOT set baseURL here. Leaving it undefined makes the client
// post to the same origin the page was served from, which:
//   1. Avoids CORS entirely.
//   2. Lets the same code work across the canonical Vercel URL, every
//      preview URL, and any custom domain (e.g. *.dreamcreatestudio.com).
//   3. Ensures the Set-Cookie header sets the cookie on the *current* origin
//      so middleware sees the new session on the very next request.
// Setting baseURL to NEXT_PUBLIC_APP_URL while the user is on a different
// alias produces "Failed to fetch" (CORS) and / or sets cookies on the
// wrong origin so middleware never sees them.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
})

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  resetPassword,
  requestPasswordReset,
  updateUser,
  changePassword,
  organization,
} = authClient
