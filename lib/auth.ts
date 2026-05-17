// Back-compat shim — prefer `@/lib/auth/server`, `@/lib/auth/client`, or
// `@/lib/auth/context` directly in new code.
export { auth, type Auth } from './auth/server'
