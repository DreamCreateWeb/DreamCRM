import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  sent: [] as Array<{ input: Record<string, any> }>,
  content: [{ type: 'text', text: 'BEDROCK_REPLY' }] as unknown,
}))

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  class BedrockRuntimeClient {
    constructor(public cfg: unknown) {}
    async send(cmd: { input: Record<string, unknown> }) {
      h.sent.push(cmd as { input: Record<string, any> })
      return { body: new TextEncoder().encode(JSON.stringify({ content: h.content })) }
    }
  }
  class InvokeModelCommand {
    constructor(public input: Record<string, unknown>) {}
  }
  return { BedrockRuntimeClient, InvokeModelCommand }
})

import { runViaBedrock } from '@/lib/ai-bedrock'

function lastBody() {
  return JSON.parse(h.sent[h.sent.length - 1].input.body as string)
}

beforeEach(() => {
  h.sent.length = 0
  h.content = [{ type: 'text', text: 'BEDROCK_REPLY' }]
  delete process.env.BEDROCK_MODEL_SONNET
  delete process.env.BEDROCK_MODEL_HAIKU
})

describe('runViaBedrock', () => {
  it('builds the native Anthropic body and returns the first text block', async () => {
    const out = await runViaBedrock({
      model: 'haiku',
      maxTokens: 64,
      system: 'classify this',
      messages: [{ role: 'user', content: 'hello' }],
    })
    expect(out).toBe('BEDROCK_REPLY')
    expect(h.sent[0].input.modelId).toBe('us.anthropic.claude-haiku-4-5-20251001-v1:0')
    const body = lastBody()
    expect(body.anthropic_version).toBe('bedrock-2023-05-31')
    expect(body.max_tokens).toBe(64)
    expect(body.system).toBe('classify this')
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(body.thinking).toBeUndefined()
  })

  it('maps sonnet + thinking to a bounded budget that leaves room for output', async () => {
    await runViaBedrock({
      model: 'sonnet',
      maxTokens: 4000,
      thinking: true,
      system: 's',
      messages: [{ role: 'user', content: 'draft' }],
    })
    expect(h.sent[0].input.modelId).toBe('us.anthropic.claude-sonnet-4-6')
    expect(lastBody().thinking).toEqual({ type: 'enabled', budget_tokens: 2000 })
  })

  it('caps the thinking budget below max_tokens for mid-size requests', async () => {
    await runViaBedrock({
      model: 'sonnet',
      maxTokens: 2000,
      thinking: true,
      system: 's',
      messages: [{ role: 'user', content: 'rewrite' }],
    })
    expect(lastBody().thinking).toEqual({ type: 'enabled', budget_tokens: 1488 })
  })

  it('omits thinking when max_tokens is too small to fit a budget', async () => {
    await runViaBedrock({
      model: 'sonnet',
      maxTokens: 64,
      thinking: true,
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(lastBody().thinking).toBeUndefined()
  })

  it('honors model-id env overrides', async () => {
    process.env.BEDROCK_MODEL_SONNET = 'global.anthropic.claude-sonnet-4-6'
    await runViaBedrock({
      model: 'sonnet',
      maxTokens: 100,
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(h.sent[0].input.modelId).toBe('global.anthropic.claude-sonnet-4-6')
  })

  it('returns null when the response has no text block', async () => {
    h.content = [{ type: 'thinking', thinking: 'only reasoning, no text' }]
    const out = await runViaBedrock({
      model: 'haiku',
      maxTokens: 64,
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(out).toBeNull()
  })
})
