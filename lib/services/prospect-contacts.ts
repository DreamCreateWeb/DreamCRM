import 'server-only'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  contactRoleFor,
  parseEmail,
  pickPrimaryEmail,
  rankContactEmail,
  isJunkEmail,
  type ContactRole,
  type EmailVerifyStatus,
} from '@/lib/prospect-email'
import { verifyEmail } from './prospect-email-verify'

/**
 * The reachability layer — turn the crawl's raw address list into ranked,
 * MX-verified contacts and choose the one address the engine reaches out on.
 *
 * `prospect.email` stays the single send target the outreach engine reads;
 * this module keeps it pointed at the best deliverable contact (a named
 * dentist over a shared desk), and NEVER auto-overwrites an address a human
 * pinned (prospect.emailSource === 'manual'). Every stored contact is real —
 * discovered by the crawl or entered by a human — honoring no-guessing.
 */

export interface ProspectContactRow {
  id: string
  email: string
  name: string | null
  role: ContactRole
  source: string
  verifyStatus: EmailVerifyStatus
  verifyReason: string | null
  rank: number
  isPrimary: boolean
}

function toRow(c: typeof schema.prospectContact.$inferSelect): ProspectContactRow {
  return {
    id: c.id,
    email: c.email,
    name: c.name,
    role: c.role as ContactRole,
    source: c.source,
    verifyStatus: c.verifyStatus as EmailVerifyStatus,
    verifyReason: c.verifyReason,
    rank: c.rank,
    isPrimary: c.isPrimary === 1,
  }
}

export async function listProspectContacts(prospectId: string): Promise<ProspectContactRow[]> {
  const rows = await db
    .select()
    .from(schema.prospectContact)
    .where(eq(schema.prospectContact.prospectId, prospectId))
    .orderBy(desc(schema.prospectContact.isPrimary), desc(schema.prospectContact.rank), asc(schema.prospectContact.email))
  return rows.map(toRow)
}

/**
 * Recompute which contact is primary and mirror it onto prospect.email.
 * Honors a human pin (emailSource==='manual') as long as that pinned address
 * still exists and is deliverable; otherwise auto-picks the best-ranked
 * non-invalid contact. Clears prospect.email when nothing is sendable (which
 * routes the prospect to the phone queue instead of auto-enroll).
 */
async function resyncPrimary(prospectId: string): Promise<void> {
  const [p] = await db
    .select({
      email: schema.prospect.email,
      emailSource: schema.prospect.emailSource,
      officialName: schema.prospect.authorizedOfficialName,
    })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return

  const contacts = await listProspectContacts(prospectId)
  const sendable = contacts.filter((c) => c.verifyStatus !== 'invalid')
  const pinnedEmail = p.emailSource === 'manual' ? p.email : null
  const pinStillGood = pinnedEmail && sendable.some((c) => c.email === pinnedEmail)

  const primaryEmail = pinStillGood
    ? pinnedEmail
    : pickPrimaryEmail(sendable.map((c) => ({ email: c.email, verifyStatus: c.verifyStatus })), p.officialName)

  // Flip isPrimary flags to match.
  for (const c of contacts) {
    const shouldBe = c.email === primaryEmail ? 1 : 0
    if ((c.isPrimary ? 1 : 0) !== shouldBe) {
      await db
        .update(schema.prospectContact)
        .set({ isPrimary: shouldBe, updatedAt: new Date() })
        .where(eq(schema.prospectContact.id, c.id))
    }
  }

  // Mirror to prospect.email — but never stomp a human pin that's still good.
  if (pinStillGood) return
  const nextSource = primaryEmail ? (p.emailSource === 'manual' ? 'crawl_mailto' : p.emailSource ?? 'crawl_mailto') : null
  if (primaryEmail !== p.email || (!primaryEmail && p.email)) {
    await db
      .update(schema.prospect)
      .set({ email: primaryEmail, emailSource: primaryEmail ? nextSource : null, updatedAt: new Date() })
      .where(eq(schema.prospect.id, prospectId))
  }
}

/**
 * Sync discovered addresses into prospect_contact: classify role, MX-verify,
 * rank, upsert (conflict = refresh verify/rank/role, keep source+name), then
 * re-pick the primary. Best-effort — verification failures degrade to
 * 'unknown', never throw. Call from enrichment after the crawl.
 */
