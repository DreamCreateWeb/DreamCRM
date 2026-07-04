import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import {
  buildCopilotPrompt,
  parseCopilotResponse,
  resolveNamedProspect,
  COPILOT_ACTION_KINDS,
  type CopilotResponse,
  type CopilotSnapshot,
} from '@/lib/prospect-copilot'
import { summarizeLearnings } from '@/lib/prospect-learnings'
import { rankTerritories } from '@/lib/prospect-territory'
import { LOSS_REASON_LABELS, type ProspectLossReason } from '@/lib/types/prospecting'
import {
  getProspectingConfig,
  getFunnelStats,
  getHuntStats,
  getBandCounts,
  getWinLossReport,
  getTerritoryCoverage,
  bumpProspectingCounter,
  counterMonth,
} from './prospecting'
import { getDailyBriefing } from './prospecting-briefing'

/**
 * The hunt copilot — one haiku call over a grounded snapshot of the whole
 * prospecting engine. It ANSWERS (never mutates): the returned actions are
 * suggestions the owner clicks in the UI. Budget-metered like every other
 * prospecting AI surface; a failure degrades to a plain honest message rather
 * than throwing into the command bar.
 */

async function buildSnapshot(
  query: string,
): Promise<{ snapshot: CopilotSnapshot; matched: { id: string; name: string } | null }> {
  const config = await getProspectingConfig()
  const [funnel, hunt, bands, briefing, winLoss, territory] = await Promise.all([
    getFunnelStats(),
    getHuntStats(),
    getBandCounts(),
    getDailyBriefing(),
    getWinLossReport(),
    getTerritoryCoverage(config.enabledStates),
  ])

  const senderConfigured = Boolean(process.env.OUTREACH_EMAIL_FROM?.trim())
  const gmailConfigured = Boolean(process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim())
  const placesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())

  // Best-converting segment with a real denominator.
  const rankedSegments = winLoss.segments
    .filter((s) => s.winRatePct != null && s.won + s.lost >= 3)
    .sort((a, b) => (b.winRatePct ?? 0) - (a.winRatePct ?? 0))
  const bestSegment =
    rankedSegments[0] && rankedSegments[0].winRatePct != null
      ? { label: rankedSegments[0].label, winRatePct: rankedSegments[0].winRatePct }
      : null
  const topLoss = winLoss.lossReasons[0]?.reason ?? null

  const topTerritories = rankTerritories(territory)
    .filter((t) => t.total > 0)
    .slice(0, 5)
    .map((t) => ({ state: t.state, total: t.total, hot: t.hot, workedPct: t.workedPct }))

  // Resolve a named prospect against the bounded active set.
  const candidates = [
    ...briefing.callFirst.map((c) => ({
      id: c.id,
      name: c.name,
      state: c.state,
      status: 'call_list',
      scoreBand: c.scoreBand,
      summary: c.intentSummary,
      phone: c.phone,
      hasReplyDraft: Boolean(c.replyDraft),
    })),
    ...hunt.hottest.map((h) => ({
      id: h.id,
      name: h.name,
      state: null as string | null,
      status: h.status,
      scoreBand: null as string | null,
      summary: h.intentSummary,
      phone: null as string | null,
      hasReplyDraft: false,
    })),
    ...briefing.phoneQueueTop.map((p) => ({
      id: p.id,
      name: p.name,
      state: p.state,
      status: 'phone_queue',
      scoreBand: p.scoreBand ?? null,
      summary: null as string | null,
      phone: p.phone,
      hasReplyDraft: false,
    })),
  ]
  // De-dupe by id (a prospect can appear on more than one list).
  const seenIds = new Set<string>()
  const uniqueCandidates = candidates.filter((c) => {
    if (seenIds.has(c.id)) return false
    seenIds.add(c.id)
    return true
  })
  const hit = resolveNamedProspect(query, uniqueCandidates)
  let matched: CopilotSnapshot['matched'] = null
  let matchedRef: { id: string; name: string } | null = null
  if (hit) {
    matchedRef = { id: hit.id, name: hit.name }
    // One tiny lookup for whether a demo brief is cached (not on the list rows).
    const [row] = await db
      .select({ demoBrief: schema.prospect.demoBrief })
      .from(schema.prospect)
      .where(eq(schema.prospect.id, hit.id))
      .limit(1)
    matched = {
      name: hit.name,
      state: hit.state,
      status: hit.status,
      scoreBand: hit.scoreBand,
      summary: hit.summary,
      phone: hit.phone,
      hasDemoBrief: Boolean(row?.demoBrief),
      hasReplyDraft: hit.hasReplyDraft,
    }
  }

  const learnings = summarizeLearnings(winLoss)

  const snapshot: CopilotSnapshot = {
    engine: {
      killSwitch: config.killSwitch,
      dryRun: config.dryRun,
      hunter: config.autoEnroll.enabled,
      watchdogTripped: Boolean(config.watchdog.trippedAt),
      bookingEnabled: config.booking.enabled,
      enabledStates: config.enabledStates,
    },
    wiring: { senderConfigured, gmailConfigured, placesConfigured },
    funnel,
    bands: {
      hot: bands.hot ?? 0,
      warm: bands.warm ?? 0,
      cool: bands.cool ?? 0,
      low: bands.low ?? 0,
    },
    last24h: {
      sent: hunt.sent24h,
      dryRun: hunt.dryRun24h,
      opens: hunt.opens24h,
      clicks: hunt.clicks24h,
      replies: hunt.replies24h,
      newCallList: hunt.newCallList24h,
      autoEnrolled: hunt.autoEnrolledToday,
    },
    nextAction: briefing.nextAction.headline,
    callFirst: briefing.callFirst.map((c) => ({
      name: c.name,
      state: c.state,
      summary: c.intentSummary,
      phone: c.phone,
    })),
    todaysDemos: briefing.todaysDemos.map((d) => ({ name: d.name, when: d.when })),
    brainCustomized: config.brain.productOverride.trim().length > 0,
    battleCards: config.brain.battleCards.length,
    winLoss: {
      won: winLoss.won,
      lost: winLoss.lost,
      winRatePct: winLoss.winRatePct,
      topLossReason: topLoss ? LOSS_REASON_LABELS[topLoss as ProspectLossReason] : null,
      bestSegment,
      learnings,
    },
    territory: { focusState: config.focus.state, top: topTerritories },
    matched,
  }
  return { snapshot, matched: matchedRef }
}

