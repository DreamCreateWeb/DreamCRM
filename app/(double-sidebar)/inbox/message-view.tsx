'use client'

import { useEffect } from 'react'
import { formatShortDate, formatTime } from '@/lib/utils'
import type { EmailMessage } from '@/lib/services/mailbox'
import { markMessage } from './mailbox-actions'

interface Props {
  message: EmailMessage | null
}

export default function MessageView({ message }: Props) {
  useEffect(() => {
    if (message && !message.isRead) {
      markMessage(message.id, true).catch(() => {})
    }
  }, [message])

  if (!message) {
    return (
      <div className="grow flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
        Select a message to read it.
      </div>
    )
  }

  return (
    <div className="grow overflow-y-auto">
      <div className="px-6 py-5 max-w-3xl">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-3">
          {message.subject ?? '(no subject)'}
        </h1>
        <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700/60">
          <div>
            <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
              {message.fromName ?? message.fromEmail}
            </div>
            {message.fromName && (
              <div className="text-xs text-gray-500 dark:text-gray-400">{message.fromEmail}</div>
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              To: {message.toEmails.join(', ')}
              {message.ccEmails.length > 0 && <> · Cc: {message.ccEmails.join(', ')}</>}
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right shrink-0">
            {formatShortDate(message.receivedAt)}
            <br />
            {formatTime(message.receivedAt)}
          </div>
        </div>
        {message.bodyHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            // Stripe-style emails arrive with their own styling; render as-is.
            // For production-hardening: sanitize with DOMPurify before shipping.
            dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200 font-sans">
            {message.bodyText ?? '(empty body)'}
          </pre>
        )}
      </div>
    </div>
  )
}
