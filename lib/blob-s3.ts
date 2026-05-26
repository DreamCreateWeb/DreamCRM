import 'server-only'
import { randomBytes } from 'node:crypto'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'

export type UploadResult = {
  url: string
  downloadUrl: string
  pathname: string
  contentType: string
  contentDisposition: string
}

type UploadBody = Blob | ArrayBuffer | Buffer | ReadableStream | string

let cached: S3Client | null = null
function client(): S3Client {
  if (cached) return cached
  cached = new S3Client({ region: region() })
  return cached
}

function region(): string {
  return process.env.S3_REGION ?? process.env.AWS_REGION ?? 'us-east-1'
}

function bucket(): string {
  const b = process.env.S3_BUCKET
  if (!b) throw new Error('S3_BUCKET is not set')
  return b
}

// Base for the public object URL we persist. Defaults to the virtual-hosted
// S3 endpoint; set S3_PUBLIC_BASE_URL to a CloudFront / custom-domain origin
// later without touching call sites.
function publicBase(): string {
  const explicit = process.env.S3_PUBLIC_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  return `https://${bucket()}.s3.${region()}.amazonaws.com`
}

// Mirror Vercel Blob's addRandomSuffix so we never silently overwrite an
// object that happens to share a path. Suffix goes before the extension.
function withRandomSuffix(pathname: string): string {
  const rand = randomBytes(6).toString('hex')
  const slash = pathname.lastIndexOf('/')
  const dir = slash >= 0 ? pathname.slice(0, slash + 1) : ''
  const file = slash >= 0 ? pathname.slice(slash + 1) : pathname
  const dot = file.lastIndexOf('.')
  return dot > 0
    ? `${dir}${file.slice(0, dot)}-${rand}${file.slice(dot)}`
    : `${dir}${file}-${rand}`
}

async function toBody(
  body: UploadBody
): Promise<Buffer | Uint8Array | string | ReadableStream> {
  if (typeof body === 'string') return body
  if (Buffer.isBuffer(body)) return body
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return Buffer.from(body)
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer())
  return body
}

export async function uploadToS3(
  pathname: string,
  body: UploadBody,
  options: { contentType?: string; access?: 'public' } = {}
): Promise<UploadResult> {
  const key = withRandomSuffix(pathname)
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: await toBody(body),
      ContentType: options.contentType,
    })
  )
  const url = `${publicBase()}/${key}`
  const filename = key.slice(key.lastIndexOf('/') + 1)
  return {
    url,
    downloadUrl: url,
    pathname: key,
    contentType: options.contentType ?? 'application/octet-stream',
    contentDisposition: `inline; filename="${filename}"`,
  }
}

function keyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''))
    return key || null
  } catch {
    return null
  }
}

export async function deleteFromS3(url: string): Promise<void> {
  const key = keyFromUrl(url)
  if (!key) return
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}

export async function listFromS3(prefix?: string) {
  const out = await client().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix })
  )
  const base = publicBase()
  return {
    blobs: (out.Contents ?? []).map((o) => ({
      url: `${base}/${o.Key}`,
      pathname: o.Key ?? '',
      size: o.Size ?? 0,
      uploadedAt: o.LastModified ?? new Date(),
    })),
  }
}
