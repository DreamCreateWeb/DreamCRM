'use client'

import { useState, useRef, useEffect } from 'react'
import { INTERVIEW_QUESTIONS } from '@/lib/types/onboarding-interview'
import { runOnboardingDraft } from './actions'

type Phase = 'asking' | 'drafting' | 'error'

/**
 * The conversational onboarding interview (Website Studio Phase 3). A warm,
 * scripted chat: we ask ~7 fixed questions, the clinic answers in their own
 * words, then ONE AI pass drafts the whole site (tagline / about / stats / FAQ
 * / services) and drops them into the in-place Studio to refine. Free + never
 * counted against the AI allowance. Skippable at any point.
 */
export default function WelcomeInterview() {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [value, setValue] = useState('')
  const [phase, setPhase] = useState<Phase>('asking')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const total = INTERVIEW_QUESTIONS.length
  const q = INTERVIEW_QUESTIONS[index]
  const isLast = index === total - 1

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    inputRef.current?.focus()
  }, [index, phase])

  function goToStudio() {
    window.location.assign('/website')
  }

  async function submitAnswer(skip = false) {
    if (phase !== 'asking') return
    const answer = skip ? '' : value.trim()
    const nextAnswers = { ...answers, [q.id]: answer }
    setAnswers(nextAnswers)
    setValue('')
    if (!isLast) {
      setIndex((i) => i + 1)
      return
    }
    setPhase('drafting')
    setError(null)
    const res = await runOnboardingDraft(nextAnswers)
    if (res.ok) {
      goToStudio()
    } else {
      setError(res.error)
      setPhase('error')
    }
  }

  // ── Drafting takeover ──────────────────────────────────────────────────
  if (phase === 'drafting') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="w-10 h-10 rounded-full border-2 border-stone-300 border-t-stone-800 animate-spin mb-6" />
        <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
          Writing your website…
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm">
          We&apos;re drafting your tagline, about, services, and FAQ from what you told us. This
          takes a few seconds — then you can tweak anything, live.
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-100 mb-2">
          Let&apos;s pick it up in the editor
        </h2>
        <p className="text-sm text-stone-500 dark:text-stone-400 max-w-sm mb-6">
          We couldn&apos;t auto-draft just now ({error}). No problem — you can write everything
          yourself in the editor, with AI help section by section.
        </p>
        <button
          type="button"
          onClick={goToStudio}
          className="btn bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900"
        >
          Open the website editor →
        </button>
      </div>
    )
  }

  // ── Conversational asking ──────────────────────────────────────────────
  const answered = INTERVIEW_QUESTIONS.slice(0, index)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 mb-3">
        <span className="text-[12px] font-semibold uppercase tracking-wider text-stone-400">
          Question {index + 1} of {total}
        </span>
        <button
          type="button"
          onClick={goToStudio}
          className="text-[12px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
        >
          Skip — I&apos;ll write it myself
        </button>
      </div>

      <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden mb-5">
        <div
          className="h-full bg-stone-800 dark:bg-stone-200 transition-all duration-300"
          style={{ width: `${(index / total) * 100}%` }}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4 min-h-[16rem]">
        {answered.map((aq) => (
          <div key={aq.id} className="space-y-2">
            <Bubble who="bot">{aq.prompt}</Bubble>
            {answers[aq.id]?.trim() ? (
              <Bubble who="user">{answers[aq.id]}</Bubble>
            ) : (
              <Bubble who="user" muted>
                (skipped)
              </Bubble>
            )}
          </div>
        ))}
        <Bubble who="bot">{q.prompt}</Bubble>
        {q.hint && <p className="text-[12px] text-stone-400 pl-1">{q.hint}</p>}
      </div>

      <div className="border-t border-stone-200 dark:border-stone-700/60 pt-4">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submitAnswer(false)
            }
          }}
          rows={3}
          placeholder={q.placeholder ?? 'Type your answer…'}
          className="form-textarea w-full text-sm resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={() => void submitAnswer(true)}
            className="text-[13px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            Skip this question
          </button>
          <button
            type="button"
            onClick={() => void submitAnswer(false)}
            disabled={!value.trim()}
            className="btn-sm bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 disabled:opacity-40"
          >
            {isLast ? 'Draft my website →' : 'Next'}
          </button>
        </div>
        <p className="text-[11px] text-stone-400 mt-2 text-center">
          Press Enter to continue · Shift+Enter for a new line
        </p>
      </div>
    </div>
  )
}

function Bubble({
  who,
  children,
  muted,
}: {
  who: 'bot' | 'user'
  children: React.ReactNode
  muted?: boolean
}) {
  if (who === 'bot') {
    return (
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-stone-100 dark:bg-stone-800 px-4 py-2.5 text-sm text-stone-800 dark:text-stone-100">
        {children}
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <div
        className={`max-w-[85%] rounded-2xl rounded-tr-sm bg-stone-800 dark:bg-stone-200 px-4 py-2.5 text-sm text-white dark:text-stone-900 ${
          muted ? 'italic opacity-60' : ''
        }`}
      >
        {children}
      </div>
    </div>
  )
}
