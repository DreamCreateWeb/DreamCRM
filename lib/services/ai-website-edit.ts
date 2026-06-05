import 'server-only'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { clinicProfile } from '@/lib/db/schema/platform'
import { runClaudeJson, aiConfigured } from '@/lib/ai'
import { CORE_VOICE_RULES } from '@/lib/services/service-library-ai'
import { incrementAiUsage } from '@/lib/services/ai-website'

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
type CopyKey = { key: string; label: string; fallback: string; page: string }
const COPY_KEYS: CopyKey[] = [
  // Homepage
  { key: 'home.differenceHeadline', label: 'Homepage "full range of care" headline', fallback: 'A full range of care for all your needs.', page: '/' },
  { key: 'home.differenceTitle', label: 'Homepage "difference" section title', fallback: 'The difference is in how it feels.', page: '/' },
  { key: 'home.teamGalleryTitle', label: 'Homepage team-gallery headline', fallback: 'The faces behind your care.', page: '/' },
  { key: 'home.teamHeading', label: 'Homepage "care that puts you first" headline', fallback: 'A team that truly listens.', page: '/' },
  { key: 'home.teamBlurb', label: 'Homepage "care that puts you first" blurb', fallback: 'Modern dentistry meets a gentler chairside touch.', page: '/' },
  { key: 'home.callout.0.title', label: 'Homepage trust callout 1 title', fallback: 'Experienced clinicians', page: '/' },
  { key: 'home.callout.0.body', label: 'Homepage trust callout 1 body', fallback: '', page: '/' },
  { key: 'home.callout.1.title', label: 'Homepage trust callout 2 title', fallback: 'Science-based care', page: '/' },
  { key: 'home.callout.1.body', label: 'Homepage trust callout 2 body', fallback: '', page: '/' },
  { key: 'home.callout.2.title', label: 'Homepage trust callout 3 title', fallback: 'Outcomes, not quotas', page: '/' },
  { key: 'home.callout.2.body', label: 'Homepage trust callout 3 body', fallback: '', page: '/' },
  { key: 'home.callout.3.title', label: 'Homepage trust callout 4 title', fallback: 'Modern infection control', page: '/' },
  { key: 'home.callout.3.body', label: 'Homepage trust callout 4 body', fallback: '', page: '/' },
  { key: 'home.testimonialsTitle', label: 'Homepage reviews section headline', fallback: '', page: '/' },
  { key: 'home.insuranceTitle', label: 'Homepage insurance band headline', fallback: '', page: '/' },
  { key: 'home.insuranceIntro', label: 'Homepage insurance band intro', fallback: '', page: '/' },
  { key: 'home.locationTitle', label: 'Homepage location section headline', fallback: '', page: '/' },
  { key: 'home.contactTitle', label: 'Homepage contact section headline', fallback: "We'd love to see you.", page: '/' },
  { key: 'home.contactIntro', label: 'Homepage contact section intro', fallback: '', page: '/' },
  { key: 'home.blogTitle', label: 'Homepage blog section headline', fallback: 'From the blog', page: '/' },
  // About page
  { key: 'about.heroTitle', label: 'About page hero headline', fallback: '', page: '/about' },
  { key: 'about.teamTitle', label: 'About page team section headline', fallback: 'The people who care for you.', page: '/about' },
  { key: 'about.officeTitle', label: 'About page office section headline', fallback: 'A space designed to put you at ease.', page: '/about' },
  { key: 'about.cta.heading', label: 'About page closing CTA headline', fallback: 'Ready to come see us?', page: '/about' },
  // Team page
  { key: 'team.heroTitle', label: 'Team page hero headline', fallback: '', page: '/team' },
  { key: 'team.cta.heading', label: 'Team page closing CTA headline', fallback: 'It’s a pleasure to meet you.', page: '/team' },
  // FAQ page
  { key: 'faq.heroTitle', label: 'FAQ page hero headline', fallback: 'Frequently asked questions.', page: '/faq' },
  { key: 'faq.cta.heading', label: 'FAQ page closing CTA headline', fallback: 'Still have questions?', page: '/faq' },
  // Insurance page
  { key: 'insurance.heading', label: 'Insurance page hero headline', fallback: '', page: '/insurance' },
  { key: 'insurance.heroIntro', label: 'Insurance page hero intro', fallback: '', page: '/insurance' },
  { key: 'insurance.helpHeading', label: 'Insurance page "benefits on your side" headline', fallback: 'Benefits, on your side.', page: '/insurance' },
  { key: 'insurance.processHeading', label: 'Insurance page process headline', fallback: '', page: '/insurance' },
  { key: 'insurance.hsaHeading', label: 'Insurance page HSA/FSA headline', fallback: 'Use your HSA or FSA dollars here.', page: '/insurance' },
  { key: 'insurance.finalBillHeading', label: 'Insurance page "no silent surprises" headline', fallback: 'No silent surprises.', page: '/insurance' },
  { key: 'insurance.cta.heading', label: 'Insurance page closing CTA headline', fallback: 'Have more questions?', page: '/insurance' },
  // Payment & financing page
  { key: 'paymentFinancing.heroTitle', label: 'Payment page hero headline', fallback: '', page: '/payment-financing' },
  { key: 'paymentFinancing.how.heading', label: 'Payment page "honest billing" headline', fallback: 'Honest billing, every visit.', page: '/payment-financing' },
  { key: 'paymentFinancing.methodsHeading', label: 'Payment page methods headline', fallback: 'We accept the way you want to pay.', page: '/payment-financing' },
  { key: 'paymentFinancing.cta.heading', label: 'Payment page closing CTA headline', fallback: 'Questions about your bill?', page: '/payment-financing' },
  // Dental plans page
  { key: 'dentalPlans.heroTitle', label: 'Dental plans page hero headline', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.heroIntro', label: 'Dental plans page hero intro', fallback: '', page: '/dental-plans' },
  { key: 'dentalPlans.whyHeading', label: 'Dental plans "why patients choose this" headline', fallback: 'Better than dental insurance, for most people.', page: '/dental-plans' },
  { key: 'dentalPlans.cta.heading', label: 'Dental plans closing CTA headline', fallback: 'Ready to join?', page: '/dental-plans' },
  // Careers + book
  { key: 'careers.heroTitle', label: 'Careers page hero headline', fallback: '', page: '/careers' },
  { key: 'book.heroTitle', label: 'Booking page hero headline', fallback: '', page: '/book' },
]

export interface AppliedEdit {
  label: string
}

export type AiEditResult =
  | { ok: true; edits: AppliedEdit[]; page: string; summary: string; anchor: string | null }
  | { ok: false; error: string }

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
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
  const copy = COPY_KEYS.map((c) => ({
    key: c.key,
    page: c.page,
    label: c.label,
    current: overrides[c.key] ?? c.fallback ?? '(default)',
  }))
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
- Edit types:
  - "field": value goes to a clinic field. field ∈ tagline (the hero headline), about, displayName (clinic name), phone, email.
  - "brandColor": value is a hex color like "#2563EB". Pick a tasteful, accessible color when asked for a vibe ("warmer", "calming blue", etc.).
  - "copy": key is one of the editableHeadings keys from the context; value is the new text. Use the key whose label matches the section + page the owner means.
  - "chips": items is the COMPLETE new list of short "why us" highlight chips.
  - "carriers": items is the COMPLETE new list of accepted insurance carrier names.
  - "stats": stats is the COMPLETE new list (max 3) of {value, label} trust stats.
  - "paymentMethods": items is the COMPLETE new list of accepted payment methods (e.g. "Cash", "All major credit cards", "HSA / FSA cards").
  - "cancellationPolicy": value is the new cancellation-policy prose (or empty string to hide it).
  - "hours": hours is an object keyed by day (mon,tue,wed,thu,fri,sat,sun), each { open: "HH:MM" (24h), close: "HH:MM", closed: boolean }. Include EVERY day; mark days off with closed:true.
  - "faq": faq is the COMPLETE new list of { category, question, answer }. category ∈ Booking, Your Visit, Insurance, Billing, Comfort. Start from the current faq and apply the change (add/edit/remove).
- For any list (chips/carriers/stats/paymentMethods/faq) always return the FULL list, not just additions — start from the current values in the context.
- Never invent verifiable facts: no fake review counts, prices, years, awards, or carriers the owner didn't mention. Stats stay qualitative ("Same-week", "Most insurance accepted") unless the owner gives a real number. FAQ answers describe cost as an estimate-first process, never a dollar figure.
- "page" is filled in for you from the edit — you may leave it "/".
- Set "summary" to a few words naming what you changed, e.g. "Updated the hero headline and brand color".`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A few words naming what you changed.' },
    page: { type: 'string', description: 'Site path most affected, e.g. "/" or "/about".' },
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

  let envelope: z.infer<typeof EditEnvelope>
  try {
    const input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 1500,
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
  const knownCopy = new Map(COPY_KEYS.map((c) => [c.key, c]))

  for (const e of envelope.edits) {
    if (e.type === 'field' && e.field && FIELD_COLS.has(e.field) && typeof e.value === 'string') {
      const v = e.value.trim()
      ;(patch as Record<string, unknown>)[e.field] = v || null
      applied.push({ label: labelForField(e.field) })
      setPage('/')
      if (e.field === 'tagline' || e.field === 'about' || e.field === 'displayName') setAnchor(e.field)
    } else if (e.type === 'brandColor' && e.value && HEX.test(e.value.trim())) {
      patch.brandColor = e.value.trim()
      applied.push({ label: 'Brand color' })
      setPage('/')
    } else if (e.type === 'copy' && e.key && knownCopy.has(e.key) && typeof e.value === 'string') {
      const entry = knownCopy.get(e.key)!
      overrides[e.key] = e.value
      overridesTouched = true
      applied.push({ label: entry.label })
      setAnchor(`copy:${e.key}`)
      setPage(entry.page)
    } else if (e.type === 'chips' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 8)
      patch.differenceChips = list.length > 0 ? list : null
      applied.push({ label: '“Why us” highlights' })
      setAnchor('differenceChips')
      setPage('/')
    } else if (e.type === 'carriers' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 40)
      patch.acceptedInsuranceCarriers = list.length > 0 ? list : null
      applied.push({ label: 'Insurance carriers' })
      setAnchor('acceptedInsuranceCarriers')
      setPage('/')
    } else if (e.type === 'stats' && Array.isArray(e.stats)) {
      const list = e.stats
        .slice(0, 3)
        .map((s, i) => ({ id: `stat_${i}`, value: s.value.trim(), label: s.label.trim() }))
        .filter((s) => s.value && s.label)
      patch.stats = list.length > 0 ? list : null
      applied.push({ label: 'Trust stats' })
      setAnchor('stats')
      setPage('/')
    } else if (e.type === 'paymentMethods' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 12)
      patch.paymentMethods = list.length > 0 ? list : null
      applied.push({ label: 'Payment methods' })
      setAnchor('paymentFinancing')
      setPage('/payment-financing')
    } else if (e.type === 'cancellationPolicy' && typeof e.value === 'string') {
      patch.cancellationPolicy = e.value.trim() || null
      applied.push({ label: 'Cancellation policy' })
      setAnchor('paymentFinancing')
      setPage('/payment-financing')
    } else if (e.type === 'hours' && e.hours) {
      const h = cleanHours(e.hours)
      if (h) {
        patch.hours = h
        applied.push({ label: 'Office hours' })
        setAnchor('hours')
        setPage('/')
      }
    } else if (e.type === 'faq' && Array.isArray(e.faq)) {
      const list = e.faq
        .map((f, i) => ({ id: `faq_${i}`, category: f.category.trim(), question: f.question.trim(), answer: f.answer.trim() }))
        .filter((f) => f.question && f.answer && f.category)
        .slice(0, 14)
      patch.faq = list.length > 0 ? list : null
      applied.push({ label: 'FAQ' })
      setAnchor('faq')
      setPage('/faq')
    }
  }

  if (overridesTouched) {
    patch.copyOverrides = Object.keys(overrides).length > 0 ? overrides : null
  }

  if (applied.length === 0) {
    return { ok: false, error: 'I couldn’t turn that into an edit — try naming the section to change.' }
  }

  await db.update(clinicProfile).set(patch).where(eq(clinicProfile.organizationId, orgId))
  // Best-effort usage tracking (shares the website AI counter).
  void incrementAiUsage(orgId).catch(() => {})

  const page = resultPage ?? (envelope.page.startsWith('/') ? envelope.page : '/')
  return { ok: true, edits: applied, page, summary: envelope.summary.trim() || 'Updated your site', anchor }
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
