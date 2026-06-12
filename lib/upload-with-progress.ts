// Client-side XHR upload helper with progress + cancel.
//
// `fetch` can't report upload progress, so the studio/staff/image uploaders use
// XHR via this shared helper to show a live percentage and offer a cancel. It
// posts to the auth-gated /api/upload route (same contract as the old fetch
// path) and resolves the stored URL. Surfaces server errors (status text or the
// JSON `error`) so failures are never swallowed silently.

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
  const promise = new Promise<string>((resolve, reject) => {
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

    const fd = new FormData()
    fd.set('file', file)
    fd.set('folder', folder)
    xhr.send(fd)
  })

  return { promise, cancel: () => xhr.abort() }
}
