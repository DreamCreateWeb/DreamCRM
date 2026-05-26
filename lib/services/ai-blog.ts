import 'server-only'
import { z } from 'zod'
import { runClaudeText, runClaudeJson, aiConfigured } from '@/lib/ai'
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

Write a single blog post on the user's topic and return it by calling the emit_blog_post tool with every field filled in. Follow each field's description exactly. The body must be valid semantic HTML using only the allowed tags, and must end with a calm call to action inviting the reader to book a visit or call with questions.`

// JSON schema for the tool input. Using tool use (structured output) instead
// of asking for raw JSON means the SDK returns a parsed object — no hand-
// parsing, so HTML with embedded quotes in bodyHtml can't break it.
const BLOG_TOOL_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description:
        'Clear, specific, non-clickbait headline. Sentence case, under 70 characters. No "Welcome to our practice", no "The Ultimate Guide".',
    },
    excerpt: {
      type: 'string',
      description:
        'A one-to-two-sentence summary for the blog index card and meta description. Under 280 characters. Concrete, not teasing.',
    },
    bodyHtml: {
      type: 'string',
      description:
        'The post body as semantic HTML, roughly 350-650 words. Use only these tags: <p>, <h2>, <h3>, <ul>/<li>, <ol>/<li>, <strong>, <em>, <a href>. No <h1> (the page renders the title separately). No inline styles, no class attributes, no <img>, no <script>, no <table>. Open with a short, reassuring paragraph and use one or two <h2> subheads.',
    },
    category: {
      type: 'string',
      description:
        'One short label that fits the topic, e.g. "Oral Health", "Treatments", "Cosmetic", "Kids & Family", "Patient Resources".',
    },
    seoTitle: {
      type: 'string',
      description: 'Title optimized for search, under 60 characters. Plain text.',
    },
    seoDescription: {
      type: 'string',
      description:
        'Meta description for search results, 120-160 characters, includes the main idea plus a gentle reason to read.',
    },
  },
  required: ['title', 'excerpt', 'bodyHtml', 'category', 'seoTitle', 'seoDescription'],
}

export async function draftBlogPost(topic: string): Promise<DraftedBlogPost | null> {
  if (!aiConfigured()) return null
  if (!topic.trim()) return null

  try {
    const input = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 3500,
      system: DRAFT_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Write a blog post on the topic below for our dental clinic.\n\n<topic>\n${topic.slice(0, 2000)}\n</topic>`,
        },
      ],
      toolName: 'emit_blog_post',
      toolDescription: 'Return the finished blog post for the clinic website.',
      inputSchema: BLOG_TOOL_SCHEMA,
    })
    if (!input) return null
    const parsed = DraftSchema.parse(input)
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

// ============================================================
// Topic ideation — the Content Engine's "never stare at a blank page" engine
// ============================================================

const TopicIdeaSchema = z.object({
  title: z.string().min(1).max(160),
  angle: z.string().max(300),
  category: z.string().max(80),
  targetQuery: z.string().max(160).optional().default(''),
})
export type BlogTopicIdea = z.infer<typeof TopicIdeaSchema>

const IDEATION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    ideas: {
      type: 'array',
      description: 'The list of distinct blog post ideas.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'A specific, non-generic headline (not "10 Tips"). Sentence case, under 70 chars.' },
          angle: { type: 'string', description: 'One sentence on what the post covers + why it helps this clinic’s patients.' },
          category: { type: 'string', description: 'e.g. "Oral Health", "Treatments", "Cosmetic", "Kids & Family", "Patient Resources".' },
          targetQuery: { type: 'string', description: 'The patient search query this post should answer.' },
        },
        required: ['title', 'angle', 'category'],
      },
    },
  },
  required: ['ideas'],
}

const IDEATION_SYSTEM = `${BLOG_VOICE}

You propose a batch of ORIGINAL blog post ideas tailored to one specific dental clinic — tied to the services they actually offer, their town, and the time of year. These must be ideas a real local practice would write, not generic syndicated filler.

Rules:
- Every idea must be distinct and specific. No duplicates, no "10 Tips for a Healthy Smile" listicle filler.
- Bias toward real patient questions, seasonal/awareness hooks, and the clinic's specific services and locality.
- Keep titles concrete and human. Each idea answers a real search query.
Return them by calling the emit_topic_ideas tool.`

// A light seasonal / dental-awareness hint so ideas feel timely.
function seasonHint(now = new Date()): string {
  const m = now.getMonth() // 0-11
  const hints = [
    'January — New Year fresh-start + dental-resolution season',
    'February — National Children’s Dental Health Month',
    'March — spring, ahead of summer smiles',
    'April — spring cleaning + Oral Cancer Awareness Month',
    'May — graduation + wedding season (cosmetic interest)',
    'June — summer break, good time for kids’ visits',
    'July — mid-summer',
    'August — back-to-school checkups',
    'September — back-to-school + Dental Hygiene Month soon',
    'October — Halloween candy + National Dental Hygiene Month',
    'November — end-of-year insurance benefits expiring',
    'December — holidays + use-your-benefits-before-they-reset',
  ]
  return hints[m]
}

export async function suggestBlogTopics(input: {
  services: string[]
  city?: string | null
  state?: string | null
  count?: number
}): Promise<BlogTopicIdea[] | null> {
  if (!aiConfigured()) return null
  const count = Math.min(Math.max(input.count ?? 6, 1), 10)
  const where = [input.city, input.state].filter(Boolean).join(', ')
  const services = input.services.filter(Boolean).length
    ? input.services.filter(Boolean).join(', ')
    : 'general, cosmetic, and family dentistry'

  try {
    const result = await runClaudeJson({
      model: 'sonnet',
      maxTokens: 2500,
      system: IDEATION_SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `Propose ${count} original blog post ideas for our dental clinic.\n` +
            `Services we offer: ${services}.\n` +
            (where ? `We're located in ${where}.\n` : '') +
            `Right now it's ${seasonHint()}.\n` +
            `Return them with the emit_topic_ideas tool.`,
        },
      ],
      toolName: 'emit_topic_ideas',
      toolDescription: 'Return a list of original, clinic-specific blog post ideas.',
      inputSchema: IDEATION_SCHEMA,
    })
    if (!result) return null
    const parsed = z.object({ ideas: z.array(TopicIdeaSchema) }).parse(result)
    return parsed.ideas.slice(0, count)
  } catch (err) {
    console.warn('[ai.blog.ideas] failed:', (err as Error).message)
    return null
  }
}
