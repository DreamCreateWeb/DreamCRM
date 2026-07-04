import 'server-only'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import {
  buildCopilotPrompt,
  parseCopilotResponse,
  COPILOT_ACTION_KINDS,
  type CopilotResponse,
  type CopilotSnapshot,
} from '@/lib/prospect-copilot'
import {
  getProspectingConfig,
  getFunnelStats,
  getHuntStats,
  getBandCounts,
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

async function buildSnapshot(): Promise<CopilotSnapshot> {
  const [config, funnel, hunt, bands, briefing] = await Promise.all([
    getProspectingConfig(),
    getFunnelStats(),
    getHuntStats(),
    getBandCounts(),
    getDailyBriefing(),
  ])

  const senderConfigured = Boolean(process.env.OUTREACH_EMAIL_FROM?.trim())
  const gmailConfigured = Boolean(process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim())
  const placesConfigured = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())

  return {
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
  }
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

  const snapshot = await buildSnapshot()
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
    if (!parsed) return FALLBACK
    await bumpProspectingCounter(counterMonth(), 'ai_copilot')
    return parsed
  } catch (err) {
    console.warn('[prospect-copilot] failed', err instanceof Error ? err.message : err)
    return FALLBACK
  }
}
