import { describe, it, expect, vi, beforeEach } from 'vitest'

const sent: Array<{ __kind: string; input: Record<string, unknown> }> = []

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    constructor(public config: unknown) {}
    async send(cmd: { __kind: string; input: Record<string, unknown> }) {
      sent.push(cmd)
      if (cmd.__kind === 'list') {
        return {
          Contents: [{ Key: 'a/b.png', Size: 12, LastModified: new Date('2026-01-01') }],
        }
      }
      return {}
    }
  }
  class PutObjectCommand {
    __kind = 'put'
    constructor(public input: Record<string, unknown>) {}
  }
  class DeleteObjectCommand {
    __kind = 'delete'
    constructor(public input: Record<string, unknown>) {}
  }
  class ListObjectsV2Command {
    __kind = 'list'
    constructor(public input: Record<string, unknown>) {}
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command }
})

import { uploadToS3, deleteFromS3, listFromS3 } from '@/lib/blob-s3'

beforeEach(() => {
  sent.length = 0
  process.env.S3_BUCKET = 'test-bucket'
  process.env.S3_REGION = 'us-east-1'
  delete process.env.S3_PUBLIC_BASE_URL
})

describe('uploadToS3', () => {
  it('puts to the bucket with a random-suffixed key and returns a public URL', async () => {
    const res = await uploadToS3('logos/u1/123-logo.png', Buffer.from('x'), {
      contentType: 'image/png',
    })
    expect(sent).toHaveLength(1)
    const input = sent[0].input
    expect(input.Bucket).toBe('test-bucket')
    expect(input.ContentType).toBe('image/png')
    // dir + base preserved; -<12 hex> inserted before the extension
    expect(input.Key).toMatch(/^logos\/u1\/123-logo-[0-9a-f]{12}\.png$/)
    expect(res.url).toBe(`https://test-bucket.s3.us-east-1.amazonaws.com/${input.Key as string}`)
    expect(res.downloadUrl).toBe(res.url)
    expect(res.pathname).toBe(input.Key)
    expect(res.contentType).toBe('image/png')
  })

  it('handles a key with no extension and defaults the content type', async () => {
    const res = await uploadToS3('uploads/u1/file', 'data')
    expect(sent[0].input.Key).toMatch(/^uploads\/u1\/file-[0-9a-f]{12}$/)
    expect(res.contentType).toBe('application/octet-stream')
  })

  it('converts a Blob body to bytes before sending', async () => {
    await uploadToS3('x/y.txt', new Blob(['hello']), { contentType: 'text/plain' })
    const body = sent[0].input.Body as Buffer
    expect(Buffer.isBuffer(body)).toBe(true)
    expect(body.toString()).toBe('hello')
  })

  it('honors S3_PUBLIC_BASE_URL (e.g. a CloudFront origin) without changing keys', async () => {
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/'
    const res = await uploadToS3('a/b.png', Buffer.from('x'))
    expect(res.url).toMatch(/^https:\/\/cdn\.example\.com\/a\/b-[0-9a-f]{12}\.png$/)
  })
})

describe('deleteFromS3', () => {
  it('parses the key out of a public URL and deletes it', async () => {
    await deleteFromS3('https://test-bucket.s3.us-east-1.amazonaws.com/logos/u1/x-abc.png')
    expect(sent).toHaveLength(1)
    expect(sent[0].__kind).toBe('delete')
    expect(sent[0].input.Key).toBe('logos/u1/x-abc.png')
  })

  it('no-ops on an unparseable url', async () => {
    await deleteFromS3('not a url')
    expect(sent).toHaveLength(0)
  })
})

describe('listFromS3', () => {
  it('maps S3 objects into the {blobs:[...]} shape', async () => {
    const out = await listFromS3('a/')
    expect(sent[0].input.Prefix).toBe('a/')
    expect(out.blobs[0].url).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/a/b.png')
    expect(out.blobs[0].pathname).toBe('a/b.png')
    expect(out.blobs[0].size).toBe(12)
  })
})
