import 'server-only'
import { and, eq, gte, isNotNull, lte } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { aiConfigured, runClaudeJson } from '@/lib/ai'
import { isAiUsageOverCap, bumpAiUsage } from '@/lib/services/ai-usage'
import { fileProposal } from '@/lib/services/proposals'
import { PROPOSAL_DRAFT_MONTHLY_CAP } from '@/lib/services/proposal-generators'
import { formatClinicDayTime } from '@/lib/format-datetime'

/**
 * FEEDBACK REPLIES (ML-21 — the second generator under ML-11's convention).
 *
 * A bad visit is the one moment the practice most wants to reach out and
 * most often doesn't. The bell beside a 1–2★ private note or a detractor
 * survey already files the phone call (lib/services/patient-followups.ts
 * `autoCreateFeedbackFollowup`); this generator drafts the personal NOTE
 * back and files `feedback_reply` for a yes. It NEVER sends — the lane is
 * ask-first and not grantable (lib/autonomy.ts: a reply to someone who
 * told the practice something is a conversation, and the practice may
 * know the person). Public Google reviews are the review_reply lane's and
 * never pass through here.
 *
 * Selection — the last LOOKBACK_DAYS, worst first, then newest:
 *  - a PRIVATE NOTE on a review link (`review_request.private_feedback`)
 *    rated 1–2★, or left with no star at all (a note with no rating is
 *    still the patient choosing to tell the office something; a 3★+ note
 *    is a thank-you to read, not a wound to tend);
 *  - a DETRACTOR survey (`nps_response.score` ≤ 6), comment or no comment
 *    — a bare 4/10 still earns a personal "we'd like to hear more";
 *  - only a patient with an email on file (the yes sends mail) who is
 *    still active;
 *  - at most MAX_PER_RUN cards per org per pass.
 *
 * Dedupe — before any AI spend:
 *  - the sourceKey is `feedback_reply:<review|nps>:<row id>` — one ask per
 *    note, for good (fileProposal is idempotent per org + sourceKey): a
 *    decline is a "no" about THAT note, an expiry a "too late", an approve
 *    the answer. That key is also what "unanswered" means here — the row
 *    has no answered column (no migration in this slice), so the proposal
 *    row plus the ledger line ARE the record that a note was answered;
 *  - ONE OPEN CARD PER PATIENT: a patient who left both a note and a
 *    survey gets one draft, not two apologies in one morning.
 *
 * The draft goes through lib/ai.ts under the shared 'proposal_draft'
 * allowance the social and inquiry drafts spend. AI off → nothing filed (a
 * template apology to a specific person is worse than none). A provider
 * break reports through `onSoftFailure` once; a per-note miss skips only
 * that note; an exhausted allowance ends the pass.
 *
 * PHI: the card quotes the patient's own words the way /growth/reviews/
 * received already shows them — inside `proposal.payload`, nowhere new.
 * The Approval Inbox renders them as text (React escapes); the email the
 * yes sends goes through sendNotificationEmail, which escapes every line.
 */

/** How far back a note or survey still deserves a drafted reply. */
export const FEEDBACK_LOOKBACK_DAYS = 7
/** Cards per org per pass. */
export const MAX_FEEDBACK_REPLIES_PER_RUN = 3
/** Rows read per source per pass before the caps. */
const CANDIDATE_LIMIT = 10
/** A 1–2★ private note; a 3★+ one is read, not answered here. */
const LOW_RATING_MAX = 2
/** The NPS detractor line (0–6), the survey's own escalation rule. */
const DETRACTOR_MAX = 6
const DAY_MS = 24 * 60 * 60 * 1000
/** A reply to a bad visit goes stale fast — one week, like a patient reply. */
const EXPIRES_DAYS = 7
/** The subject the card discloses (editable there like every email card). */
const SUBJECT = 'About your recent visit'
const AI_KIND = 'proposal_draft'

export type OnSoftFailure = () => void

type FeedbackSource = 'review' | 'nps'

interface Candidate {
  source: FeedbackSource
  id: string
  patientId: string
  firstName: string
  lastName: string
  email: string
  /** The patient's own words, or null for a score-only survey. */
  text: string | null
  /** 1–5 for a note (null = no star), 0–10 for a survey. */
  rating: number | null
  at: Date
}

/** Lower is worse: a 1★ note before a 2★, a 2/10 before a 6/10, a note with
 *  no star between the two bands. Equal severity → newest first. */
function severity(c: Candidate): number {
  if (c.source === 'nps') return 10 + (c.rating ?? DETRACTOR_MAX)
  if (c.rating == null) return 5
  return c.rating
}

