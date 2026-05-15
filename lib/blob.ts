import 'server-only'
import { put, del, list, type PutBlobResult } from '@vercel/blob'

export async function uploadBlob(
  pathname: string,
  body: Blob | ArrayBuffer | Buffer | ReadableStream | string,
  options: { contentType?: string; access?: 'public' } = {}
): Promise<PutBlobResult> {
  return put(pathname, body, {
    access: options.access ?? 'public',
    contentType: options.contentType,
    addRandomSuffix: true,
  })
}

export async function deleteBlob(url: string) {
  return del(url)
}

export async function listBlobs(prefix?: string) {
  return list({ prefix })
}
