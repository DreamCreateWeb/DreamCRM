'use client'

import { useState } from 'react'
import { Mail } from './inbox-body'

function Avatar({ name }: { name: string }) {
  return (
    <div className="rounded-full shrink-0 mr-3 w-10 h-10 bg-violet-200 dark:bg-violet-500/30 flex items-center justify-center font-semibold text-violet-700 dark:text-violet-200">
      {(name?.[0] ?? '?').toUpperCase()}
    </div>
  )
}

export default function MailItem({ mail }: { mail: Mail }) {
  const [open, setOpen] = useState<boolean>(mail.open)

  return (
    <div className="py-6">
      {/* Header */}
      <header className="flex items-start">
        {/* Avatar */}
        <Avatar name={mail.name} />
        {/* Meta */}
        <div className="grow">
          <div className="sm:flex items-start justify-between mb-0.5">
            {/* Message author */}
            <div className="xl:flex items-center mb-2 sm:mb-0">
              <button className="text-sm font-semibold text-gray-800 dark:text-gray-100 text-left truncate" onClick={() => setOpen(!open)}>{mail.name}</button>
              {open &&
                <>
                  <div className="text-sm text-gray-400 dark:text-gray-600 hidden xl:block mx-1">·</div>
                  <div className="text-xs dark:text-gray-500">{mail.email}</div>
                </>
              }
            </div>
            {/* Date */}
            <div className="text-xs font-medium text-gray-500 whitespace-nowrap mb-2 sm:mb-0">{mail.date}</div>
          </div>
          {/* To */}
          {open &&
            <div className="text-xs font-medium text-gray-500">To {mail.recipients.join(', ')}</div>
          }
          {/* Excerpt */}
          {!open &&
            <div className="text-sm">{mail.excerpt}</div>
          }
        </div>
      </header>
      {/* Body */}
      {open &&
        <div className="text-sm text-gray-800 dark:text-gray-100 mt-4 space-y-2" dangerouslySetInnerHTML={{ __html: mail.message }}></div>
      }
    </div>
  )
}