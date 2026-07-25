// Client-side XHR upload helper with progress + cancel.
//
// `fetch` can't report upload progress, so the studio/staff/image uploaders use
// XHR via this shared helper to show a live percentage and offer a cancel. It
// posts to the auth-gated /api/upload route (same contract as the old fetch
// path) and resolves the stored URL. Surfaces server errors (status text or the
// JSON `error`) so failures are never swallowed silently.

import { downscaleImageFile } from './image-downscale'

export interface UploadHandle {
  /** Resolves with the stored URL on success; rejects on error/cancel. */
  promise: Promise<string>
  /** Abort the in-flight upload (rejects the promise with an "aborted" error). */
  cancel: () => void
}

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled')
    this.name = 'UploadCancelledError'
  }
}

/**
 * Upload one file to /api/upload, reporting progress as 0–100. Returns a handle
 * carrying the result promise + a cancel function. The caller validates type/
 * size BEFORE calling (so it can show field-specific copy); this just does the
 * transfer.
 */
export function uploadFileWithProgress(
  file: File,
  folder: string,
  onProgress?: (pct: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest()
  // Cancel can land during the (async) downscale, before the request is ever
  // sent — `xhr.abort()` is a no-op on an unsent request and would never fire
  // `onabort`, leaving the promise hanging. Track it and reject directly.
  let cancelled = false
  let sent = false
  let rejectHandle: ((err: Error) => void) | null = null
  const promise = new Promise<string>((resolve, reject) => {
    rejectHandle = reject
    xhr.open('POST', '/api/upload')
    xhr.responseType = 'json'

    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // responseType:'json' parses for us; fall back to text parse if a proxy
        // stripped the content-type.
        let body = xhr.response as { url?: string; error?: string } | null
        if (!body && typeof xhr.responseText === 'string') {
          try {
            body = JSON.parse(xhr.responseText)
          } catch {
            body = null
          }
        }
        if (body?.url) {
          onProgress?.(100)
          resolve(body.url)
        } else {
          reject(new Error(body?.error ?? 'Upload failed'))
        }
      } else {
        const body = xhr.response as { error?: string } | null
        reject(new Error(body?.error ?? `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'))
    xhr.onabort = () => reject(new UploadCancelledError())

    // Shrink oversized photos BEFORE the transfer — a 32 MP camera original is
    // minutes of upload on office wifi and nothing renders it above ~1200px
    // (lib/image-downscale.ts). Always resolves; a failure just sends the
    // original, so this can never block an upload.
    void downscaleImageFile(file).then((prepared) => {
      if (cancelled) return
      const fd = new FormData()
      fd.set('file', prepared)
      fd.set('folder', folder)
      sent = true
      xhr.send(fd)
    })
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
      if (sent) xhr.abort()
      else rejectHandle?.(new UploadCancelledError())
    },
  }
}