export async function syncProspectContacts(
  prospect: { id: string; authorizedOfficialName: string | null; email: string | null; emailSource: string | null },
  discoveredEmails: string[],
): Promise<{ upserted: number; verified: number }> {
  const mxCache = new Map<string, 'has' | 'none' | 'error'>()
  const seen = new Set<string>()
  let upserted = 0
  let verified = 0

  // Include an already-stored prospect.email so legacy rows get a contact +
  // verification even if the fresh crawl no longer lists it.
  const candidates = [...discoveredEmails]
  if (prospect.email) candidates.push(prospect.email)

  for (const raw of candidates) {
    const parsed = parseEmail(raw)
    if (!parsed || isJunkEmail(parsed.email)) continue
    if (seen.has(parsed.email)) continue
    seen.add(parsed.email)

    const role = contactRoleFor(parsed.email, prospect.authorizedOfficialName)
    const { status, reason } = await verifyEmail(parsed.email, mxCache)
    verified++
    const rank = rankContactEmail({ email: parsed.email, personName: prospect.authorizedOfficialName, verifyStatus: status })
    // Owner-matched address carries the known owner's name.
    const name = role === 'owner' ? prospect.authorizedOfficialName : null
    // The stored prospect.email's source, if it's this address.
    const source = prospect.email === parsed.email && prospect.emailSource ? prospect.emailSource : 'crawl_mailto'

    await db
      .insert(schema.prospectContact)
      .values({
        id: newId('pcon'),
        prospectId: prospect.id,
        email: parsed.email,
        name,
        role,
        source,
        verifyStatus: status,
        verifyReason: reason,
        verifiedAt: new Date(),
        rank,
        isPrimary: 0,
      })
      .onConflictDoUpdate({
        target: [schema.prospectContact.prospectId, schema.prospectContact.email],
        // Refresh the volatile fields; preserve source + a human-entered name.
        set: { role, verifyStatus: status, verifyReason: reason, verifiedAt: new Date(), rank, updatedAt: new Date() },
      })
    upserted++
  }

  await resyncPrimary(prospect.id)
  return { upserted, verified }
}

/** Human adds an address they found (on the call, in the chart) — verified,
 *  stored source='manual', and pinned as the send target. */
export async function addManualContact(
  prospectId: string,
  input: { email: string; name?: string | null },
): Promise<{ ok: true; contactId: string } | { ok: false; reason: string }> {
  const parsed = parseEmail(input.email)
  if (!parsed) return { ok: false, reason: 'invalid_email' }

  const [p] = await db
    .select({ officialName: schema.prospect.authorizedOfficialName })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (!p) return { ok: false, reason: 'not_found' }

  const { status, reason } = await verifyEmail(parsed.email)
  const role = contactRoleFor(parsed.email, p.officialName)
  const rank = rankContactEmail({ email: parsed.email, personName: p.officialName, verifyStatus: status })
  const id = newId('pcon')
  await db
    .insert(schema.prospectContact)
    .values({
      id, prospectId, email: parsed.email, name: input.name?.trim() || (role === 'owner' ? p.officialName : null),
      role, source: 'manual', verifyStatus: status, verifyReason: reason, verifiedAt: new Date(), rank, isPrimary: 0,
    })
    .onConflictDoUpdate({
      target: [schema.prospectContact.prospectId, schema.prospectContact.email],
      set: { source: 'manual', role, verifyStatus: status, verifyReason: reason, verifiedAt: new Date(), rank, updatedAt: new Date(), ...(input.name?.trim() ? { name: input.name.trim() } : {}) },
    })
  const [row] = await db
    .select({ id: schema.prospectContact.id })
    .from(schema.prospectContact)
    .where(and(eq(schema.prospectContact.prospectId, prospectId), eq(schema.prospectContact.email, parsed.email)))
    .limit(1)
  await setPrimaryContact(prospectId, row?.id ?? id)
  return { ok: true, contactId: row?.id ?? id }
}

/** Pin a contact as the send target (human override — sticky). */
export async function setPrimaryContact(prospectId: string, contactId: string): Promise<{ ok: boolean }> {
  const [c] = await db
    .select()
    .from(schema.prospectContact)
    .where(and(eq(schema.prospectContact.id, contactId), eq(schema.prospectContact.prospectId, prospectId)))
    .limit(1)
  if (!c) return { ok: false }
  await db
    .update(schema.prospectContact)
    .set({ isPrimary: 0, updatedAt: new Date() })
    .where(eq(schema.prospectContact.prospectId, prospectId))
  await db
    .update(schema.prospectContact)
    .set({ isPrimary: 1, updatedAt: new Date() })
    .where(eq(schema.prospectContact.id, contactId))
  await db
    .update(schema.prospect)
    .set({ email: c.email, emailSource: 'manual', updatedAt: new Date() })
    .where(eq(schema.prospect.id, prospectId))
  return { ok: true }
}

