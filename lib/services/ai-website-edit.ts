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
// anything the AI changes here is exactly what a manual edit would change.
const COPY_KEYS: { key: string; label: string; fallback: string }[] = [
  { key: 'home.differenceHeadline', label: 'Homepage section headline ("A full range of care…")', fallback: 'A full range of care for all your needs.' },
  { key: 'home.differenceTitle', label: 'Homepage "difference" section title', fallback: 'The difference is in how it feels.' },
  { key: 'home.teamGalleryTitle', label: 'Homepage team-gallery headline', fallback: 'The faces behind your care.' },
  { key: 'home.teamHeading', label: 'Homepage "care that puts you first" headline', fallback: 'A team that truly listens.' },
  { key: 'home.teamBlurb', label: 'Homepage "care that puts you first" blurb', fallback: 'Modern dentistry meets a gentler chairside touch.' },
  { key: 'home.callout.0.title', label: 'Homepage trust callout 1 title', fallback: 'Experienced clinicians' },
  { key: 'home.callout.0.body', label: 'Homepage trust callout 1 body', fallback: '' },
  { key: 'home.callout.1.title', label: 'Homepage trust callout 2 title', fallback: 'Science-based care' },
  { key: 'home.callout.1.body', label: 'Homepage trust callout 2 body', fallback: '' },
  { key: 'home.callout.2.title', label: 'Homepage trust callout 3 title', fallback: 'Outcomes, not quotas' },
  { key: 'home.callout.2.body', label: 'Homepage trust callout 3 body', fallback: '' },
  { key: 'home.callout.3.title', label: 'Homepage trust callout 4 title', fallback: 'Modern infection control' },
  { key: 'home.callout.3.body', label: 'Homepage trust callout 4 body', fallback: '' },
  { key: 'home.testimonialsTitle', label: 'Homepage reviews section headline', fallback: '' },
  { key: 'home.insuranceTitle', label: 'Homepage insurance band headline', fallback: '' },
  { key: 'home.insuranceIntro', label: 'Homepage insurance band intro', fallback: '' },
  { key: 'home.locationTitle', label: 'Homepage location section headline', fallback: '' },
  { key: 'home.contactTitle', label: 'Homepage contact section headline', fallback: "We'd love to see you." },
  { key: 'home.contactIntro', label: 'Homepage contact section intro', fallback: '' },
  { key: 'home.blogTitle', label: 'Homepage blog section headline', fallback: 'From the blog' },
]

export interface AppliedEdit {
  label: string
}

export type AiEditResult =
  | { ok: true; edits: AppliedEdit[]; page: string; summary: string }
  | { ok: false; error: string }

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const EditItem = z.object({
  type: z.enum(['field', 'brandColor', 'copy', 'chips', 'carriers', 'stats']),
  field: z.string().optional(),
  key: z.string().optional(),
  value: z.string().optional(),
  items: z.array(z.string()).optional(),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
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
  const copy = COPY_KEYS.map((c) => ({
    key: c.key,
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
  - "copy": key is one of the editableHeadings keys from the context; value is the new text.
  - "chips": items is the COMPLETE new list of short "why us" highlight chips.
  - "carriers": items is the COMPLETE new list of accepted insurance carrier names.
  - "stats": stats is the COMPLETE new list (max 3) of {value, label} trust stats.
- For lists (chips/carriers/stats) always return the full list, not just additions — start from the current values in the context and apply the change.
- Never invent verifiable facts: no fake review counts, prices, years, awards, or carriers the owner didn't mention. Stats stay qualitative ("Same-week", "Most insurance accepted") unless the owner gives a real number.
- Set "page" to the site path most affected so the canvas can show it ("/" for anything on the homepage, which is most edits).
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
          type: { type: 'string', enum: ['field', 'brandColor', 'copy', 'chips', 'carriers', 'stats'] },
          field: { type: 'string', description: 'For type=field: tagline | about | displayName | phone | email.' },
          key: { type: 'string', description: 'For type=copy: an editableHeadings key.' },
          value: { type: 'string', description: 'New text (or hex color for brandColor).' },
          items: { type: 'array', items: { type: 'string' }, description: 'Full new list for chips/carriers.' },
          stats: {
            type: 'array',
            description: 'Full new list for stats (max 3).',
            items: {
              type: 'object',
              properties: { value: { type: 'string' }, label: { type: 'string' } },
              required: ['value', 'label'],
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
  const knownCopy = new Map(COPY_KEYS.map((c) => [c.key, c.label]))

  for (const e of envelope.edits) {
    if (e.type === 'field' && e.field && FIELD_COLS.has(e.field) && typeof e.value === 'string') {
      const v = e.value.trim()
      ;(patch as Record<string, unknown>)[e.field] = v || null
      applied.push({ label: labelForField(e.field) })
    } else if (e.type === 'brandColor' && e.value && HEX.test(e.value.trim())) {
      patch.brandColor = e.value.trim()
      applied.push({ label: 'Brand color' })
    } else if (e.type === 'copy' && e.key && knownCopy.has(e.key) && typeof e.value === 'string') {
      overrides[e.key] = e.value
      overridesTouched = true
      applied.push({ label: knownCopy.get(e.key)! })
    } else if (e.type === 'chips' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 8)
      patch.differenceChips = list.length > 0 ? list : null
      applied.push({ label: '“Why us” highlights' })
    } else if (e.type === 'carriers' && Array.isArray(e.items)) {
      const list = e.items.map((s) => s.trim()).filter(Boolean).slice(0, 40)
      patch.acceptedInsuranceCarriers = list.length > 0 ? list : null
      applied.push({ label: 'Insurance carriers' })
    } else if (e.type === 'stats' && Array.isArray(e.stats)) {
      const list = e.stats
        .slice(0, 3)
        .map((s, i) => ({ id: `stat_${i}`, value: s.value.trim(), label: s.label.trim() }))
        .filter((s) => s.value && s.label)
      patch.stats = list.length > 0 ? list : null
      applied.push({ label: 'Trust stats' })
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

  const page = envelope.page.startsWith('/') ? envelope.page : '/'
  return { ok: true, edits: applied, page, summary: envelope.summary.trim() || 'Updated your site' }
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