/** Cheap existence check so no AI draft is spent on an already-asked note. */
async function sourceKeyTaken(organizationId: string, sourceKey: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.proposal.id })
    .from(schema.proposal)
    .where(and(eq(schema.proposal.organizationId, organizationId), eq(schema.proposal.sourceKey, sourceKey)))
    .limit(1)
  return !!row
}

/** Patients who already have an OPEN feedback_reply card (one per patient). */
async function patientsWithOpenCard(organizationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ patientId: schema.proposal.patientId })
    .from(schema.proposal)
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        eq(schema.proposal.capability, 'feedback_reply'),
        eq(schema.proposal.status, 'open'),
      ),
    )
  const ids = new Set<string>()
  for (const r of rows) if (typeof r.patientId === 'string') ids.add(r.patientId)
  return ids
}

async function readCandidates(organizationId: string, since: Date): Promise<Candidate[]> {
  const notes = await db
    .select({
      id: schema.reviewRequest.id,
      patientId: schema.reviewRequest.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      text: schema.reviewRequest.privateFeedback,
      rating: schema.reviewRequest.rating,
      at: schema.reviewRequest.completedAt,
    })
    .from(schema.reviewRequest)
    .innerJoin(schema.patient, eq(schema.reviewRequest.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.reviewRequest.organizationId, organizationId),
        eq(schema.patient.organizationId, organizationId),
        isNotNull(schema.reviewRequest.privateFeedback),
        gte(schema.reviewRequest.completedAt, since),
        isNotNull(schema.patient.email),
        eq(schema.patient.isActive, 1),
      ),
    )
    .limit(CANDIDATE_LIMIT * 2)
  const surveys = await db
    .select({
      id: schema.npsResponse.id,
      patientId: schema.npsResponse.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      email: schema.patient.email,
      text: schema.npsResponse.comment,
      rating: schema.npsResponse.score,
      at: schema.npsResponse.respondedAt,
    })
    .from(schema.npsResponse)
    .innerJoin(schema.patient, eq(schema.npsResponse.patientId, schema.patient.id))
    .where(
      and(
        eq(schema.npsResponse.organizationId, organizationId),
        eq(schema.patient.organizationId, organizationId),
        lte(schema.npsResponse.score, DETRACTOR_MAX),
        gte(schema.npsResponse.respondedAt, since),
        isNotNull(schema.patient.email),
        eq(schema.patient.isActive, 1),
      ),
    )
    .limit(CANDIDATE_LIMIT)

  const out: Candidate[] = []
  for (const n of notes) {
    // The rating band is re-applied in memory (the SQL half only narrows):
    // a 3★+ private note is left alone.
    if (n.rating != null && n.rating > LOW_RATING_MAX) continue
    if (!n.email || !n.at || !n.text?.trim()) continue
    out.push({
      source: 'review',
      id: n.id,
      patientId: n.patientId,
      firstName: n.firstName,
      lastName: n.lastName,
      email: n.email,
      text: n.text.trim(),
      rating: n.rating ?? null,
      at: n.at,
    })
  }
  for (const s of surveys) {
    if (s.rating == null || s.rating > DETRACTOR_MAX) continue
    if (!s.email || !s.at) continue
    out.push({
      source: 'nps',
      id: s.id,
      patientId: s.patientId,
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      text: s.text?.trim() || null,
      rating: s.rating,
      at: s.at,
    })
  }
  out.sort((a, b) => severity(a) - severity(b) || b.at.getTime() - a.at.getTime())
  return out.slice(0, CANDIDATE_LIMIT)
}

const DraftSchema = z.object({ text: z.string().min(1).max(1500) })

type DraftResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not_configured' | 'no_allowance' | 'failed' | 'unusable' }

/** How the card names what the patient left — for the title, the quoted
 *  turn's stamp and the prompt. */
function describeRating(c: Candidate): string {
  if (c.source === 'nps') return `${c.rating}/10 survey`
  return c.rating != null ? `${c.rating}★ private note` : 'private note'
}

/**
 * The personal note, drafted in the practice's voice. Private mail to the
 * patient who wrote in — so unlike the public review reply it MAY speak to
 * what they said — but still nothing clinical the patient didn't raise, no
 * excuses, no incentives, and the anti-shame register the product keeps
 * everywhere ("We're sorry Tuesday wasn't what it should have been").
 * The email shell adds "Hi {first}," above and "— {practice}" below, so the
 * draft carries neither.
 */
