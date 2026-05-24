import 'server-only'
import { put, del, list } from '@vercel/blob'
import type { UploadResult } from './blob-s3'

export type { UploadResult }

// Storage backend switch. Defaults to Vercel Blob; set STORAGE_DRIVER=s3
// (with S3_BUCKET + AWS creds in env) to route uploads to S3 instead. The
// S3 module is lazy-imported so it never loads on the Vercel path.
function useS3(): boolean {
  return process.env.STORAGE_DRIVER === 's3'
}

export async function uploadBlob(
  pathname: string,
  body: Blob | ArrayBuffer | Buffer | ReadableStream | string,
  options: { contentType?: string; access?: 'public' } = {}
): Promise<UploadResult> {
  if (useS3()) {
    const { uploadToS3 } = await import('./blob-s3')
    return uploadToS3(pathname, body, options)
  }
  return put(pathname, body, {
    access: options.access ?? 'public',
    contentType: options.contentType,
    addRandomSuffix: true,
  })
}

export async function deleteBlob(url: string) {
  if (useS3()) {
    const { deleteFromS3 } = await import('./blob-s3')
    return deleteFromS3(url)
  }
  return del(url)
}

export async function listBlobs(prefix?: string) {
  if (useS3()) {
    const { listFromS3 } = await import('./blob-s3')
    return listFromS3(prefix)
  }
  return list({ prefix })
}
