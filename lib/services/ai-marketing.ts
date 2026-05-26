import 'server-only'
import { runClaudeText, aiConfigured } from '@/lib/ai'
import { z } from 'zod'
import type { TenantType } from '@/lib/inbox-terminology'

/**
 * AI assist for marketing campaigns. Two surfaces:
 *
 * - `draftCampaign(brief, tenantType)` — Sonnet writes a fresh campaign
 *   (subject + preview text + HTML body) from a short brief. Adaptive
 *   thinking; streamed so the SDK doesn't time out on longer drafts.
 *
 * - `improveCopy(html, instruction, tenantType)` — Sonnet rewrites a
 *   selected paragraph or block of HTML to apply an instruction like
 *   "make it punchier", "add urgency", "shorten by half". Returns
 *   replacement HTML.
 *
 * Both swallow their own errors and return null so the editor can show
 * "AI unavailable" without breaking. Tone is tenant-aware: platform =
 * B2B SaaS, talking to dental clinic owners; clinic = healthcare
 * provider, talking to patients.
 */

const PLATFORM_VOICE = `You write marketing emails for Dream Create, a small SaaS that sells DreamCRM (a multi-tenant practice management platform) to dental clinics. The audience is dental clinic owners and office managers — busy small-business people who want patient management, scheduling, billing, recall, and a public website without juggling five tools.

Voice: warm, confident, practical. Sentences short. Plain words. No exclamation marks. No marketing-bro hype. Lead with the problem before the product. Avoid words like "leverage", "synergy", "revolutionary", "game-changing", "supercharge", "10x", "next-level". Avoid all-caps subject lines. Avoid emoji unless the brief explicitly asks for one.`

const CLINIC_VOICE = `You write recall, newsletter, and patient-outreach emails for a dental clinic. The audience is the clinic's patients — adults of all ages, generally trusting but not technical, who want clear scheduling info and gentle, non-pushy reminders.

Voice: warm, professional, calm. Sentences short. Plain words. Avoid medical jargon unless necessary. Always include a clear next-step (book, call, reply). No exclamation marks unless absolutely warranted. No emoji unless the brief explicitly asks. Never include PHI in the email body — refer to "your upcoming visit" or "your cleaning" generically.`

function voiceFor(tenantType: TenantType): string {
  return tenantType === 'platform' ? PLATFORM_VOICE : CLINIC_VOICE
}

// ============================================================
// Draft from a brief
// ============================================================

const DraftOutputSchema = z.object({
  subject: z.string().min(1).max(200),
  previewText: z.string().max(200),
  bodyHtml: z.string().min(1).max(40_000),
})

export type DraftedCampaign = z.infer<typeof DraftOutputSchema>

const DRAFT_SYSTEM = (tenantType: TenantType) => `${voiceFor(tenantType)}

You produce a single marketing email as JSON. Three fields:

1. "subject" — the inbox subject line. Plain text, no quotes, under 80 chars, ideally 30-60. No leading "RE:" or "FWD:". Should not look like a sales blast.
2. "previewText" — the preheader (the second line preview Gmail shows next to the subject). Plain text, under 130 chars. Continues the subject; do not repeat it.
3. "bodyHtml" — the email body as semantic HTML. Use <p>, <h2>, <h3>, <ul>/<li>, <strong>, <em>, <a href="...">. No <style>, no inline styles, no <table>, no class= attributes. Start with a personal opener (no "Dear Sir/Madam" — use "Hi" or "Hello"). End with a clear single call-to-action as a link, and a short sign-off. Don't include the unsubscribe link; the system appends that automatically.

OUTPUT FORMAT — respond with ONLY a single JSON object, nothing else, no markdown fence, no preamble:
{"subject": "...", "previewText": "...", "bodyHtml": "<p>...</p>"}`

export async function draftCampaign(brief: string, tenantType: TenantType): Promise<DraftedCampaign | null> {
  if (!aiConfigured()) return null
  if (!brief.trim()) return null

  try {
    const out = await runClaudeText({
      model: 'sonnet',
      maxTokens: 3000,
      thinking: true,
      system: DRAFT_SYSTEM(tenantType),
      messages: [{ role: 'user', content: `Write the campaign described below. Output JSON only.\n\n<brief>\n${brief.slice(0, 4000)}\n</brief>` }],
    })
    if (!out) return null
    const raw = out.trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const parsed = JSON.parse(raw.slice(start, end + 1))
    return DraftOutputSchema.parse(parsed)
  } catch (err) {
    console.warn('[ai.marketing.draft] failed:', (err as Error).message)
    return null
  }
}

// ============================================================
// Improve / rewrite an existing block
// ============================================================

const IMPROVE_SYSTEM = (tenantType: TenantType) => `${voiceFor(tenantType)}

You rewrite a fragment of HTML email body to apply an instruction from the author. The instruction will be plain English like "make it punchier", "shorten by half", "add urgency", "more casual".

RULES:
- Output ONLY the rewritten HTML. No commentary, no preamble, no markdown fence, no JSON.
- Preserve the HTML structure: if the input is a <p>, output a <p>. If it's two <p>s, output two <p>s.
- Allowed tags: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <a href="...">. No <style>, no inline styles, no class= attributes.
- If the input contains a link, keep the href. You may change the link text.
- Never invent facts that aren't in the input.
- If the instruction is unsafe or asks for something off-brand, return the input unchanged.`

export async function improveCopy(html: string, instruction: string, tenantType: TenantType): Promise<string | null> {
  if (!aiConfigured()) return null
  if (!html.trim() || !instruction.trim()) return null

  try {
    const out = await runClaudeText({
      model: 'sonnet',
      maxTokens: 2000,
      thinking: true,
      system: IMPROVE_SYSTEM(tenantType),
      messages: [
        {
          role: 'user',
          content: `Instruction: ${instruction.slice(0, 400)}\n\nRewrite this HTML fragment accordingly. Output only the new HTML.\n\n<fragment>\n${html.slice(0, 12_000)}\n</fragment>`,
        },
      ],
    })
    return out ? out.trim() : null
  } catch (err) {
    console.warn('[ai.marketing.improve] failed:', (err as Error).message)
    return null
  }
}
