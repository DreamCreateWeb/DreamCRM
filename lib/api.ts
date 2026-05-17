import 'server-only'
import { NextResponse } from 'next/server'
import { ZodError, type ZodTypeAny, type infer as ZInfer } from 'zod'
import { getServerSession } from './session'

export type ApiHandler<T> = (ctx: { request: Request; user: { id: string; role: string }; body: T }) => Promise<unknown>

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status })
}

export async function authedHandler<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  fn: (args: { user: { id: string; role: string }; body: ZInfer<S> }) => Promise<unknown>
) {
  const session = await getServerSession()
  if (!session?.user) return jsonError('unauthorized', 401)
  let body: ZInfer<S>
  try {
    const raw = request.method === 'GET' ? {} : await request.json()
    body = schema.parse(raw)
  } catch (err) {
    if (err instanceof ZodError) {
      return jsonError('invalid input', 422, { issues: err.issues })
    }
    return jsonError('invalid json', 400)
  }
  try {
    const result = await fn({
      user: { id: session.user.id, role: (session.user as any).role ?? 'member' },
      body,
    })
    return NextResponse.json(result ?? { ok: true })
  } catch (err) {
    console.error('[api]', err)
    return jsonError((err as Error).message ?? 'internal error', 500)
  }
}

export function searchParams(url: string) {
  return new URL(url).searchParams
}
