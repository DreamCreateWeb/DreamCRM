import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export const dynamic = 'force-dynamic'

// Build the handlers lazily so `next build` doesn't need BETTER_AUTH_SECRET
// in env at build time — only at first request.
let handlers: ReturnType<typeof toNextJsHandler> | null = null
function getHandlers() {
  if (!handlers) handlers = toNextJsHandler(auth.handler)
  return handlers
}

export async function GET(request: Request) {
  return getHandlers().GET(request)
}

export async function POST(request: Request) {
  return getHandlers().POST(request)
}
