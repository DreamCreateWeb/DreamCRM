import 'server-only'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { incrementAiUsage, getAiUsage } from '@/lib/services/ai-website'
import type { AiUsageSnapshot } from '@/lib/types/ai-website'

/**
 * AI command bar for the Website Studio. Translates a clinic owner's plain-
 * language instruction ("make the headline punchier", "use a warmer green",
 * "add a stat about same-week visits") into concrete edits against
 * clinic_profile, then applies them. It does NOT chat back — it just edits, and
 * the Studio canvas reloads to follow the changes live.
 */

// ── The editable surface the AI is allowed to touch ─────────────────────────
// `copy:*` keys map to the same copy-override map the inline editor writes, so
// anything the AI changes here is exactly what a manual edit would change. Each
// carries the public path it lives on, so we can navigate the canvas there.
//
// EVERY `copy:*` region the templates instrument MUST have an entry here (or be
// covered by a `*` wildcard entry), or the AI silently drops edits to it — the
// inline editor handles any `copy:` key generically, but the AI can only target
// keys it knows about. `tests/studio/field-wiring.test.ts` extracts every
// `copy:` tag from the templates and asserts each is covered here, so this can't
// drift. A `key` containing `*` matches any concrete index/prefix (e.g.
// `home.callout.*.title` covers `home.callout.0.title` … `.3.title`), so the
// repeating list-item families don't need one entry per index.
type CopyKey = { key: string; label: string; fallback: string; page: string }
const COPY_KEYS: CopyKey[] = [
  // ── Homepage ──────────────────────────────────────────────────────────────
  { key: 'home.differenceHeadline', label: 'Homepage "full range of care" headline', fallback: 'A full range of care for all your needs.', page: '/' },
  { key: 'home.differenceTitle', label: 'Homepage "difference" section title', fallback: 'The difference is in how it feels.', page: '/' },
  { key: 'home.teamGalleryTitle', label: 'Homepage team-gallery headline', fallback: 'The faces behind your care.', page: '/' },
  { key: 'home.teamHeading', label: 'Homepage "care that puts you first" headline', fallback: 'A team that truly listens.', page: '/' },
  { key: 'home.teamBlurb', label: 'Homepage "care that puts you first" blurb', fallback: 'Modern dentistry meets a gentler chairside touch.', page: '/' },
  { key: 'home.callout.*.title', label: 'Homepage trust callout title', fallback: '', page: '/' },
  { key: 'home.callout.*.body', label: 'Homepage trust callout body', fallback: '', page: '/' },
  { key: 'home.testimonialsTitle', label: 'Homepage reviews section headline', fallback: '', page: '/' },
  { key: 'home.insuranceTitle', label: 'Homepage insurance band headline', fallback: '', page: '/' },
  { key: 'home.insuranceIntro', label: 'Homepage insurance band intro', fallback: '', page: '/' },
  { key: 'home.locationTitle', label: 'Homepage location section headline', fallback: '', page: '/' },
  { key: 'home.closerTitle', label: 'Homepage closing-strip headline', fallback: '', page: '/' },
  { key: 'home.contactEyebrow', label: 'Homepage contact section eyebrow', fallback: '', page: '/' },
  { key: 'home.contactTitle', label: 'Homepage contact section headline', fallback: "We'd love to see you.", page: '/' },
  { key: 'home.contactIntro', label: 'Homepage contact section intro', fallback: '', page: '/' },
  { key: 'home.blogTitle', label: 'Homepage blog section headline', fallback: 'From the blog', page: '/' },
  // ── About page ──────────────────────────────────────────────────────────────
  { key: 'about.heroEyebrow', label: 'About page hero eyebrow', fallback: '', page: '/about' },
  { key: 'about.heroTitle', label: 'About page hero headline', fallback: '', page: '/about' },
  { key: 'about.teamTitle', label: 'About page team section headline', fallback: 'The people who care for you.', page: '/about' },
  { key: 'about.testimonialsTitle', label: 'About page reviews section headline', fallback: '', page: '/about' },
  { key: 'about.officeTitle', label: 'About page office section headline', fallback: 'A space designed to put you at ease.', page: '/about' },
  { key: 'about.cta.heading', label: 'About page closing CTA headline', fallback: 'Ready to come see us?', page: '/about' },
  { key: 'about.cta.subhead', label: 'About page closing CTA subhead', fallback: '', page: '/about' },
  // ── Team page ──────────────────────────────────────────────────────────────
  { key: 'team.heroEyebrow', label: 'Team page hero eyebrow', fallback: '', page: '/team' },
  { key: 'team.heroTitle', label: 'Team page hero headline', fallback: '', page: '/team' },
  { key: 'team.cta.heading', label: 'Team page closing CTA headline', fallback: 'It’s a pleasure to meet you.', page: '/team' },
  { key: 'team.cta.subhead', label: 'Team page closing CTA subhead', fallback: '', page: '/team' },
  // ── FAQ page ──────────────────────────────────────────────────────────────
  { key: 'faq.heroEyebrow', label: 'FAQ page hero eyebrow', fallback: '', page: '/faq' },
  { key: 'faq.heroTitle', label: 'FAQ page hero headline', fallback: 'Frequently asked questions.', page: '/faq' },
  { key: 'faq.cta.heading', label: 'FAQ page closing CTA headline', fallback: 'Still have questions?', page: '/faq' },
  { key: 'faq.cta.subhead', label: 'FAQ page closing CTA subhead', fallback: '', page: '/faq' },
  // ── Insurance page ──────────────────────────────────────────────────────────
  { key: 'insurance.heroEyebrow', label: 'Insurance page hero eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.heading', label: 'Insurance page hero headline', fallback: '', page: '/insurance' },
  { key: 'insurance.heroIntro', label: 'Insurance page hero intro', fallback: '', page: '/insurance' },
  { key: 'insurance.helpEyebrow', label: 'Insurance page "benefits on your side" eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.helpHeading', label: 'Insurance page "benefits on your side" headline', fallback: 'Benefits, on your side.', page: '/insurance' },
  { key: 'insurance.help.*.title', label: 'Insurance page help-point title', fallback: '', page: '/insurance' },
  { key: 'insurance.help.*.body', label: 'Insurance page help-point body', fallback: '', page: '/insurance' },
  { key: 'insurance.carriersEyebrow', label: 'Insurance page carriers eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.carriersHeading', label: 'Insurance page carriers headline', fallback: '', page: '/insurance' },
  { key: 'insurance.carriersListHeading', label: 'Insurance page carriers-list subheading', fallback: '', page: '/insurance' },
  { key: 'insurance.verifierHeading', label: 'Insurance page verifier-form heading', fallback: '', page: '/insurance' },
  { key: 'insurance.processEyebrow', label: 'Insurance page process eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.processHeading', label: 'Insurance page process headline', fallback: '', page: '/insurance' },
  { key: 'insurance.inNetLabel', label: 'Insurance page "in-network" column label', fallback: '', page: '/insurance' },
  { key: 'insurance.outNetLabel', label: 'Insurance page "out-of-network" column label', fallback: '', page: '/insurance' },
  { key: 'insurance.inNet.eyebrow', label: 'Insurance in-network steps eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.inNet.heading', label: 'Insurance in-network steps heading', fallback: '', page: '/insurance' },
  { key: 'insurance.inNet.*.title', label: 'Insurance in-network step title', fallback: '', page: '/insurance' },
  { key: 'insurance.inNet.*.body', label: 'Insurance in-network step body', fallback: '', page: '/insurance' },
  { key: 'insurance.outNet.eyebrow', label: 'Insurance out-of-network steps eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.outNet.heading', label: 'Insurance out-of-network steps heading', fallback: '', page: '/insurance' },
  { key: 'insurance.outNet.*.title', label: 'Insurance out-of-network step title', fallback: '', page: '/insurance' },
  { key: 'insurance.outNet.*.body', label: 'Insurance out-of-network step body', fallback: '', page: '/insurance' },
  { key: 'insurance.noInsEyebrow', label: 'Insurance page "no insurance?" eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.noInsHeading', label: 'Insurance page "no insurance?" headline', fallback: '', page: '/insurance' },
  { key: 'insurance.noInsBody', label: 'Insurance page "no insurance?" body', fallback: '', page: '/insurance' },
  { key: 'insurance.hsaEyebrow', label: 'Insurance page HSA/FSA eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.hsaHeading', label: 'Insurance page HSA/FSA headline', fallback: 'Use your HSA or FSA dollars here.', page: '/insurance' },
  { key: 'insurance.hsaBody', label: 'Insurance page HSA/FSA body', fallback: '', page: '/insurance' },
  { key: 'insurance.finalBillEyebrow', label: 'Insurance page "no silent surprises" eyebrow', fallback: '', page: '/insurance' },
  { key: 'insurance.finalBillHeading', label: 'Insurance page "no silent surprises" headline', fallback: 'No silent surprises.', page: '/insurance' },
  { key: 'insurance.finalBillBody', label: 'Insurance page "no silent surprises" body', fallback: '', page: '/insurance' },
  { key: 'insurance.faqHeading', label: 'Insurance page FAQ section heading', fallback: '', page: '/insurance' },
  { key: 'insurance.cta.heading', label: 'Insurance page closing CTA headline', fallback: 'Have more questions?', page: '/insurance' },
  { key: 'insurance.cta.subhead', label: 'Insurance page closing CTA subhead', fallback: '', page: '/insurance' },
  // ── Payment & financing page ──────────────────────────────────────────────
  { key: 'paymentFinancing.heroEyebrow', label: 'Payment page hero eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.heroTitle', label: 'Payment page hero headline', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.how.eyebrow', label: 'Payment page "honest billing" eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.how.heading', label: 'Payment page "honest billing" headline', fallback: 'Honest billing, every visit.', page: '/payment-financing' },
  { key: 'paymentFinancing.how.*.title', label: 'Payment page "honest billing" step title', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.how.*.body', label: 'Payment page "honest billing" step body', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.methodsEyebrow', label: 'Payment page methods eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.methodsHeading', label: 'Payment page methods headline', fallback: 'We accept the way you want to pay.', page: '/payment-financing' },
  { key: 'paymentFinancing.hsaEyebrow', label: 'Payment page HSA/FSA eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.hsaHeading', label: 'Payment page HSA/FSA headline', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.hsaBody', label: 'Payment page HSA/FSA body', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.financingEyebrow', label: 'Payment page financing eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.financingHeading', label: 'Payment page financing headline', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.cancelEyebrow', label: 'Payment page cancellation-policy eyebrow', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.cancelHeading', label: 'Payment page cancellation-policy headline', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.faqHeading', label: 'Payment page FAQ section heading', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.cta.heading', label: 'Payment page closing CTA headline', fallback: 'Questions about your bill?', page: '/payment-financing' },
  { key: 'paymentFinancing.cta.subhead', label: 'Payment page closing CTA subhead', fallback: '', page: '/payment-financing' },
  // ── Dental plans page ──────────────────────────────────────────────────────
  { key: 'dentalPlans.heroEyebrow', label: 'Dental plans page hero eyebrow', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.heroTitle', label: 'Dental plans page hero headline', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.heroIntro', label: 'Dental plans page hero intro', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.whyEyebrow', label: 'Dental plans "why patients choose this" eyebrow', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.whyHeading', label: 'Dental plans "why patients choose this" headline', fallback: 'Better than dental insurance, for most people.', page: '/dental-plans' },
  { key: 'dentalPlans.why.*.title', label: 'Dental plans reassurance-point title', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.why.*.body', label: 'Dental plans reassurance-point body', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.cta.heading', label: 'Dental plans closing CTA headline', fallback: 'Ready to join?', page: '/dental-plans' },
  { key: 'dentalPlans.cta.subhead', label: 'Dental plans closing CTA subhead', fallback: '', page: '/dental-plans' },
  // ── Careers + book ──────────────────────────────────────────────────────────
  { key: 'careers.heroEyebrow', label: 'Careers page hero eyebrow', fallback: '', page: '/careers' },
  { key: 'careers.heroTitle', label: 'Careers page hero headline', fallback: '', page: '/careers' },
  { key: 'careers.cta.heading', label: 'Careers page closing CTA headline', fallback: '', page: '/careers' },
  { key: 'careers.cta.subhead', label: 'Careers page closing CTA subhead', fallback: '', page: '/careers' },
  { key: 'book.heroEyebrow', label: 'Booking page hero eyebrow', fallback: '', page: '/book' },
  { key: 'book.heroTitle', label: 'Booking page hero headline', fallback: '', page: '/book' },
  { key: 'book.cta.heading', label: 'Booking page closing CTA headline', fallback: '', page: '/book' },
  { key: 'book.cta.subhead', label: 'Booking page closing CTA subhead', fallback: '', page: '/book' },
]

/**
 * Match a concrete copy key (e.g. `home.callout.2.title`) against a COPY_KEYS
 * entry whose `key` may contain `*` wildcards (e.g. `home.callout.*.title`).
 * Each `*` matches one dot-separated segment. An entry with no `*` is an exact
 * match. Returns the matching entry, or undefined.
 */
export function resolveCopyKey(key: string): CopyKey | undefined {
  // A concrete key only — never a literal wildcard (the model must substitute a
  // real index for the `*` in a family entry).
  if (!key || key.includes('*')) return undefined
  // Exact match first (cheap + the common case).
  const exact = COPY_KEYS.find((c) => c.key === key)
  if (exact) return exact
  return COPY_KEYS.find((c) => {
    if (!c.key.includes('*')) return false
    const pattern =
      '^' +
      c.key
        .split('.')
        .map((seg) =>
          seg === '*' ? '[0-9]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('\\.') +
      '$'
    return new RegExp(pattern).test(key)
  })
}

export interface AppliedEdit {
  label: string
  /** A short human preview of the new value, so the owner can verify the change. */
  preview: string
  /** The canvas element + page this edit touched — used to tour the changes. */
  anchor: string | null
  page: string
}

/** Columns the AI bar may write — the allow-list both edits and undo honour. */
export const EDITABLE_COLUMNS = [
  'tagline', 'about', 'displayName', 'phone', 'email', 'brandColor',
  'copyOverrides', 'differenceChips', 'acceptedInsuranceCarriers', 'stats',
  'paymentMethods', 'cancellationPolicy', 'hours', 'faq',
] as const

export type AiEditResult =
  | {
      ok: true
      edits: AppliedEdit[]
      page: string
      summary: string
      anchor: string | null
      /** Previous values of every changed column — pass to revert for one-click undo. */
      before: Record<string, unknown>
      /** Fresh allowance snapshot after counting this edit. */
      usage: AiUsageSnapshot
    }
  | { ok: false; error: string; clarify?: boolean; limit?: boolean; usage?: AiUsageSnapshot }

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS: Record<string, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun',
}
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/

const EditItem = z.object({
  type: z.enum([
    'field', 'brandColor', 'copy', 'chips', 'carriers', 'stats',
    'paymentMethods', 'cancellationPolicy', 'hours', 'faq',
  ]),
  field: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  items: z.array(z.string()).optional(),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  hours: z
    .record(z.string(), z.object({ open: z.string().nullish(), close: z.string().nullish(), closed: z.boolean().optional() }))
    .optional(),
  faq: z.array(z.object({ category: z.string(), question: z.string(), answer: z.string() })).optional(),
})
const EditEnvelope = z.object({
  summary: z.string().max(160),
  page: z.string().max(80),
  edits: z.array(EditItem).max(24),
  // When the request is too ambiguous to act on safely, the model asks instead.
  clarify: z.string().max(200).optional(),
})

const FIELD_COLS = new Set(['tagline', 'about', 'displayName', 'phone', 'email'])

function snapshot(profile: typeof clinicProfile.$inferSelect): string {
  const overrides = (profile.copyOverrides as Record<string, string> | null) ?? {}
  const stats = (profile.stats as { value: string; label: string }[] | null) ?? []
  const chips = (profile.differenceChips as string[] | null) ?? []
  const carriers = (profile.acceptedInsuranceCarriers as string[] | null) ?? []
  const paymentMethods = (profile.paymentMethods as string[] | null) ?? []
  const hours = (profile.hours as Record<string, { open?: string | null; close?: string | null; closed?: boolean }> | null) ?? {}
  const faq = (profile.faq as { category: string; question: string; answer: string }[] | null) ?? []
  const copy = COPY_KEYS.map((c) => {
    // Wildcard families repeat per list item — tell the model to substitute a
    // 0-based index for the `*` (e.g. home.callout.0.title), never write `*`.
    const isFamily = c.key.includes('*')
    return {
      key: c.key,
      page: c.page,
      label: isFamily ? `${c.label} (replace * with the item index, 0-based)` : c.label,
      current: isFamily ? '(per-item — varies)' : overrides[c.key] ?? c.fallback ?? '(default)',
    }
  })
  return JSON.stringify(
    {
      clinicName: profile.displayName ?? null,
      heroHeadline_tagline: profile.tagline ?? null,
      about: profile.about ? profile.about.slice(0, 1400) : null,
      phone: profile.phone ?? null,
      email: profile.email ?? null,
      brandColor: profile.brandColor ?? null,
      trustStats: stats.map((s) => `${s.value} — ${s.label}`),
      whyUsChips: chips,
      insuranceCarriers: carriers,
      paymentMethods,
      cancellationPolicy: profile.cancellationPolicy ?? null,
      officeHours: hours,
      faq: faq.map((f) => ({ category: f.category, question: f.question, answer: f.answer })),
      editableHeadings: copy,
    },
    null,
    2,
  )
}

const SYSTEM = `You are the AI editor inside a dental clinic's website builder. The clinic owner types a short instruction; you translate it into concrete edits to their site and return ONLY a tool call — you never chat back.

${CORE_VOICE_RULES}

How to respond:
- Call the apply_edits tool with the smallest set of edits that fulfils the instruction. Do NOT touch anything the instruction didn't ask about.

PICK THE RIGHT TYPE — this matters more than anything. Match the owner's intent to a TYPE before anything else. Structured data must NEVER be written into a "copy" heading:
- Open/close times, days open, "we close at…", "closed on…", "open until…", "our hours" → ALWAYS type "hours". NEVER "copy".
- Accepted insurance / "we take…" / carriers → type "carriers".
- How patients pay / payment methods / "we accept Apple Pay" → type "paymentMethods".
- The numbers/trust signals under the hero → type "stats".
- The short highlight chips by the intro → type "chips".
- A question patients ask / "add an FAQ about…" → type "faq".
- The cancellation / no-show policy → type "cancellationPolicy".
- Brand / accent / theme color → type "brandColor".
- The clinic name, phone, email, the hero headline, or the about story → type "field".
- A specific named section heading or block of body text → type "copy" with the editableHeadings key whose label matches the section AND page the owner means.

A "copy" edit's value is ALWAYS the human-readable display text for that one heading/section — never the owner's instruction text, and never structured data (hours, lists, times). If you find yourself about to put hours, days, or a list into a copy value, STOP — you picked the wrong type.

Type details:
- "field": field ∈ tagline (hero headline), about, displayName, phone, email.
- "brandColor": value is a hex color like "#2563EB" — tasteful + readable on a light background.
- "copy": key from editableHeadings; value = new display text.
- "chips" / "carriers" / "paymentMethods": items = the COMPLETE new list (start from current + apply the change).
- "stats": stats = COMPLETE new list (max 3) of {value,label}.
- "cancellationPolicy": value = new prose ("" to hide).
- "hours": hours keyed by day (mon..sun), each { open:"HH:MM" 24h, close:"HH:MM", closed:boolean }. Only include the days the owner mentioned (the rest are left unchanged).
- "faq": faq = COMPLETE new list of {category, question, answer}; category ∈ Booking, Your Visit, Insurance, Billing, Comfort.

Examples (instruction → the type you call):
- "update our hours for Mon, Wed and Fri — we close at 3pm" → hours { mon:{open:"09:00",close:"15:00",closed:false}, wed:{...close:"15:00"...}, fri:{...close:"15:00"...} }
- "we now take Apple Pay" → paymentMethods ["Cash","All major credit cards","HSA / FSA cards","Apple Pay"]
- "make the brand a deeper teal" → brandColor "#0F766E"
- "the contact heading should read 'Come on in'" → copy key "home.contactTitle" value "Come on in"
- "add an FAQ about parking" → faq [ …current items…, { category:"Your Visit", question:"Where do I park?", answer:"…" } ]

Safety:
- Never invent verifiable facts: no fake review counts, prices, years, awards, or carriers the owner didn't mention. Stats stay qualitative unless given a real number. FAQ cost answers are estimate-first, never a dollar figure.
- If the request is genuinely ambiguous (e.g. "change the headline" when several exist, and you can't tell which), DON'T guess — set the "clarify" field to ONE short question and return an empty edits array.
- "page" is filled in for you; "summary" is a few words naming what you changed.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A few words naming what you changed.' },
    page: { type: 'string', description: 'Site path most affected, e.g. "/" or "/about".' },
    clarify: { type: 'string', description: 'When the request is too ambiguous to act on, ONE short question; leave edits empty.' },
    edits: {
      type: 'array',
      description: 'The edits to apply.',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['field', 'brandColor', 'copy', 'chips', 'carriers', 'stats', 'paymentMethods', 'cancellationPolicy', 'hours', 'faq'],
          },
          field: { type: 'string', description: 'For type=field: tagline | about | displayName | phone | email.' },
          key: { type: 'string', description: 'For type=copy: an editableHeadings key.' },
          value: { type: 'string', description: 'New text (hex color for brandColor; prose for cancellationPolicy).' },
          items: { type: 'array', items: { type: 'string' }, description: 'Full new list for chips/carriers/paymentMethods.' },
          stats: {
            type: 'array',
            description: 'Full new list for stats (max 3).',
            items: {
              type: 'object',
              properties: { value: { type: 'string' }, label: { type: 'string' } },
              required: ['value', 'label'],
            },
          },
          hours: {
            type: 'object',
            description: 'For type=hours: keyed by day (mon..sun); each { open, close, closed }.',
            additionalProperties: {
              type: 'object',
              properties: { open: { type: 'string' }, close: { type: 'string' }, closed: { type: 'boolean' } },
            },
          },
          faq: {
            type: 'array',
            description: 'Full new FAQ list for type=faq.',
            items: {
              type: 'object',
              properties: { category: { type: 'string' }, question: { type: 'string' }, answer: { type: 'string' } },
              required: ['category', 'question', 'answer'],
            },
          },
        },
        required: ['type'],
      },
    },
  },
  required: ['summary', 'page', 'edits'],
}

export async function applyAiWebsiteEdit(orgId: string, instruction: string): Promise<AiEditResult> {
  if (!aiConfigured()) return { ok: false, error: 'AI is not configured on this environment.' }
  const text = instruction.trim()
  if (!text) return { ok: false, error: 'Type what you’d like to change.' }

  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return { ok: false, error: 'No website found for this clinic.' }

  // The AI bar spends Claude tokens on every edit, so it's metered against the
  // monthly allowance (editing by hand stays free + uncounted). Gate BEFORE the
  // model call so we never spend tokens past the cap.
  const usage = await getAiUsage(orgId, profile.planTier)
  if (usage.remaining <= 0) {
    return {
      ok: false,
      limit: true,
      usage,
      error: `You've used all ${usage.limit} AI edits this month. They reset on the 1st — you can keep editing by hand anytime.`,
    }
  }

  let envelope: z.infer<typeof EditEnvelope>
  try {
    const input = await runClaudeJson({
      model: 'sonnet',
      // Headroom so a full FAQ/carrier-list echo (these edit types replace the
      // whole list) doesn't truncate mid-output into a parse failure.
      maxTokens: 2400,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Instruction: ${text}\n\nReply by calling apply_edits.\n\n<current_site>\n${snapshot(profile)}\n</current_site>`,
        },
      ],
      toolName: 'apply_edits',
      toolDescription: 'Apply a set of edits to the clinic website.',
      inputSchema: INPUT_SCHEMA,
    })
    if (!input) return { ok: false, error: 'The AI didn’t return anything — try rephrasing.' }
    const parsed = EditEnvelope.safeParse(input)
    if (!parsed.success) return { ok: false, error: 'The AI’s response couldn’t be applied — try again.' }
    envelope = parsed.data
  } catch (err) {
    console.warn('[ai.website-edit] failed:', (err as Error).message)
    return { ok: false, error: 'The AI request failed — please try again.' }
  }

  // Ambiguous request → the model asked instead of guessing wrong.
  if (envelope.edits.length === 0 && envelope.clarify?.trim()) {
    return { ok: false, error: envelope.clarify.trim(), clarify: true }
  }

  // ── Apply the edits to a single patch ─────────────────────────────────────
  const patch: Partial<typeof clinicProfile.$inferInsert> = {}
  const overrides: Record<string, string> = {
    ...((profile.copyOverrides as Record<string, string> | null) ?? {}),
  }
  let overridesTouched = false
  const applied: AppliedEdit[] = []
  // The first edit that maps to a tagged element on the canvas — the Studio
  // scrolls to + flashes it so "Follow the AI" lands on the change.
  let anchor: string | null = null
  const setAnchor = (a: string | null) => {
    if (anchor === null && a) anchor = a
  }
  // The result page follows the primary edit, not the model's guess.
  let resultPage: string | null = null
  const setPage = (p: string | null) => {
    if (resultPage === null && p) resultPage = p
  }
  const trunc = (s: string, n = 56) => {
    const t = s.trim()
    if (!t) return '(cleared)'
    return t.length > n ? `${t.slice(0, n - 1)}…` : t
  }
  // Record an applied edit + track the primary anchor/page from the first one.
  const push = (edit: AppliedEdit) => {
    applied.push(edit)
    setAnchor(edit.anchor)
    setPage(edit.page)
  }

  for (const e of envelope.edits) {
    if (e.type === 'field' && e.field && FIELD_COLS.has(e.field) && typeof e.value === 'string') {
      const v = e.value.trim()
      ;(patch as Record<string, unknown>)[e.field] = v || null
      const a = e.field === 'tagline' || e.field === 'about' || e.field === 'displayName' ? e.field : null
      push({ label: labelForField(e.field), preview: trunc(v), anchor: a, page: '/' })
    } else if (e.type === 'brandColor' && e.value && HEX.test(e.value.trim())) {
      patch.brandColor = e.value.trim()
      push({ label: 'Brand color', preview: e.value.trim(), anchor: 'tagline', page: '/' })
    } else if (e.type === 'copy' && e.key && typeof e.value === 'string' && resolveCopyKey(e.key)) {
      const entry = resolveCopyKey(e.key)!
      // Persist the CONCRETE key the AI gave (e.g. home.callout.2.title), even
      // when it matched a `*` family entry — that's what the template reads.
      overrides[e.key] = e.value
      overridesTouched = true
      push({ label: entry.label, preview: trunc(e.value), anchor: `copy:${e.key}`, page: entry.page })
    } else if (e.type === 'chips' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 8)
      patch.differenceChips = list.length > 0 ? list : null
      push({ label: '“Why us” highlights', preview: trunc(list.join(', ')), anchor: 'differenceChips', page: '/' })
    } else if (e.type === 'carriers' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 40)
      patch.acceptedInsuranceCarriers = list.length > 0 ? list : null
      push({ label: 'Insurance carriers', preview: trunc(list.join(', ')), anchor: 'acceptedInsuranceCarriers', page: '/' })
    } else if (e.type === 'stats' && Array.isArray(e.stats)) {
      const list = e.stats
        .slice(0, 3)
        .map((s, i) => ({ id: `stat_${i}`, value: s.value.trim(), label: s.label.trim() }))
        .filter((s) => s.value && s.label)
      patch.stats = list.length > 0 ? list : null
      push({ label: 'Trust stats', preview: trunc(list.map((s) => `${s.value} ${s.label}`).join(' · ')), anchor: 'stats', page: '/' })
    } else if (e.type === 'paymentMethods' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 12)
      patch.paymentMethods = list.length > 0 ? list : null
      push({ label: 'Payment methods', preview: trunc(list.join(', ')), anchor: 'paymentFinancing', page: '/payment-financing' })
    } else if (e.type === 'cancellationPolicy' && typeof e.value === 'string') {
      patch.cancellationPolicy = e.value.trim() || null
      push({ label: 'Cancellation policy', preview: trunc(e.value), anchor: 'paymentFinancing', page: '/payment-financing' })
    } else if (e.type === 'hours' && e.hours) {
      const cleaned = cleanHours(e.hours)
      if (cleaned) {
        // MERGE onto current hours so unmentioned days are never wiped.
        const current = (profile.hours as Record<string, unknown> | null) ?? {}
        patch.hours = { ...current, ...cleaned }
        const days = Object.keys(cleaned).map((d) => DAY_LABELS[d] ?? d).join(', ')
        push({ label: 'Office hours', preview: `${days} updated`, anchor: 'hours', page: '/' })
      }
    } else if (e.type === 'faq' && Array.isArray(e.faq)) {
      const list = e.faq
        .map((f, i) => ({ id: `faq_${i}`, category: f.category.trim(), question: f.question.trim(), answer: f.answer.trim() }))
        .filter((f) => f.question && f.answer && f.category)
        .slice(0, 14)
      patch.faq = list.length > 0 ? list : null
      push({ label: 'FAQ', preview: `${list.length} question${list.length === 1 ? '' : 's'}`, anchor: 'faq', page: '/faq' })
    }
  }

  if (overridesTouched) {
    patch.copyOverrides = Object.keys(overrides).length > 0 ? overrides : null
  }

  if (applied.length === 0) {
    return {
      ok: false,
      error:
        envelope.clarify?.trim() ||
        'I couldn’t safely turn that into an edit — try naming the section to change.',
      clarify: !!envelope.clarify?.trim(),
    }
  }

  // Snapshot the previous value of every changed column, for one-click undo.
  const before: Record<string, unknown> = {}
  for (const col of Object.keys(patch)) {
    before[col] = (profile as Record<string, unknown>)[col] ?? null
  }

  await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, orgId))
  // Count this successful edit against the allowance — best-effort so a counter
  // hiccup never fails an edit that already applied. Return the fresh snapshot
  // so the bar shows what's left.
  await incrementAiUsage(orgId).catch(() => {})
  const refreshed = await getAiUsage(orgId, profile.planTier).catch(() => ({
    ...usage,
    used: usage.used + 1,
    remaining: Math.max(0, usage.remaining - 1),
  }))

  const page = resultPage ?? (envelope.page.startsWith('/') ? envelope.page : '/')
  return {
    ok: true,
    edits: applied,
    page,
    summary: envelope.summary.trim() || 'Updated your site',
    anchor,
    before,
    usage: refreshed,
  }
}

/**
 * Undo: restore the previous column values captured before an AI edit. Only
 * whitelisted, editable columns are written — the rest are ignored.
 */
export async function revertAiWebsiteEdit(
  orgId: string,
  before: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!before || typeof before !== 'object') return { ok: false, error: 'Nothing to undo.' }
  const allowed = new Set<string>(EDITABLE_COLUMNS)
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(before)) {
    if (allowed.has(k)) patch[k] = v ?? null
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to undo.' }
  try {
    await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, orgId))
    return { ok: true }
  } catch {
    return { ok: false, error: 'Could not undo — try again.' }
  }
}

function cleanHours(
  raw: Record<string, { open?: string | null; close?: string | null; closed?: boolean }>,
): Record<string, { open: string | null; close: string | null; closed: boolean }> | null {
  const out: Record<string, { open: string | null; close: string | null; closed: boolean }> = {}
  let any = false
  for (const day of DAYS) {
    const d = raw[day]
    if (!d) continue
    const closed = !!d.closed
    const open = !closed && typeof d.open === 'string' && TIME_RE.test(d.open) ? d.open : null
    const close = !closed && typeof d.close === 'string' && TIME_RE.test(d.close) ? d.close : null
    out[day] = { open, close, closed }
    any = true
  }
  return any ? out : null
}

function labelForField(field: string): string {
  switch (field) {
    case 'tagline':
      return 'Hero headline'
    case 'about':
      return 'About text'
    case 'displayName':
      return 'Clinic name'
    case 'phone':
      return 'Phone'
    case 'email':
      return 'Email'
    default:
      return field
  }
}
