import 'server-only'
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { ClaudeModel, ClaudeRequest } from './ai'

let cached: BedrockRuntimeClient | null = null
function client(): BedrockRuntimeClient {
  if (cached) return cached
  cached = new BedrockRuntimeClient({
    region: process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
  })
  return cached
}

// Inference-profile IDs (these models are INFERENCE_PROFILE-only on Bedrock).
// Overridable via env so we can switch regions/versions without a deploy.
const BEDROCK_MODEL_IDS: Record<ClaudeModel, string> = {
  sonnet: 'us.anthropic.claude-sonnet-4-6',
  haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
}

function modelId(model: ClaudeModel): string {
  const override = model === 'sonnet' ? process.env.BEDROCK_MODEL_SONNET : process.env.BEDROCK_MODEL_HAIKU
  return override ?? BEDROCK_MODEL_IDS[model]
}

interface NativeBody {
  anthropic_version: string
  max_tokens: number
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  thinking?: { type: 'enabled'; budget_tokens: number }
}

export async function runViaBedrock(req: ClaudeRequest): Promise<string | null> {
  const body: NativeBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: req.maxTokens,
    system: req.system,
    messages: req.messages,
  }
  // Bedrock has no "adaptive" mode; use a bounded budget that always leaves
  // room for the answer (floor 1024, and max_tokens must exceed it).
  if (req.thinking && req.maxTokens > 1536) {
    body.thinking = { type: 'enabled', budget_tokens: Math.min(req.maxTokens - 512, 2000) }
  }
  const out = await client().send(
    new InvokeModelCommand({
      modelId: modelId(req.model),
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    })
  )
  const decoded = JSON.parse(new TextDecoder().decode(out.body)) as {
    content?: Array<{ type?: string; text?: string }>
  }
  if (!Array.isArray(decoded.content)) return null
  const block = decoded.content.find((b) => b.type === 'text')
  return block?.text ?? null
}