export async function deleteProspectContact(prospectId: string, contactId: string): Promise<{ ok: boolean }> {
  await db
    .delete(schema.prospectContact)
    .where(and(eq(schema.prospectContact.id, contactId), eq(schema.prospectContact.prospectId, prospectId)))
  // If we removed the pinned address, drop the manual pin so re-pick is free.
  const [p] = await db
    .select({ email: schema.prospect.email, emailSource: schema.prospect.emailSource })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  if (p?.emailSource === 'manual') {
    const [still] = await db
      .select({ id: schema.prospectContact.id })
      .from(schema.prospectContact)
      .where(and(eq(schema.prospectContact.prospectId, prospectId), eq(schema.prospectContact.email, p.email ?? '')))
      .limit(1)
    if (!still) {
      await db
        .update(schema.prospect)
        .set({ emailSource: 'crawl_mailto', updatedAt: new Date() })
        .where(eq(schema.prospect.id, prospectId))
    }
  }
  await resyncPrimary(prospectId)
  return { ok: true }
}

/**
 * Self-heal: backfill prospect_contact for prospects enriched BEFORE this
 * layer existed. Picks the enriched-forward prospects that have at least one
 * candidate address (a stored email or crawled enrichment.emails) but no
 * contact rows yet, and syncs them from stored data — no re-crawl, just the
 * MX check. Bounded per run; convergent (every selected prospect gains ≥1
 * row, so it won't be re-selected). Called by the enrich cron.
 */
export async function backfillProspectContacts(limit = 25): Promise<{ scanned: number; synced: number }> {
  const rows = await db
    .select({
      id: schema.prospect.id,
      authorizedOfficialName: schema.prospect.authorizedOfficialName,
      email: schema.prospect.email,
      emailSource: schema.prospect.emailSource,
      enrichment: schema.prospect.enrichment,
    })
    .from(schema.prospect)
    .where(
      and(
        inArray(schema.prospect.status, ['enriched', 'contacted', 'engaged', 'call_list']),
        sql`(${schema.prospect.email} IS NOT NULL OR (${schema.prospect.enrichment} ? 'emails' AND jsonb_array_length(${schema.prospect.enrichment} -> 'emails') > 0))`,
        sql`NOT EXISTS (SELECT 1 FROM ${schema.prospectContact} pc WHERE pc.prospect_id = ${schema.prospect.id})`,
      ),
    )
    .orderBy(desc(schema.prospect.opportunityScore))
    .limit(limit)

  let synced = 0
  for (const p of rows) {
    const enrichment = p.enrichment as { emails?: unknown } | null
    const emails = Array.isArray(enrichment?.emails) ? (enrichment!.emails as string[]) : []
    try {
      await syncProspectContacts(
        { id: p.id, authorizedOfficialName: p.authorizedOfficialName, email: p.email, emailSource: p.emailSource },
        emails,
      )
      synced++
    } catch (err) {
      console.warn('[prospect-contacts] backfill failed', p.id, err instanceof Error ? err.message : err)
    }
  }
  return { scanned: rows.length, synced }
}

/** Re-verify a prospect's existing contacts (the drawer's ↻). */
export async function reverifyProspectContacts(prospectId: string): Promise<{ verified: number }> {
  const contacts = await db
    .select()
    .from(schema.prospectContact)
    .where(eq(schema.prospectContact.prospectId, prospectId))
  const mxCache = new Map<string, 'has' | 'none' | 'error'>()
  const [p] = await db
    .select({ officialName: schema.prospect.authorizedOfficialName })
    .from(schema.prospect)
    .where(eq(schema.prospect.id, prospectId))
    .limit(1)
  let verified = 0
  for (const c of contacts) {
    const { status, reason } = await verifyEmail(c.email, mxCache)
    const rank = rankContactEmail({ email: c.email, personName: p?.officialName, verifyStatus: status })
    await db
      .update(schema.prospectContact)
      .set({ verifyStatus: status, verifyReason: reason, verifiedAt: new Date(), rank, updatedAt: new Date() })
      .where(eq(schema.prospectContact.id, c.id))
    verified++
  }
  await resyncPrimary(prospectId)
  return { verified }
}
