import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

export type ClaudeModel = 'sonnet' | 'haiku'

export interface ClaudeRequest {
  model: ClaudeModel
  maxTokens: number
  system: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Higher-quality reasoning for long generations. Maps to adaptive
   * thinking on Anthropic and a bounded thinking budget on Bedrock. */
  thinking?: boolean
  /** Stream the response (default true). Streaming avoids the SDK HTTP
   * timeout on very long generations, but the streamed SSE can come back
   * without a usable text block over some egress paths; set false for
   * moderate-length structured outputs (e.g. a blog draft) to use one
   * request/response that reliably returns the full message. */
  stream?: boolean
}

function driver(): 'anthropic' | 'bedrock' {
  return process.env.AI_DRIVER === 'bedrock' ? 'bedrock' : 'anthropic'
}

/** True when the active driver has what it needs to make a call. The
 * Bedrock path authenticates via IAM, so it's considered configured
 * whenever it's selected; the Anthropic path needs its API key. */
export function aiConfigured(): boolean {
  if (driver() === 'bedrock') return true
  return !!process.env.ANTHROPIC_API_KEY
}

const ANTHROPIC_MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
}

/**
 * Run a single-turn Claude request and return the first text block's text
 * (or null if there was none). Streams internally on the Anthropic path so
 * long generations don't trip the SDK HTTP timeout. Throws on transport /
 * API errors — callers wrap in try/catch and degrade to null.
 */
export async function runClaudeText(req: ClaudeRequest): Promise<string | null> {
  if (driver() === 'bedrock') {
    const { runViaBedrock } = await import('./ai-bedrock')
    return runViaBedrock(req)
  }
  return runViaAnthropic(req)
}

let cachedAnthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic
  cachedAnthropic = new Anthropic()
  return cachedAnthropic
}

function extractText(final: Anthropic.Message): string | null {
  const block = final.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') {
    // No text block — e.g. the budget was spent on a thinking block, or the
    // stream returned incomplete. Log it so this can never be a silent null.
    console.warn('[ai] response had no text block', {
      stopReason: final.stop_reason,
      blockTypes: final.content.map((b) => b.type),
    })
    return null
  }
  return block.text
}

async function runViaAnthropic(req: ClaudeRequest): Promise<string | null> {
  if (req.stream === false) {
    const final = await anthropic().messages.create({
      model: ANTHROPIC_MODEL_IDS[req.model],
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      ...(req.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
    })
    return extractText(final)
  }
  const stream = anthropic().messages.stream({
    model: ANTHROPIC_MODEL_IDS[req.model],
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
    ...(req.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
  })
  return extractText(await stream.finalMessage())
}