const FALLBACK: CopilotResponse = {
  answer:
    "I couldn't reach the AI just now. Your hunt is still running — open the daily briefing for the current state, or check settings for the safety rails.",
  actions: [
    { kind: 'open_briefing', label: 'See the daily briefing' },
    { kind: 'open_settings', label: 'Open prospecting settings' },
  ],
}

export async function runCopilot(query: string): Promise<CopilotResponse> {
  const q = query.trim()
  if (q.length === 0) {
    return {
      answer: 'Ask me anything about the hunt — who to call, whether we’re live, how today’s going.',
      actions: [],
    }
  }
  if (!aiConfigured()) return FALLBACK

  const { snapshot, matched } = await buildSnapshot(q)
  const { system, user } = buildCopilotPrompt(snapshot, q)

  try {
    const raw = await runClaudeJson({
      model: 'haiku',
      maxTokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
      toolName: 'answer_hunt_question',
      toolDescription: 'Answer the owner and suggest any fitting actions.',
      inputSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string', maxLength: 1500, description: 'The grounded answer, 2-4 sentences.' },
          actions: {
            type: 'array',
            maxItems: 3,
            description: 'Up to 3 fitting actions from the allowed kinds; omit if none fit.',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: COPILOT_ACTION_KINDS },
                label: { type: 'string', maxLength: 60 },
              },
              required: ['kind'],
            },
          },
        },
        required: ['answer'],
      },
    })
    const parsed = parseCopilotResponse(raw)
    if (!parsed) return { ...FALLBACK, matched }
    await bumpProspectingCounter(counterMonth(), 'ai_copilot')
    return { ...parsed, matched }
  } catch (err) {
    console.warn('[prospect-copilot] failed', err instanceof Error ? err.message : err)
    return FALLBACK
  }
}
