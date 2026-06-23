import { isImageAttachment, type MessageAttachment } from '@/lib/types/messaging'

/**
 * Render image attachments inside a message bubble (clinic inbox + patient
 * portal share this). Each thumbnail links to the full-size S3 URL in a new
 * tab. Non-image entries (none in v1) fall back to a download link. Kept tiny
 * + presentational so both surfaces stay in visual sync.
 */
export function MessageAttachments({
  attachments,
  className = '',
}: {
  attachments: MessageAttachment[] | undefined
  className?: string
}) {
  if (!attachments || attachments.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {attachments.map((a, i) =>
        isImageAttachment(a) ? (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-[var(--r-sm)] ring-1 ring-inset ring-black/10 transition-opacity hover:opacity-90"
            title={a.name || 'Open image'}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- user upload on S3, not a build-time asset */}
            <img
              src={a.url}
              alt={a.name || 'Attached image'}
              loading="lazy"
              className="h-28 w-28 object-cover sm:h-32 sm:w-32"
            />
          </a>
        ) : (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-black/5 px-2 py-1 text-xs font-medium underline"
          >
            📎 {a.name || 'Attachment'}
          </a>
        ),
      )}
    </div>
  )
}
