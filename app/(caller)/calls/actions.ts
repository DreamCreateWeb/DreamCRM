'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireCaller } from '@/lib/auth/context'
import {
  assertAssignedToCaller,
  bookDemoForCaller,
  fillCallerQueue,
  logCallerOutcome,
  skipProspectForCaller,
} from '@/lib/services/prospect-callers'
import { getOrGenerateCallScript } from '@/lib/services/call-script'
import { CALLER_OUTCOME_KEYS, CALLER_SKIP_REASONS, MANUAL_LOSS_REASONS } from '@/lib/types/prospecting'
import type { CallScript } from '@/lib/types/call-script'

/**
 * THE CALLER'S ACTIONS (P-02). Every one of them:
 *   1. authorizes with requireCaller({ redirectOnFail: false }) — an ACTIVE
 *      caller row looked up by user id, never tenantType;
 *   2. asserts `prospect.assigned_caller_id === caller.id` on the row before
 *      any write (assertAssignedToCaller), and the service repeats that
 *      predicate inside the UPDATE itself;
 *   3. returns `{ ok: false, error }` on a refusal and throws only for the
 *      deployment-skew case runAction classifies.
 * Nothing here reads or writes an org, a clinic or a patient table.
 */

type Fail = { ok: false; error: string }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function minutesOf(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(':').map(Number)
  return { hour: h, minute: m }
}

export async function getCallerScriptAction(
  prospectId: string,
): Promise<{ ok: true; script: CallScript | null } | Fail> {
  const { caller } = await requireCaller({ redirectOnFail: false })
  const id = z.string().min(1).parse(prospectId)
  await assertAssignedToCaller(id, caller.id)
  const script = await getOrGenerateCallScript(id)
  return { ok: true, script }
}

const outcomeSchema = z.object({
  prospectId: z.string().min(1),
  outcome: z.enum(CALLER_OUTCOME_KEYS as unknown as [string, ...string[]]),
  note: z.string().trim().max(500).optional(),
  lostReason: z.enum(MANUAL_LOSS_REASONS as unknown as [string, ...string[]]).optional(),
  /** A callback: the day + wall-clock time IN THE PRACTICE'S ZONE. */
  callbackDay: z.string().regex(DAY).optional(),
  callbackTime: z.string().regex(TIME).optional(),
})

export async function logCallerOutcomeAction(input: unknown): Promise<{ ok: true; released: boolean } | Fail> {
  const { caller } = await requireCaller({ redirectOnFail: false })
  const parsed = outcomeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That outcome did not look right — try again.' }
  const d = parsed.data
  // The demo outcome goes through the booking action (it needs a time).
  if (d.outcome === 'demo_booked') return { ok: false, error: 'Book the demo with a time.' }
  if (d.outcome === 'not_interested' && !d.lostReason) return { ok: false, error: 'Pick why they passed.' }
  // The service asserts ownership on the row and resolves a callback's
  // wall-clock in the practice's own zone.
  const r = await logCallerOutcome({
    caller,
    prospectId: d.prospectId,
    outcome: d.outcome as (typeof CALLER_OUTCOME_KEYS)[number],
    note: d.note || null,
    lostReason: d.lostReason ?? null,
    callbackLocal:
      d.outcome === 'callback' && d.callbackDay && d.callbackTime
        ? { day: d.callbackDay, ...minutesOf(d.callbackTime) }
        : null,
  })
  if (!r.ok) return r
  revalidatePath('/calls')
  return { ok: true, released: r.released }
}

const skipSchema = z.object({
  prospectId: z.string().min(1),
  reason: z.enum(CALLER_SKIP_REASONS),
  note: z.string().trim().max(300).optional(),
})

export async function skipProspectAction(input: unknown): Promise<{ ok: true } | Fail> {
  const { caller } = await requireCaller({ redirectOnFail: false })
  const parsed = skipSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick a reason to skip.' }
  await skipProspectForCaller({ caller, prospectId: parsed.data.prospectId, reason: parsed.data.reason, note: parsed.data.note })
  revalidatePath('/calls')
  return { ok: true }
}

const demoSchema = z.object({
  prospectId: z.string().min(1),
  /** Day + wall-clock time on DREAM CREATE's clock (the host's zone). */
  demoDay: z.string().regex(DAY),
  demoTime: z.string().regex(TIME),
  attendeeName: z.string().trim().max(160).optional(),
  attendeeEmail: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
})

export async function bookDemoAsCallerAction(input: unknown): Promise<{ ok: true } | Fail> {
  const { caller } = await requireCaller({ redirectOnFail: false })
  const parsed = demoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Add the demo day and time.' }
  const d = parsed.data
  if (d.attendeeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.attendeeEmail)) {
    return { ok: false, error: 'That email does not look right.' }
  }
  // Ownership is asserted inside bookDemoForCaller, on the row, before any
  // write; the wall-clock resolves on Dream Create's clock there too.
  const r = await bookDemoForCaller({
    caller,
    prospectId: d.prospectId,
    demoLocal: { day: d.demoDay, ...minutesOf(d.demoTime) },
    attendeeName: d.attendeeName || null,
    attendeeEmail: d.attendeeEmail || null,
    note: d.note || null,
  })
  if (!r.ok) return r
  revalidatePath('/calls')
  return { ok: true }
}

/** "Fill my queue" — top up to the daily target from the pool, now. */
export async function fillMyQueueAction(): Promise<{ ok: true; claimed: number; ready: number; target: number } | Fail> {
  const { caller } = await requireCaller({ redirectOnFail: false })
  const r = await fillCallerQueue(caller)
  revalidatePath('/calls')
  return { ok: true, ...r }
}
