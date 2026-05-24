import { describe, it, expect, beforeEach, vi } from 'vitest'

const h = vi.hoisted(() => ({
  streamFinal: vi.fn(),
  bedrockRun: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (_params: unknown) => ({ finalMessage: h.streamFinal }),
    }
  },
}))
vi.mock('@/lib/ai-bedrock', () => ({ runViaBedrock: h.bedrockRun }))

import { runClaudeText, aiConfigured } from '@/lib/ai'

beforeEach(() => {
  h.streamFinal.mockReset()
  h.bedrockRun.mockReset()
  h.streamFinal.mockResolvedValue({ content: [{ type: 'text', text: 'ANTHROPIC_REPLY' }] })
  h.bedrockRun.mockResolvedValue('BEDROCK_REPLY')
  delete process.env.AI_DRIVER
  delete process.env.ANTHROPIC_API_KEY
})

describe('aiConfigured', () => {
  it('is false on the Anthropic driver with no API key', () => {
    expect(aiConfigured()).toBe(false)
  })

  it('is true on the Anthropic driver when the key is present', () => {
    process.env.ANTHROPIC_API_KEY = 'k'
    expect(aiConfigured()).toBe(true)
  })

  it('is true on the Bedrock driver regardless of the key (IAM auth)', () => {
    process.env.AI_DRIVER = 'bedrock'
    expect(aiConfigured()).toBe(true)
  })
})

describe('runClaudeText dispatch', () => {
  it('uses the Anthropic SDK by default and returns the first text block', async () => {
    const out = await runClaudeText({
      model: 'sonnet',
      maxTokens: 100,
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(out).toBe('ANTHROPIC_REPLY')
    expect(h.bedrockRun).not.toHaveBeenCalled()
  })

  it('routes to Bedrock when AI_DRIVER=bedrock', async () => {
    process.env.AI_DRIVER = 'bedrock'
    const out = await runClaudeText({
      model: 'haiku',
      maxTokens: 64,
      system: 's',
      messages: [{ role: 'user', content: 'x' }],
    })
    expect(out).toBe('BEDROCK_REPLY')
    expect(h.bedrockRun).toHaveBeenCalledOnce()
    expect(h.streamFinal).not.toHaveBeenCalled()
  })
})
