import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  allowedAttachmentHosts,
  isAllowedAttachmentUrl,
  sanitizeUploadedAttachments,
} from '@/lib/attachment-hosts'

/**
 * A message attachment must live on storage we control.
 *
 * `sanitizeAttachments` only ever required "some http(s) URL", and the portal
 * composer hands its list straight to the server action. So a patient could
 * attach `https://attacker.example/pixel.png`; the staff inbox renders
 * attachments as `<img src>`, so simply OPENING the thread reports back to the
 * attacker when the clinic read the message and from what IP — and the same
 * URL is what the OCR path would fetch, spending the clinic's AI allowance on
 * someone else's bytes.
 *
 * Bad entries are DROPPED, not rejected: the patient's actual message must
 * still go through.
 */

const ENV_KEYS = ['S3_BUCKET', 'S3_REGION', 'AWS_REGION', 'S3_PUBLIC_BASE_URL', 'ATTACHMENT_HOST_ALLOWLIST'] as const
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const k of ENV_KEYS) {
    const v = values[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  setEnv({ S3_BUCKET: 'dreamcrm-uploads-prod', S3_REGION: 'us-east-1' })
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k]
    else process.env[k] = ORIGINAL[k] as string
  }
})

describe('allowedAttachmentHosts', () => {
  it('derives the virtual-hosted S3 endpoint from the storage env', () => {
    expect(allowedAttachmentHosts()).toContain('dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com')
  })

  it('honours an explicit public base (CloudFront / custom origin)', () => {
    setEnv({ S3_BUCKET: 'b', S3_PUBLIC_BASE_URL: 'https://cdn.dreamcreatestudio.com/' })
    expect(allowedAttachmentHosts()).toContain('cdn.dreamcreatestudio.com')
  })

  it('accepts extra hosts from ATTACHMENT_HOST_ALLOWLIST, as bare hosts or URLs', () => {
    setEnv({ ATTACHMENT_HOST_ALLOWLIST: 'legacy.example.net, https://old-cdn.example.org/base/' })
    const hosts = allowedAttachmentHosts()
    expect(hosts).toContain('legacy.example.net')
    expect(hosts).toContain('old-cdn.example.org')
  })

  it('is empty (not wide open) when no storage env is configured', () => {
    setEnv({})
    expect(allowedAttachmentHosts()).toEqual([])
  })
})

describe('isAllowedAttachmentUrl', () => {
  it('accepts our own S3 bucket URL', () => {
    expect(isAllowedAttachmentUrl('https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/msg/a-1f2e.jpg')).toBe(true)
  })

  it('accepts a Vercel Blob store (the fallback driver)', () => {
    expect(isAllowedAttachmentUrl('https://abc123.public.blob.vercel-storage.com/msg/a.png')).toBe(true)
  })

  it('rejects an arbitrary outside host — the tracking-pixel case', () => {
    expect(isAllowedAttachmentUrl('https://attacker.example/pixel.png')).toBe(false)
    expect(isAllowedAttachmentUrl('http://198.51.100.7/track.gif')).toBe(false)
  })

  it('rejects a look-alike host that only ends with our name', () => {
    expect(isAllowedAttachmentUrl('https://evil-dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/x.png')).toBe(false)
    expect(isAllowedAttachmentUrl('https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com.evil.test/x.png')).toBe(false)
  })

  it('rejects a Vercel-Blob look-alike (suffix must be the real domain)', () => {
    expect(isAllowedAttachmentUrl('https://evil.public.blob.vercel-storage.com.attacker.test/x.png')).toBe(false)
    expect(isAllowedAttachmentUrl('https://public.blob.vercel-storage.com.evil.test/x.png')).toBe(false)
  })

  it('is not fooled by userinfo, port or path tricks', () => {
    expect(isAllowedAttachmentUrl('https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com@attacker.example/x.png')).toBe(false)
    expect(isAllowedAttachmentUrl('https://attacker.example/dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/x.png')).toBe(false)
  })

  it('rejects non-http(s) schemes and unparseable input', () => {
    expect(isAllowedAttachmentUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedAttachmentUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isAllowedAttachmentUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedAttachmentUrl('/relative/x.png')).toBe(false)
    expect(isAllowedAttachmentUrl('')).toBe(false)
  })

  it('matches the host case-insensitively', () => {
    expect(isAllowedAttachmentUrl('https://DreamCRM-Uploads-Prod.S3.us-east-1.AMAZONAWS.com/x.png')).toBe(true)
  })
})

describe('sanitizeUploadedAttachments', () => {
  const ours = 'https://dreamcrm-uploads-prod.s3.us-east-1.amazonaws.com/msg/x.jpg'

  it('keeps our attachments and drops the outside ones', () => {
    const out = sanitizeUploadedAttachments([
      { url: ours, name: 'x.jpg', contentType: 'image/jpeg' },
      { url: 'https://attacker.example/pixel.png', name: 'pixel', contentType: 'image/png' },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe(ours)
  })

  it('still enforces the shape rules it wraps', () => {
    const out = sanitizeUploadedAttachments([
      null,
      { url: 'javascript:alert(1)' },
      { url: ours, name: 'y'.repeat(500), contentType: 'z'.repeat(300) },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].name.length).toBe(200)
    expect(out[0].contentType.length).toBe(100)
  })

  it('returns [] for junk input', () => {
    expect(sanitizeUploadedAttachments(null)).toEqual([])
    expect(sanitizeUploadedAttachments('nope')).toEqual([])
  })

  it('drops everything when the storage env is unset — never fails open', () => {
    setEnv({})
    expect(sanitizeUploadedAttachments([{ url: 'https://attacker.example/p.png' }])).toEqual([])
  })
})
