'use client'

import { Fragment, useState, useTransition } from 'react'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
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
      <Transition show={open} as={Fragment}>
        <Dialog
          onClose={() => {
            setOpen(false)
            reset()
          }}
          className="relative z-50"
        >
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="bg-[color:var(--color-surface-2)] rounded-[var(--r-lg)] shadow-[var(--shadow-modal)] max-w-2xl w-full">
                <div className="px-5 py-4 border-b border-[color:var(--color-hairline)]">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">New message</h2>
                </div>
                <form onSubmit={onSubmit}>
                  <div className="px-5 py-4 space-y-3">
                    {accounts.length > 1 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                        <select
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                      <input
                        className="form-input w-full"
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        placeholder="someone@example.com (comma-separated for multiple)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Cc</label>
                      <input
                        className="form-input w-full"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        placeholder="optional"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                      <input
                        className="form-input w-full"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                      <textarea
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
                      disabled={pending || !accountId || !to || !subject || !body}
                    >
                      {pending ? 'Sending…' : 'Send'}
                    </ActionButton>
                  </div>
                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
