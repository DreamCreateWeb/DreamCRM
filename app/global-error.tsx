'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary — catches a crash in the ROOT layout itself (the only
 * thing a route-group error.tsx can't catch). It replaces the whole document,
 * so it renders its own <html>/<body> and uses INLINE styles only: if the root
 * layout failed, we can't assume the global stylesheet/theme is intact. Kept
 * deliberately minimal + dependency-free so it can't itself throw.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global error boundary]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          color: '#0f172a',
          padding: '1rem',
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: 384,
            width: '100%',
            textAlign: 'center',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              margin: '0 auto 20px',
              height: 48,
              width: 48,
              borderRadius: 9999,
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              lineHeight: 1,
              color: '#d97706',
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={() => {
              try {
                reset()
              } catch {
                /* ignore — fall through to a hard reload */
              }
              window.location.reload()
            }}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              color: '#fff',
              background: '#0d9488',
              border: 0,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
