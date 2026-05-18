import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { InboxPatientContext } from '@/lib/types/patient-context'
import { EMAIL_INTENTS, type EmailIntent } from '@/lib/db/schema/email'

/**
 * AI-mailbox: Haiku for cheap intent classification on every incoming
 * email, Sonnet for higher-quality drafted replies that fold in patient
 * context. Both functions are best-effort — they swallow their own
 * errors and return null so the calling path (ingest, UI) never blocks
 * on AI availability.
 */

const VALID_INTENTS = new Set<string>(EMAIL_INTENTS)

function getClient(): Anthropic | null {
  // Lazy-construct so the module can be imported during `next build` even
  // when the env var isn't set (e.g. preview deploys without the key).
  if (!process.env.ANTHROPIC_API_KEY) return null
  return new Anthropic()
}

// ============================================================
// Intent classification (Haiku 4.5)
// ============================================================

const INTENT_SYSTEM = `You classify incoming emails received by a dental clinic's front-desk inbox into one of these buckets:

- booking: patient wants to schedule, reschedule, confirm, or cancel an appointment
- insurance: questions about coverage, claims, eligibility, in-network status
- billing: bills, payments, statements, invoices, fees
- records: requests for x-rays, charts, prescriptions, medical records, referrals
- marketing: vendor pitches, software/product promotions, newsletters, cold outreach
- follow_up: general patient inquiry that needs a response from the practice (not in another bucket)
- other: notifications, automated emails, internal mail, anything that doesn't fit

Respond with ONLY one word — the bucket name. No punctuation, no explanation.`

interface IntentInput {
  fromEmail: string
  subject: string | null
  bodyText: string | null
  snippet: string | null
}

export async function classifyIntent(args: IntentInput): Promise<EmailIntent | null> {
  const client = getClient()
  if (!client) return null

  // Truncate body to keep latency + cost predictable — the first ~1500 chars
  // are nearly always enough to identify intent for dental clinic mail.
  const body = (args.bodyText ?? args.snippet ?? '').slice(0, 1500)
  const userText = `From: ${args.fromEmail}\nSubject: ${args.subject ?? '(no subject)'}\n\n${body}`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 16,
      system: INTENT_SYSTEM,
      messages: [{ role: 'user', content: userText }],
    })
    const block = response.content.find((b) => b.type === 'text')
    const text = block && block.type === 'text' ? block.text.trim().toLowerCase() : ''
    if (VALID_INTENTS.has(text)) return text as EmailIntent
    return 'other'
  } catch (err) {
    console.warn('[ai] classifyIntent failed', err)
    return null
  }
}

// ============================================================
// Reply drafting (Sonnet 4.6 + adaptive thinking)
// ============================================================

const REPLY_SYSTEM = `You draft reply emails on behalf of a dental clinic's front-desk admin. Your output goes directly into the admin's reply textarea; they review and may edit before sending.

Tone: warm, professional, concise. Address the writer by first name when known. Match the formality of the incoming email — casual gets casual, formal gets formal.

Output rules:
- Plain text only — no markdown, no bullet lists unless the original was a list of questions to answer
- Two to three short paragraphs maximum
- Start with a one-line greeting (e.g. "Hi Lisa,")
- End with a clear next step or question, never "Looking forward to hearing from you"
- Do NOT add a signature, sign-off line ("Best", "Thanks", etc.), or the staff member's name — they add their own

Patient context handling:
- If a patient record is provided, weave in genuinely relevant details naturally — e.g. "I see you have a cleaning scheduled for May 21st" or "I noticed it's been a while since your last visit"
- Don't recite all the fields verbatim; only mention what the original email asks about or what the patient would expect us to know

Constraints — defer to staff for anything you can't verify:
- Do NOT commit to specific appointment times unless the original email proposes one and patient_context confirms availability
- Do NOT quote prices, copays, or fees
- Do NOT promise insurance coverage decisions
- When in doubt, offer to have a staff member follow up`

interface DraftReplyInput {
  patientContext: InboxPatientContext | null
  originalSubject: string | null
  originalBody: string
  fromName: string | null
  fromEmail: string
}

export async function draftReply(args: DraftReplyInput): Promise<string | null> {
  const client = getClient()
  if (!client) return null

  const ctx = args.patientContext
  const contextBlock = ctx
    ? `<patient_record>
name: ${ctx.patient.firstName} ${ctx.patient.lastName}
${ctx.patient.dateOfBirth ? `date_of_birth: ${ctx.patient.dateOfBirth}\n` : ''}${ctx.patient.phone ? `phone: ${ctx.patient.phone}\n` : ''}${ctx.patient.insuranceProvider ? `insurance: ${ctx.patient.insuranceProvider}\n` : ''}total_visits: ${ctx.appointmentCount}
${ctx.nextAppointment ? `next_appointment: ${ctx.nextAppointment.startTime.toISOString()} (${ctx.nextAppointment.type}, ${ctx.nextAppointment.status})` : 'next_appointment: none scheduled'}
${ctx.lastAppointment && new Date(ctx.lastAppointment.startTime) < new Date() ? `last_visit: ${ctx.lastAppointment.startTime.toISOString()} (${ctx.lastAppointment.type})` : 'last_visit: none on record'}
${ctx.patient.notes ? `notes: ${ctx.patient.notes}` : ''}
</patient_record>`
    : '<patient_record>This sender is NOT in our patient records.</patient_record>'

  const userText = `${contextBlock}

<incoming_email>
From: ${args.fromName ? `${args.fromName} <${args.fromEmail}>` : args.fromEmail}
Subject: ${args.originalSubject ?? '(no subject)'}

${args.originalBody.slice(0, 6000)}
</incoming_email>

Draft a reply now. Output only the email body — no preamble, no explanation.`

  try {
    // Stream internally to avoid SDK HTTP timeouts on slow generations;
    // collect into a single string before returning. Adaptive thinking
    // lets the model dial up reasoning when patient context makes the
    // reply non-trivial.
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system: REPLY_SYSTEM,
      messages: [{ role: 'user', content: userText }],
    })
    const final = await stream.finalMessage()
    const block = final.content.find((b) => b.type === 'text')
    if (block && block.type === 'text') return block.text.trim()
    return null
  } catch (err) {
    console.warn('[ai] draftReply failed', err)
    return null
  }
}

// ============================================================
// Batched intent backfill
// ============================================================

/**
 * Classify intents for a list of messages in parallel (bounded concurrency
 * so we don't accidentally hammer the Haiku rate limit on a big backfill).
 * Returns a map of messageId → intent for the ones we successfully classified.
 */
export async function classifyBatch(
  messages: Array<IntentInput & { id: string }>,
  concurrency = 8,
): Promise<Map<string, EmailIntent>> {
  const result = new Map<string, EmailIntent>()
  let cursor = 0
  async function worker() {
    while (cursor < messages.length) {
      const i = cursor++
      const msg = messages[i]
      const intent = await classifyIntent(msg)
      if (intent) result.set(msg.id, intent)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, messages.length) }, worker))
  return result
}
