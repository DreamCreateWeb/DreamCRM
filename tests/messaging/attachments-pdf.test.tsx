import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/session', () => ({ getServerSession: vi.fn(async () => ({ user: { id: 'user_1' } })) }))
const uploaded: Array<{ path: string; contentType?: string }> = []
vi.mock('@/lib/blob', () => ({
  uploadBlob: vi.fn(async (path: string, _b: unknown, opts: { contentType?: string }) => {
    uploaded.push({ path, contentType: opts?.contentType })
    return { url: `https://cdn.example/${path}`, pathname: path }
  }),
}))

import { POST } from '@/app/api/upload/route'
import {
  HEIC_REJECTION,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_ATTACHMENT_TYPE_REJECTION,
  formatAttachmentSize,
  isPdfBytes,
  messageAttachmentRefusal,
} from '@/lib/upload-kinds'
import { sanitizeAttachments, isPdfAttachment } from '@/lib/types/messaging'
import { MessageAttachments } from '@/app/(double-sidebar)/messages/message-attachments'

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37] // %PDF-1.7

function post(parts: BlobPart[], name: string, type: string, folder: string) {
  const form = new FormData()
  form.set('file', new File(parts, name, { type }))
  form.set('folder', folder)
  return POST(new Request('http://x/api/upload', { method: 'POST', body: form }))
}

describe('message_attachment kind — /api/upload', () => {
  it('accepts a PDF in the message-attachments folder, stored as application/pdf', async () => {
    const res = await post([new Uint8Array(PDF), 'rest of the plan'], 'plan.pdf', 'application/pdf', 'message-attachments')
    expect(res.status).toBe(200)
    expect(uploaded.at(-1)?.contentType).toBe('application/pdf')
    expect(uploaded.at(-1)?.path).toMatch(/^message-attachments\/user_1\//)
  })

  it('trusts the bytes, not the declared type (a renamed non-PDF is refused)', async () => {
    const res = await post(['<html>hi</html>'], 'plan.pdf', 'application/pdf', 'message-attachments')
    expect(res.status).toBe(415)
  })

  it('does NOT take a PDF in any other folder', async () => {
    const res = await post([new Uint8Array(PDF)], 'plan.pdf', 'application/pdf', 'clinic-logos')
    expect(res.status).toBe(415)
  })

  it('refuses HEIC in words that name the fix', async () => {
    const heic = new Uint8Array(32)
    'ftypheic'.split('').forEach((c, i) => (heic[4 + i] = c.charCodeAt(0)))
    const res = await post([heic], 'IMG.heic', 'image/heic', 'message-attachments')
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe(HEIC_REJECTION)
    expect(HEIC_REJECTION).toMatch(/JPEG/)
  })

  it('caps a message attachment at 10 MB', async () => {
    const big = new Uint8Array(MESSAGE_ATTACHMENT_MAX_BYTES + 1)
    big.set(PDF)
    const res = await post([big], 'big.pdf', 'application/pdf', 'message-attachments')
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/10MB/)
  })

  it('refuses a video in the message folder', async () => {
    const mp4 = new Uint8Array(32)
    'ftypisom'.split('').forEach((c, i) => (mp4[4 + i] = c.charCodeAt(0)))
    const res = await post([mp4], 'a.mp4', 'video/mp4', 'message-attachments')
    expect(res.status).toBe(415)
    expect((await res.json()).error).toBe(MESSAGE_ATTACHMENT_TYPE_REJECTION)
  })
})

describe('messageAttachmentRefusal (browser pre-check)', () => {
  it('lets a PDF and a JPEG go; names the fix for HEIC; names the cap', async () => {
    expect(await messageAttachmentRefusal(new File([new Uint8Array(PDF)], 'a.pdf', { type: 'application/pdf' }))).toBeNull()
    expect(await messageAttachmentRefusal(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(await messageAttachmentRefusal(new File(['x'], 'a.heic', { type: '' }))).toBe(HEIC_REJECTION)
    expect(await messageAttachmentRefusal(new File(['x'], 'a.docx', { type: 'application/msword' }))).toBe(
      MESSAGE_ATTACHMENT_TYPE_REJECTION,
    )
    const big = new File([new Uint8Array(MESSAGE_ATTACHMENT_MAX_BYTES + 1)], 'big.pdf', { type: 'application/pdf' })
    expect(await messageAttachmentRefusal(big)).toMatch(/over 10 MB/)
  })

  it('isPdfBytes / formatAttachmentSize', () => {
    expect(isPdfBytes(new Uint8Array(PDF))).toBe(true)
    expect(isPdfBytes(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false)
    expect(formatAttachmentSize(412 * 1024)).toBe('412 KB')
    expect(formatAttachmentSize(1.3 * 1024 * 1024)).toBe('1.3 MB')
  })
})

describe('the document chip', () => {
  const pdf = { url: 'https://cdn.example/plan.pdf', name: 'Treatment plan.pdf', contentType: 'application/pdf', size: 412 * 1024 }

  it('keeps size through the sanitizer and recognises a PDF', () => {
    const [a] = sanitizeAttachments([pdf])
    expect(a.size).toBe(412 * 1024)
    expect(isPdfAttachment(a)).toBe(true)
  })

  it('renders filename + size + Open, with no inline preview', () => {
    const { container } = render(<MessageAttachments attachments={[pdf]} />)
    expect(screen.getByText('Treatment plan.pdf')).toBeTruthy()
    expect(screen.getByText('412 KB')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
    expect(container.querySelector('img, iframe, embed, object')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href')).toBe(pdf.url)
  })
})
