import { Pool } from 'pg'
import { requireTenant } from '@/lib/auth/context'
import { pgSsl } from '@/lib/db'
import { REALTIME_CHANNEL } from '@/lib/services/realtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * App-wide realtime event stream. The browser opens ONE EventSource here
 * (RealtimeProvider) and receives every event published for the user's org via
 * `publishRealtime` — messages, notifications, documents, settings, … — so the
 * UI updates live without polling. Generalizes /api/inbox/stream.
 *
 * App Runner force-closes any HTTP connection at 120s and has no WebSocket
 * support, so we deliberately self-close at ~100s and let EventSource
 * auto-reconnect (invisible to the user). A 20s heartbeat keeps proxies from
 * dropping the idle connection first.
 */
export async function GET(): Promise<Response> {
  const ctx = await requireTenant()
  const orgId = ctx.organizationId
  // Staff see org-wide events; a PATIENT must only ever receive events scoped to
  // THEIR OWN record (their patientId) or targeted at them (their userId) —
  // never another patient's or a staff notification. This filter is enforced
  // server-side so other patients' event metadata never crosses the wire.
  const isPatient = ctx.tenantType === 'patient'
  const myPatientId = ctx.patientId
  const myUserId = ctx.userId

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    return new Response('DATABASE_URL not set', { status: 503 })
  }

  // Dedicated pg connection so LISTEN works (the shared Drizzle pool can't hold
  // a long-lived LISTEN cleanly). One connection per open app tab — fine at our
  // scale; a shared multiplexed listener is the eventual scaling step.
  const pool = new Pool({ connectionString, ssl: pgSsl(connectionString) })
  const client = await pool.connect()

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let autoClose: ReturnType<typeof setTimeout> | null = null
  let closed = false

  function cleanup() {
    if (closed) return
    closed = true
    if (heartbeat) clearInterval(heartbeat)
    if (autoClose) clearTimeout(autoClose)
    client.release()
    pool.end().catch(() => {})
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(chunk: string) {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      function endFromServer() {
        cleanup()
        try {
          controller.close()
        } catch {}
      }

      client.on('notification', (msg) => {
        if (!msg.payload) return
        try {
          const parsed = JSON.parse(msg.payload) as {
            orgId?: string
            userId?: string | null
            patientId?: string | null
          }
          // Tenant isolation: only forward events for THIS connection's org.
          if (parsed.orgId !== orgId) return
          // Patient isolation: a patient only receives their own patient-scoped
          // events or events explicitly targeted at their user — never another
          // patient's message/document event or a staff notification.
          if (isPatient) {
            const forMe =
              (!!parsed.userId && parsed.userId === myUserId) ||
              (!!parsed.patientId && !!myPatientId && parsed.patientId === myPatientId)
            if (!forMe) return
          }
          safeEnqueue(`data: ${msg.payload}\n\n`)
        } catch (err) {
          console.warn('[realtime.stream] bad notify payload', err)
        }
      })

      client.on('error', (err) => {
        console.warn('[realtime.stream] client error', err)
        endFromServer()
      })

      try {
        await client.query(`LISTEN ${REALTIME_CHANNEL}`)
      } catch (err) {
        console.warn('[realtime.stream] LISTEN failed', err)
        endFromServer()
        return
      }

      safeEnqueue(': connected\n\n')
      heartbeat = setInterval(() => safeEnqueue(': heartbeat\n\n'), 20_000)

      // Self-close at 100s — comfortably under App Runner's hard 120s cut, so
      // the close is ours (clean) and EventSource reconnects seamlessly.
      autoClose = setTimeout(endFromServer, 100_000)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
