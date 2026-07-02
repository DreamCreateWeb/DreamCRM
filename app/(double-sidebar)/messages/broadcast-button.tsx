'use client'

import { Fragment, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogPanel, Transition, TransitionChild } from '@headlessui/react'
import { ActionButton } from '@/components/ui/action-button'
import {
  BROADCAST_BODY_MAX,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_SEGMENTS,
  type BroadcastSegmentKey,
} from '@/lib/types/broadcast'
import { broadcastPreviewAction, sendBroadcastAction } from './clinic-actions'

/**
 * The inbox megaphone: "office closed today" to a quick segment, in one shot.
 * Each recipient gets an email through the normal outbound rails and the
 * message lands in their conversation thread — replies come right back here.
 * Owner/admin only (the button isn't rendered for members; the action
 * re-checks server-side).
 */
export default function BroadcastButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<Record<BroadcastSegmentKey, number> | null>(null)
  const [segment, setSegment] = useState<BroadcastSegmentKey | null>(null)
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ sent: number; failed: number } | null>(null)

  // Segment counts load when the modal opens (cheap; four counted queries).
  useEffect(() => {
    if (!open || counts) return
    broadcastPreviewAction().then((r) => {
      if (r.ok) setCounts(r.counts)
      else setError(r.error)
    })
  }, [open, counts])

  function close() {
    setOpen(false)
    setError(null)
    setDone(null)
    setBody('')
    setSegment(null)
    setCounts(null)
  }

  function onSend() {
    if (!segment) return
    setError(null)
    startTransition(async () => {
      const r = await sendBroadcastAction({ segment, body })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setDone({ sent: r.sent, failed: r.failed })
      router.refresh()
    })
  }

  const selectedCount = segment && counts ? counts[segment] : null
  const overCap = selectedCount != null && selectedCount > BROADCAST_MAX_RECIPIENTS

  return (
    <>
      <ActionButton variant="secondary" size="sm" onClick={() => setOpen(true)}>
        📣 Broadcast
      </ActionButton>
      <Transition show={open} as={Fragment}>
        <Dialog onClose={close} className="relative z-50">
          <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0">
            <div className="fixed inset-0 bg-gray-900/60" />
          </TransitionChild>
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <TransitionChild as={Fragment} enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
              <DialogPanel className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/60">
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Broadcast a message</h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    One message, emailed to everyone in the segment — it lands in each patient’s
                    conversation here, so replies come straight back to this inbox.
                  </p>
                </div>

                {done ? (
                  <div className="px-5 py-6">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      Sent to {done.sent} {done.sent === 1 ? 'patient' : 'patients'}.
                      {done.failed > 0 && (
                        <span className="text-amber-600 dark:text-amber-400"> {done.failed} couldn’t be delivered — their threads show the details.</span>
                      )}
                    </p>
                    <div className="mt-4 flex justify-end">
                      <ActionButton variant="primary" size="sm" onClick={close}>Done</ActionButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="px-5 py-4 space-y-4">
                      <fieldset>
                        <legend className="block text-sm font-medium mb-1.5">Who gets it</legend>
                        <div className="space-y-1.5">
                          {BROADCAST_SEGMENTS.map((s) => (
                            <label
                              key={s.key}
                              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer ${
                                segment === s.key
                                  ? 'border-teal-400 bg-teal-500/5'
                                  : 'border-gray-200 dark:border-gray-700/60 hover:border-teal-300'
                              }`}
                            >
                              <input
                                type="radio"
                                name="broadcast-segment"
                                className="form-radio mt-0.5"
                                checked={segment === s.key}
                                onChange={() => setSegment(s.key)}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">
                                  {s.label}
                                  {counts ? (
                                    <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400 tabular-nums">
                                      · {counts[s.key]}
                                    </span>
                                  ) : (
                                    <span className="ml-1.5 text-xs font-normal text-gray-400">· …</span>
                                  )}
                                </span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{s.hint}</span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label htmlFor="broadcast-body" className="block text-sm font-medium mb-1">
                          The message
                        </label>
                        <textarea
                          id="broadcast-body"
                          className="form-textarea w-full"
                          rows={4}
                          maxLength={BROADCAST_BODY_MAX}
                          placeholder="We’re closed today due to weather — we’ll reach out to reschedule. Reply here with any questions."
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                        />
                        <p className="mt-1 text-[11px] text-gray-400 tabular-nums">
                          {body.length}/{BROADCAST_BODY_MAX}
                        </p>
                      </div>
                      {overCap && (
                        <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 px-3 py-2 rounded" role="alert">
                          That segment is {selectedCount!.toLocaleString()} people — for a send that
                          size, use a Recall &amp; Outreach campaign (it adds the unsubscribe footer
                          and tracking a big send needs).
                        </div>
                      )}
                      {error && (
                        <div className="text-sm text-rose-700 dark:text-rose-300 bg-rose-500/10 px-3 py-2 rounded" role="alert">
                          {error}
                        </div>
                      )}
                    </div>
                    <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700/60 flex justify-end space-x-2">
                      <ActionButton variant="secondary" size="sm" onClick={close}>Cancel</ActionButton>
                      {/* The modal's single primary action — the count IS the confirmation. */}
                      <ActionButton
                        variant="primary"
                        size="sm"
                        onClick={onSend}
                        disabled={pending || !segment || !body.trim() || overCap || selectedCount === 0}
                      >
                        {pending
                          ? 'Sending…'
                          : selectedCount != null
                            ? `Send to ${selectedCount} ${selectedCount === 1 ? 'patient' : 'patients'}`
                            : 'Send'}
                      </ActionButton>
                    </div>
                  </>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
