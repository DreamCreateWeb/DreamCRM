import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { payerNoteKey, type PayerNoteFields, type PayerNoteView } from '@/lib/payer-notebook'

/**
 * THE PAYER NOTEBOOK — the server half (2026-10-08). One row per clinic per
 * payer, upserted on (organization_id, payer_key). Every read and write
 * carries the org id: a practice's contract facts about Delta are not
 * another practice's.
 */

type Row = typeof schema.clinicPayerNote.$inferSelect

function toView(r: Row, updatedByName: string | null): PayerNoteView {
  return {
    id: r.id,
    payerKey: r.payerKey,
    payerId: r.payerId,
    payerName: r.payerName,
    feeSchedule: r.feeSchedule,
    network: r.network === 'in' || r.network === 'out' ? r.network : null,
    paysOn: r.paysOn === 'seat' || r.paysOn === 'prep' ? r.paysOn : null,
    claimsAddress: r.claimsAddress,
    phone: r.phone,
    notes: r.notes,
    updatedAtIso: r.updatedAt.toISOString(),
    updatedByName,
  }
}

/** The clinic's note for a payer, or null when nothing is written (or no payer is identifiable). */
export async function getPayerNote(organizationId: string, payerId: string | null | undefined, payerName: string | null | undefined): Promise<PayerNoteView | null> {
  const key = payerNoteKey(payerId, payerName)
  if (!key) return null
  const [row] = await db
    .select({ note: schema.clinicPayerNote, updatedByName: schema.user.name })
    .from(schema.clinicPayerNote)
    .leftJoin(schema.user, eq(schema.user.id, schema.clinicPayerNote.updatedByUserId))
    .where(and(eq(schema.clinicPayerNote.organizationId, organizationId), eq(schema.clinicPayerNote.payerKey, key)))
    .limit(1)
  return row ? toView(row.note, row.updatedByName?.trim() || null) : null
}

/** Write (or overwrite) the clinic's note for a payer. Returns the stored view. */
export async function savePayerNote(args: {
  organizationId: string
  payerId: string | null | undefined
  payerName: string
  fields: PayerNoteFields
  userId: string | null
  now?: Date
}): Promise<PayerNoteView | null> {
  const key = payerNoteKey(args.payerId, args.payerName)
  if (!key) return null
  const now = args.now ?? new Date()
  const values = {
    payerId: (args.payerId ?? '').trim() || null,
    payerName: args.payerName.trim(),
    feeSchedule: args.fields.feeSchedule,
    network: args.fields.network,
    paysOn: args.fields.paysOn,
    claimsAddress: args.fields.claimsAddress,
    phone: args.fields.phone,
    notes: args.fields.notes,
    updatedByUserId: args.userId,
    updatedAt: now,
  }
  await db
    .insert(schema.clinicPayerNote)
    .values({ id: newId('pnote'), organizationId: args.organizationId, payerKey: key, createdAt: now, ...values })
    .onConflictDoUpdate({ target: [schema.clinicPayerNote.organizationId, schema.clinicPayerNote.payerKey], set: values })
  return getPayerNote(args.organizationId, args.payerId, args.payerName)
}
