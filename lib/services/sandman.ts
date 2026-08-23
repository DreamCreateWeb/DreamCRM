import 'server-only'

/**
 * SANDMAN's server half (docs/ai-operations.md, D5) — the chief of staff's
 * one AI call over a grounded snapshot of the practice's own numbers.
 *
 * THREE LAWS, inherited and enforced here:
 *  1. AGGREGATES ONLY. Every read below returns counts and rates. No patient
 *     row, name, email, or visit ever enters the prompt (the shared brain's
 *     privacy line; the Bedrock/BAA question stays untouched by this).
 *  2. NEVER EXECUTES. The response's actions are NAVIGATIONS from a closed
 *     registry; nothing here sends, posts, or grants autonomy.
 *  3. BEST-EFFORT. Every read is individually caught — an answer built from
 *     the numbers we could get beats an error page, and the snapshot marks
 *     what it could not see rather than reporting a zero it didn't measure.
 */

import { and, count, eq, gte, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { bumpAiUsage, getAiUsageCount } from '@/lib/services/ai-usage'
import {
  buildSandmanPrompt,
  parseSandmanResponse,
  SANDMAN_ACTION_KINDS,
  SANDMAN_REQUEST_KINDS,
  type SandmanResponse,
  type SandmanSnapshot,
} from '@/lib/sandman'

/** Monthly cap — Sandman is a conversation, so it needs room, but not an
 *  unbounded one. Shares the org's ai_usage_counter with every other AI. */
export const SANDMAN_KIND = 'sandman_chat'
export const SANDMAN_MONTHLY_CAP = 300

const FALLBACK: SandmanResponse = {
  answer:
    'I can’t reach my read of your numbers right now. Try again in a moment — nothing is wrong with your practice’s data.',
  actions: [],
  requests: [],
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch {
    return fallback
  }
}

async function buildSnapshot(organizationId: string, clinicName: string): Promise<SandmanSnapshot> {
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const gaps: string[] = []

  const [
    overview,
    perWeek,
    recall,
    googleReviews,
    postCounts,
    articles30d,
    queued,
    standup,
    grants,
    waiting,
    channels,
  ] = await Promise.all([
    safe(import('./clinic-overview').then((m) => m.getClinicOverview(organizationId)), null),
    safe(import('./patients').then((m) => m.getNewPatientsPerWeek12(organizationId, now)), []),
    safe(import('./recall-stats').then((m) => m.getRecallStats(organizationId)), null),
    safe(import('./google-reviews').then((m) => m.getGoogleReviewStats(organizationId)), null),
    safe(import('./social-posts').then((m) => m.getPublishedPostCounts(organizationId, { days: 30 })), {}),
    safe(
      db
        .select({ n: count() })
        .from(schema.blogPost)
        .where(
          and(
            eq(schema.blogPost.organizationId, organizationId),
            eq(schema.blogPost.status, 'published'),
            isNull(schema.blogPost.archivedAt),
            gte(schema.blogPost.publishedAt, since30),
          ),
        )
        .then((r) => r[0]?.n ?? 0),
      0,
    ),
    safe(import('./dream-team').then((m) => m.countRunway(organizationId, now)), 0),
    safe(import('./standup').then((m) => m.buildWeeklyStandup(organizationId)), null),
    safe(import('./autonomy').then((m) => m.listTrustGrants(organizationId)), []),
    safe(import('./proposals').then((m) => m.countOpenProposals(organizationId)), 0),
    safe(import('./social-posts').then((m) => m.hasAnyChannelConnected(organizationId)), false),
  ])

  // New patients this month vs the same point last month — the overview
  // already computes both against clinic-local month boundaries.
  const newPatients = {
    thisMonth: overview?.trends.newPatientsMTD ?? 0,
    lastMonth: overview?.trends.newPatientsLastMTD ?? 0,
    perWeek12: perWeek.map((p) => p.value),
  }

  const posts30d = Object.values(postCounts).reduce((sum, n) => sum + n, 0)
  if (!channels) gaps.push('No social channel is connected, so nothing can post.')
  if (!googleReviews || googleReviews.count === 0) {
    gaps.push('No Google reviews are syncing yet — the rating and review counts may be blank.')
  }
  if (!overview) gaps.push('Today’s schedule numbers could not be read on this attempt.')
  if (!recall) gaps.push('The recall funnel could not be read on this attempt.')

  // Untouched inquiries — a count, computed in the database.
  const untouchedLeads = await safe(
    db
      .select({ n: count() })
      .from(schema.lead)
      .where(
        and(
          eq(schema.lead.organizationId, organizationId),
          eq(schema.lead.status, 'new'),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    0,
  )

  return {
    clinicName,
    newPatients,
    schedule: {
      todayBooked: overview?.trends.bookingsToday ?? 0,
      upcomingNext7d: overview?.trends.upcomingNext7d ?? 0,
      unconfirmedNext48h: overview?.unconfirmed.count ?? 0,
      openChairsNext7d: null,
    },
    recall: {
      dueReachable: recall?.recallDueReachableCount ?? 0,
      sentLast30d: recall?.sentThisMonthCount ?? 0,
      openedLast30d: recall?.openRate30d != null ? recall.openRate30d : 0,
      bookedBackLast30d: recall?.bookedFromRecallCount ?? 0,
    },
    reviews: {
      rating: googleReviews?.averageRating ?? null,
      total: googleReviews?.count ?? 0,
      received30d: overview?.reviewsReceived.completed30d ?? 0,
      needingReply: googleReviews?.needsReply ?? 0,
    },
    content: { posts30d, articles30d, queued },
    inquiries: { new30d: overview?.newLeads.count ?? 0, untouched: untouchedLeads },
    lastWeek: (standup?.lines ?? []).map((l) => ({ noun: l.noun, count: l.count })),
    waiting,
    autoLanes: grants.filter((g) => g.level === 'auto').map((g) => g.label),
    gaps,
  }
}

export interface SandmanTurn {
  role: 'user' | 'assistant'
  content: string
}

export async function askSandman(
  organizationId: string,
  clinicName: string,
  query: string,
  history: SandmanTurn[] = [],
): Promise<SandmanResponse> {
  const q = query.trim()
  if (q.length === 0) {
    return {
      answer: 'Ask me anything about the practice — how the month is going, why a number moved, what to do next.',
      actions: [],
      requests: [],
    }
  }
  if (!aiConfigured()) {
    return {
      answer:
        'My writing brain isn’t switched on for this practice yet, so I can’t talk things through. Everything else the team does still runs.',
      actions: [{ kind: 'open_integrations', label: 'Open integrations' }],
      requests: [],
    }
  }
  if (await safe(getAiUsageCount(organizationId, SANDMAN_KIND).then((n) => n >= SANDMAN_MONTHLY_CAP), false)) {
    return {
      answer:
        'We’ve talked a lot this month — I’m at my limit for conversations until it resets. The team keeps working in the meantime.',
      actions: [{ kind: 'open_dream_team', label: 'See what’s waiting' }],
      requests: [],
    }
  }

  const snapshot = await buildSnapshot(organizationId, clinicName)
  const { system, messages } = buildSandmanPrompt(snapshot, q, history)

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 700,
      system,
      messages,
      toolName: 'answer_practice_question',
      toolDescription: 'Answer the practice’s question and suggest where to look.',
      inputSchema: {
        type: 'object',
        properties: {
          answer: {
            type: 'string',
            maxLength: 1500,
            description: 'The grounded answer, 2-4 sentences, warm and plain.',
          },
          actions: {
            type: 'array',
            maxItems: 3,
            description: 'Up to 3 fitting places to look; omit if none fit.',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: SANDMAN_ACTION_KINDS },
                label: { type: 'string', maxLength: 60 },
              },
              required: ['kind'],
            },
          },
          // REQUESTS (D8): the model may only NAME a generator — there is
          // no content, audience, or recipient field for a bad answer to
          // fill in, and everything a generator produces still needs a
          // human yes.
          requests: {
            type: 'array',
            maxItems: 2,
            description:
              'Up to 2 pieces of work to offer to draft; omit unless they are asking for more of something.',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: SANDMAN_REQUEST_KINDS },
              },
              required: ['kind'],
            },
          },
        },
        required: ['answer'],
      },
    })
    const parsed = parseSandmanResponse(raw)
    if (!parsed) return FALLBACK
    await safe(bumpAiUsage(organizationId, SANDMAN_KIND), undefined)
    return parsed
  } catch (err) {
    console.warn('[sandman] failed', err instanceof Error ? err.message : err)
    return FALLBACK
  }
}

/** Exported for tests — the snapshot must never carry a patient identity. */
export const __testables = { buildSnapshot, sql }
