'use client'

import { useState, useTransition } from 'react'
import Modal from '@/components/ui/modal'
import type { EmailAccountSummary } from '@/lib/services/mailbox'
import { ActionButton } from '@/components/ui/action-button'
import { sendMailbox } from './mailbox-actions'

interface Props {
  accounts: EmailAccountSummary[]
}

export default function ComposeButton({ accounts }: Props) {
  const [open, setOpen] = useState(false)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  function reset() {
    setTo('')
    setCc('')
    setSubject('')
    setBody('')
    setError(null)
    setOk(false)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      try {
        await sendMailbox({ accountId, to, cc, subject, body })
        setOk(true)
        setTimeout(() => {
          setOpen(false)
          reset()
        }, 800)
      } catch (err) {
        setError((err as Error).message)
      }
    })
  }

  return (
    <>
      {/* The mailbox sidebar's single primary action. */}
      <ActionButton
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={accounts.length === 0}
      >
        Compose
      </ActionButton>
      <Modal open={open} onClose={() => {
            setOpen(false)
            reset()
          }} blocking={pending} labelledBy="modal-title" size="xl">
                <div className="px-5 py-4 border-b border-[color:var(--color-hairline)]">
                  <h2 id="modal-title" className="font-semibold text-gray-800 dark:text-gray-100">New message</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-3">
                    {accounts.length > 1 && (
                      <div>
                        <label htmlFor="compose-button-from" className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <select
                          id="compose-button-from"
                          className="form-select w-full"
                          value={accountId}
                          onChange={(e) => setAccountId(e.target.value)}
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.emailAddress}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label htmlFor="compose-button-to" className="block text-xs font-medium text-gray-500 mb-1">To</label>
                      <input
                        id="compose-button-to"
                        className="form-input w-full"
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        placeholder="someone@example.com (comma-separated for multiple)"
                      />
                    </div>
                    <div>
                      <label htmlFor="compose-button-cc" className="block text-xs font-medium text-gray-500 mb-1">Cc</label>
                      <input
                        id="compose-button-cc"
                        className="form-input w-full"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="optional"
                      />
                    </div>
                    <div>
                      <label htmlFor="compose-button-subject" className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                      <input
                        id="compose-button-subject"
                        className="form-input w-full"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="compose-button-message" className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                      <textarea
                        id="compose-button-message"
                        className="form-textarea w-full"
                        rows={10}
                        required
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                    </div>
                    {error && (
                      <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded" role="alert">
                        {error}
                      </div>
                    )}
                    {ok && (
                      <div className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-3 py-2 rounded" role="status">
                        Sent.
                      </div>
                    )}
                  </div>
                  <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end gap-2">
                    <ActionButton
                      variant="secondary"
                      onClick={() => {
                        setOpen(false)
                        reset()
                      }}
                    >
                      Cancel
                    </ActionButton>
                    {/* The modal's single primary action. */}
                    <ActionButton
                      variant="primary"
                      type="submit"
                      pending={pending}
                      disabled={!accountId || !to || !subject || !body}
                    >
                      Send
                    </ActionButton>
                  </div>
                </form>
                    </Modal>
    </>
  )
}
