import { Pool } from '@neondatabase/serverless'
import { requireTenant } from '@/lib/auth/context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Vercel Pro max function duration; we self-close at 4 min and let the
// browser's EventSource auto-reconnect, but this sets the ceiling.
export const maxDuration = 300

/**
 * Real-time inbox event stream. The browser opens an EventSource here
 * and receives a message every time a new email is ingested for the
 * user's org (push or sync) or when a sent reply is recorded. Triggers
 * a router.refresh() on the inbox page so new mail appears without
 * polling. See lib/services/inbox-events.ts for the producer side.
 */
export async function GET(): Promise<Response> {
  const ctx = await requireTenant()
  const orgId = ctx.organizationId

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return new Response('DATABASE_URL not set', { status: 503 })
  }

  // Hold a dedicated WebSocket connection to Postgres so LISTEN works
  // (the HTTP driver is request/response only). One connection per
  // open inbox tab — fine at our scale, would need pooling later.
  const pool = new Pool({ connectionString })
  const client = await pool.connect()

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let autoClose: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(chunk: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // Controller already closed (client navigated away). Mark
          // closed so the heartbeat stops attempting.
          closed = true
        }
      }
      function cleanup() {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        if (autoClose) clearTimeout(autoClose)
        client.release()
        pool.end().catch(() => {})
        try {
          controller.close()
        } catch {}
      }

      client.on('notification', (msg) => {
        if (!msg.payload) return
        try {
          const parsed = JSON.parse(msg.payload) as { orgId?: string }
          if (parsed.orgId !== orgId) return
          safeEnqueue(`data: ${msg.payload}\n\n`)
        } catch (err) {
          console.warn('[inbox.stream] bad notify payload', err)
        }
      })

      // Postgres errors on the listening client (e.g. connection drop)
      // should close the stream so the browser reconnects cleanly.
      client.on('error', (err) => {
        console.warn('[inbox.stream] client error', err)
        cleanup()
      })

      try {
        await client.query('LISTEN inbox_events')
      } catch (err) {
        console.warn('[inbox.stream] LISTEN failed', err)
        cleanup()
        return
      }

      // Initial handshake comment so the browser knows the stream opened.
      safeEnqueue(': connected\n\n')

      // Heartbeat every 20s — many proxies drop idle connections after
      // 30-60s, and any byte sent is enough to keep them alive.
      heartbeat = setInterval(() => safeEnqueue(': heartbeat\n\n'), 20_000)

      // Self-close at 4 min (Vercel function hard limit is 5 min on
      // Pro). EventSource auto-reconnects, so the user gets ~instant
      // continuity.
      autoClose = setTimeout(cleanup, 4 * 60 * 1000)
    },
    cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (autoClose) clearTimeout(autoClose)
      client.release()
      pool.end().catch(() => {})
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tell intermediaries not to buffer the stream (nginx, CDNs).
      'X-Accel-Buffering': 'no',
    },
  })
}
