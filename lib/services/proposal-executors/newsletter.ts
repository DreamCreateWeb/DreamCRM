import 'server-only'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { ExecResult } from '@/lib/services/proposals'
import { composeNewsletter, createNewsletterDraft } from '@/lib/services/newsletter'

/**
 * NEWSLETTER's yes (ML-36). The yes creates the DRAFT campaign in the
 * composer and NOTHING ELSE — it never sends (the newsletter law: an issue
 * never leaves without a human look; the capability is not grantable, so the
 * yes is always a person's). The send goes through the normal campaign
 * protocol from the composer, consent spine and all.
 *
 * Laws inherited (lib/services/proposal-executors/README.md):
 *  - live staleness at the tap: the posts are re-read org-scoped and
 *    published-only; an issue whose posts were all unpublished since the card
 *    was filed retires rather than drafting an empty newsletter;
 *  - the edited text is what executes: an untouched body drafts the styled
 *    issue the one-click button builds (same composer), an edited body drafts
 *    the edited words through the campaign HTML shell;
 *  - ONE draft per proposal: the campaign id is stamped into the payload, so a
 *    retry after a half-finished approve never mints a second draft;
 *  - narrate ONCE under `newsletter`: the ledger line is this return.
 */

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function executeNewsletter(
  p: typeof schema.proposal.$inferSelect,
  payload: Record<string, unknown>,
  saidYes: string,
): Promise<ExecResult> {
  const campaignId = typeof payload.campaignId === 'number' ? payload.campaignId : null
  if (campaignId != null) {
    return {
      ok: true,
      ledgerSummary: `Drafted the monthly newsletter in your campaigns — nothing goes out until you send it ${saidYes}`,
      ledgerDetail: { campaignId },
    }
  }

  const postIds = Array.isArray(payload.postIds)
    ? (payload.postIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : []
  if (postIds.length === 0) return { ok: false, error: 'This proposal is missing its posts.', expired: true }

  const rows = await db
    .select()
    .from(schema.blogPost)
    .where(
      and(
        eq(schema.blogPost.organizationId, p.organizationId),
        inArray(schema.blogPost.id, postIds),
        eq(schema.blogPost.status, 'published'),
        isNull(schema.blogPost.archivedAt),
      ),
    )
  const order = new Map(postIds.map((id, i) => [id, i] as const))
  const posts = rows.slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  if (posts.length === 0) {
    return {
      ok: false,
      error: 'The posts this newsletter was built from aren’t published any more — I tossed it. Next month’s will use what’s live.',
      expired: true,
    }
  }

  const { getClinicTimeZone } = await import('@/lib/services/clinic-timezone')
  const timeZone = await getClinicTimeZone(p.organizationId).catch(() => null)
  const issue = await composeNewsletter(p.organizationId, posts, { now: new Date(), timeZone })
  if (!issue) return { ok: false, error: 'I couldn’t find your clinic to build the newsletter — try again in a minute.' }

  const edited = typeof payload.originalBody === 'string' ? payload.originalBody.trim() !== p.body.trim() : false
  let bodyHtml = issue.bodyHtml
  if (edited) {
    // Circular at module level (proposals.ts imports this file) — resolved at call time.
    const { textToCampaignHtml } = await import('@/lib/services/proposals')
    bodyHtml = textToCampaignHtml(p.body)
  }

  const id = await createNewsletterDraft(p.organizationId, p.decidedByUserId ?? null, {
    name: str(payload.name) ?? issue.name,
    subject: str(payload.subject) ?? issue.subject,
    previewText: issue.previewText,
    bodyHtml,
  })

  // Stamp the draft BEFORE returning so a retry never drafts twice. Best-effort:
  // a failed stamp costs at worst a second draft nobody sent.
  try {
    await db
      .update(schema.proposal)
      .set({ payload: { ...payload, campaignId: id } })
      .where(and(eq(schema.proposal.id, p.id), eq(schema.proposal.organizationId, p.organizationId)))
  } catch (e) {
    console.warn('[proposals] newsletter: could not stamp the draft id', e)
  }

  return {
    ok: true,
    ledgerSummary: `Drafted the monthly newsletter in your campaigns — nothing goes out until you send it ${saidYes}`,
    ledgerDetail: { campaignId: id, postIds: posts.map((x) => x.id) },
  }
}