async function draftFeedbackReply(
  organizationId: string,
  clinicName: string,
  c: Candidate,
): Promise<DraftResult> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' }
  if (await isAiUsageOverCap(organizationId, AI_KIND, PROPOSAL_DRAFT_MONTHLY_CAP)) {
    return { ok: false, reason: 'no_allowance' }
  }
  const what =
    c.source === 'nps'
      ? `They scored their visit ${c.rating}/10 on the post-visit survey${c.text ? ' and wrote:' : ' and left no comment.'}`
      : `They left a ${c.rating != null ? `${c.rating}-star ` : ''}private note (not a public review):`
  let raw: unknown
  try {
    raw = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 500,
      system: [
        `You draft a short personal email from ${clinicName}, a dental practice, to a patient who told the office privately that a recent visit fell short.`,
        'Hard rules:',
        '- Private mail to the patient, so you may speak to what they said — but never add clinical detail they did not raise, never diagnose, never promise refunds, discounts or incentives.',
        '- Lead with a sincere, specific apology for THEIR experience in the practice’s own voice (“We’re sorry Tuesday wasn’t what it should have been”). Never argue, explain away, or blame staff or the patient.',
        '- Say plainly that someone from the office would like to hear more and will call; invite them to reply to this email or call if they would rather.',
        '- 3–5 sentences, warm and plain, no corporate boilerplate, no emojis, no exclamation marks.',
        '- Do NOT open with a greeting line and do NOT sign off — the email adds “Hi {first},” above and the practice’s name below.',
        '- Never ask them to change or remove a review, and never mention reviews at all.',
      ].join('\n'),
      messages: [
        {
          role: 'user',
          content: `Patient: ${c.firstName} ${c.lastName}\n${what}${c.text ? `\n"""\n${c.text}\n"""` : ''}\n\nDraft the email body.`,
        },
      ],
      toolName: 'draft_feedback_reply',
      toolDescription: 'Return the drafted email body for a staff member to review before anything is sent.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The drafted email body — no greeting, no sign-off.' } },
        required: ['text'],
      },
    })
  } catch (err) {
    console.warn('[proposal-generators] feedback_reply draft failed', err)
    return { ok: false, reason: 'failed' }
  }
  const parsed = DraftSchema.safeParse(raw)
  // 'unusable', not 'failed': the provider answered, this ONE draft was no
  // good (a refusal on a profane note). Only a provider break is an engine
  // signal — the review_reply lane's round-2 lesson.
  if (!parsed.success) return { ok: false, reason: 'unusable' }
  await bumpAiUsage(organizationId, AI_KIND)
  return { ok: true, text: parsed.data.text.trim() }
}

export async function generateFeedbackReplyProposals(
  organizationId: string,
  now: Date,
  timeZone: string,
  onSoftFailure?: OnSoftFailure,
): Promise<number> {
  if (!aiConfigured()) return 0

  const since = new Date(now.getTime() - FEEDBACK_LOOKBACK_DAYS * DAY_MS)
  const candidates = await readCandidates(organizationId, since)
  if (candidates.length === 0) return 0

  const busy = await patientsWithOpenCard(organizationId)
  const [profile] = await db
    .select({ displayName: schema.clinicProfile.displayName })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  const clinicName = profile?.displayName?.trim() || 'our practice'

  let filed = 0
  for (const c of candidates) {
    if (filed >= MAX_FEEDBACK_REPLIES_PER_RUN) break
    if (busy.has(c.patientId)) continue

    const sourceKey = `feedback_reply:${c.source}:${c.id}`
    if (await sourceKeyTaken(organizationId, sourceKey)) continue

    const draft = await draftFeedbackReply(organizationId, clinicName, c)
    if (!draft.ok) {
      // Org-global reasons end the pass; a per-note miss skips the note.
      if (draft.reason === 'not_configured' || draft.reason === 'no_allowance') break
      if (draft.reason === 'failed') onSoftFailure?.()
      continue
    }

    const first = c.firstName.trim() || 'this patient'
    const fullName = `${c.firstName} ${c.lastName}`.trim() || 'Patient'
    const label = describeRating(c)
    // The patient's own words as the one turn the draft answers, stamped in
    // the clinic's wall clock (the tz law) — the artifact never formats a
    // date itself. A score-only survey quotes the score as its words.
    const quoted = c.text ?? `Scored their visit ${c.rating}/10 and left no comment.`
    const whenLabel = `${formatClinicDayTime(c.at, timeZone)} · ${label}`

    const { filed: ok } = await fileProposal({
      organizationId,
      capability: 'feedback_reply',
      sourceKey,
      patientId: c.patientId,
      title:
        c.source === 'nps'
          ? `Write back to ${first} — they scored their visit ${c.rating}/10`
          : `Write back to ${first} — they told you privately their visit fell short`,
      body: draft.text,
      payload: {
        source: c.source,
        feedbackId: c.id,
        patientId: c.patientId,
        subject: SUBJECT,
        context: { kind: 'thread', author: fullName },
        thread: {
          messages: [{ from: 'patient', author: fullName, text: quoted, whenLabel }],
          toLine: `${fullName} · ${c.email}`,
        },
      },
      expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY_MS),
    })
    if (ok) {
      filed++
      busy.add(c.patientId)
    }
  }
  return filed
}
