import { formatAttachmentSize } from '@/lib/upload-kinds'
import type { MessageAttachment } from '@/lib/types/messaging'

/**
 * A document (a PDF treatment plan, an EOB) riding a message thread: the
 * filename, its size and an "Open" door. NEVER previewed inline — the file
 * opens in its own tab. Shared by the staff panel and the patient portal so a
 * document reads the same on both sides of the thread.
 */
export function DocumentChip({
  attachment,
  className = '',
}: {
  attachment: MessageAttachment
  className?: string
}) {
  const name = attachment.name?.trim() || 'Document.pdf'
  const size = attachment.size ? formatAttachmentSize(attachment.size) : ''
  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      data-document-chip
      aria-label={`Open ${name}`}
      className={`inline-flex max-w-full items-center gap-2 rounded-[var(--r-sm)] bg-black/5 px-2.5 py-1.5 text-xs font-medium ring-1 ring-inset ring-black/10 transition-opacity hover:opacity-90 ${className}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
        <path d="M14 3v5h5" strokeLinejoin="round" />
      </svg>
      <span className="min-w-0 truncate">{name}</span>
      {size && <span className="shrink-0 opacity-80">{size}</span>}
      <span className="shrink-0 underline">Open</span>
    </a>
  )
}
