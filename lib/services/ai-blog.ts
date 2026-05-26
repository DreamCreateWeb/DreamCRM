import 'server-only'
import { z } from 'zod'
import { runClaudeText, aiConfigured } from '@/lib/ai'
import { sanitizeBlogHtml } from '@/lib/blog-sanitize'

/**
 * AI assist for the clinic blog. Two surfaces, both clinician-gated — the
 * output NEVER auto-publishes. `draftBlogPost` fills the editor with a draft
 * the clinic reviews + edits before hitting Publish; `draftSocialCaption`
 * returns copy-out text for the clinic to paste into their own social tools.
 *
 * Why a hard review gate: dental content is YMYL ("Your Money or Your Life")
 * — Google holds it to the highest E-E-A-T bar and issues "scaled content
 * abuse" actions against unreviewed AI output. The whole point of this module
 * vs. the ProSites/RevenueWell content-library model is ORIGINAL, clinician-
 * approved posts. So the prompt is tuned to be accurate, anti-shame, and to
 * defer specifics to the dentist rather than make medical claims.
 *
 * Both swallow their own errors and return null so the editor degrades to
 * "AI unavailable" without breaking.
 */

const BLOG_VOICE = `You write blog posts for a dental clinic's own public website. The reader is a current or prospective patient — an adult who is not a dentist, often a little anxious about dental visits, looking for clear, trustworthy, practical information.

Voice: warm, calm, plain-spoken, genuinely helpful. Short sentences. First-person plural ("we", "our team"). Acknowledge that dental anxiety and shame are normal and that there's no judgment here (this is the clinic's brand voice). No marketing-bro hype — never use "revolutionary", "game-changing", "state-of-the-art", "world-class", "unlock", "supercharge". No exclamation marks. No emoji.

Accuracy + safety (this is health content):
- Be factually careful. Do not invent statistics, study citations, or specific success rates.
- Never give an individual diagnosis or promise a specific medical outcome.
- For anything that depends on the person's mouth, defer to an exam ("the best way to know is a quick visit", "your dentist can tell you what's right for you").
- Avoid absolute claims ("painless", "guaranteed", "100%").`

// ============================================================
// Draft a post from a topic
// ============================================================

const DraftSchema = z.object({
  title: z.string().min(1).max(160),
  excerpt: z.string().max(400),
  bodyHtml: z.string().min(1).max(60_000),
  category: z.string().max(80).optional().default(''),
  seoTitle: z.string().max(160).optional().default(''),
  seoDescription: z.string().max(320).optional().default(''),
})

export type DraftedBlogPost = z.infer<typeof DraftSchema>

const DRAFT_SYSTEM = `${BLOG_VOICE}

You produce a single blog post as JSON. Six fields:

1. "title" — a clear, specific, non-clickbait headline. Sentence case. Under 70 characters. No "Welcome to our practice", no "The Ultimate Guide".
2. "excerpt" — a one-to-two-sentence summary for the blog index card and meta description. Under 280 characters. Concrete, not teasing.
3. "bodyHtml" — the post body as semantic HTML, roughly 350-650 words. Use <p>, <h2>, <h3>, <ul>/<li>, <ol>/<li>, <strong>, <em>, and <a href="..."> only. No <h1> (the page renders the title separately). No inline styles, no class attributes, no <img>, no <script>, no <table>. Open with a short, reassuring paragraph. Use one or two <h2> subheads to break it up. End with a calm call to action inviting the reader to book a visit or call with questions.
4. "category" — one short label that fits the topic, e.g. "Oral Health", "Treatments", "Cosmetic", "Kids & Family", "Patient Resources".
5. "seoTitle" — title optimized for search, may append the kind of clinic, under 60 characters. Plain text.
6. "seoDescription" — meta description for search results, 120-160 characters, includes the main idea + a gentle reason to read.

OUTPUT FORMAT — respond with ONLY a single JSON object, nothing else, no markdown fence, no preamble:
{"title":"...","excerpt":"...","bodyHtml":"<p>...</p>","category":"...","seoTitle":"...","seoDescription":"..."}`

export async function draftBlogPost(topic: string): Promise<DraftedBlogPost | null> {
  if (!aiConfigured()) return null
  if (!topic.trim()) return null

  try {
    const out = await runClaudeText({
      model: 'sonnet',
      maxTokens: 3500,
      // Non-streaming + no extended thinking: a blog draft is a moderate,
      // structured output. Thinking inflated latency (~27s) and could spend
      // the whole token budget on the thinking block, returning no text block
      // (a silent null that surfaced as "AI unavailable"). One request/
      // response reliably returns the full JSON in ~20s.
      stream: false,
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Write a blog post on the topic below for our dental clinic. Output JSON only.\n\n<topic>\n${topic.slice(0, 2000)}\n</topic>`,
        },
      ],
    })
    if (!out) return null
    const raw = out.trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const parsed = DraftSchema.parse(JSON.parse(raw.slice(start, end + 1)))
    // Sanitize before it ever reaches the editor — defense in depth (the
    // service sanitizes again on save).
    return { ...parsed, bodyHtml: sanitizeBlogHtml(parsed.bodyHtml) }
  } catch (err) {
    console.warn('[ai.blog.draft] failed:', (err as Error).message)
    return null
  }
}

// ============================================================
// Draft a social caption from a published/drafted post
// ============================================================

const SOCIAL_SYSTEM = `${BLOG_VOICE}

You write a single short social-media caption that promotes one of the clinic's blog posts and links readers to it. Rules:
- Plain text only. No HTML, no markdown, no JSON.
- 1-3 short sentences, under 280 characters total.
- Warm and specific. Tease the value of the post without clickbait.
- You may end with up to 3 simple, relevant hashtags (e.g. #dentalhealth). No more.
- No emoji unless the topic obviously calls for one; default to none.
- Do not invent facts about the clinic.`

export async function draftSocialCaption(title: string, excerpt: string): Promise<string | null> {
  if (!aiConfigured()) return null
  if (!title.trim()) return null

  try {
    const out = await runClaudeText({
      model: 'haiku',
      maxTokens: 400,
      system: SOCIAL_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Write a social caption promoting this blog post. Output the caption text only.\n\nTitle: ${title.slice(0, 200)}\nSummary: ${excerpt.slice(0, 400)}`,
        },
      ],
    })
    return out ? out.trim() : null
  } catch (err) {
    console.warn('[ai.blog.social] failed:', (err as Error).message)
    return null
  }
}
