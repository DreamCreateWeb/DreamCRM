'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { PageFrame } from '@/components/ui/page-frame'
import { ActionButton } from '@/components/ui/action-button'
import { StatusPill } from '@/components/ui/status-pill'
import { EmptyState } from '@/components/ui/empty-state'
import { ProgressRing } from '@/components/ui/progress-ring'
import Modal from '@/components/ui/modal'
import { TONE_DOT } from '@/lib/ui/encodings'
import {
  needsPrepCount,
  todaySummary,
  type HuddleDayView,
  type HuddleLine,
  type HuddleView,
  type HuddleVisitView,
} from '@/lib/huddle'

/**
 * THE HUDDLE's page (docs/daily-tools.md, slice H1) — the team's morning
 * meeting in the order a team would run it: how the last working day went,
 * today patient by patient, the next day on the books, and what is waiting.
 *
 * It is a REPORT (DESIGN.md's test): nothing here is operated. The two
 * controls change only how it is shown —
 *
 *  - PRESENT puts it on the whole screen in type a room can read. It is the
 *    app's ONE Modal primitive at its `screen` size, so the focus trap, the
 *    scroll lock and Escape are the same ones every other dialog uses.
 *  - HIDE DETAILS shortens names to "Maria R." and drops amounts and
 *    medical detail from the flags, for a screen a patient could see. The
 *    choice is remembered on this device only.
 */

const QUIET_KEY = 'dc:huddle:hide-details'

function readQuiet(): boolean {
  try {
    return window.localStorage.getItem(QUIET_KEY) === '1'
  } catch {
    return false
  }
}

function writeQuiet(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(QUIET_KEY, '1')
    else window.localStorage.removeItem(QUIET_KEY)
  } catch {
    // Private mode or blocked storage: the switch still works for this visit.
  }
}

interface Show {
  /** Names shortened, amounts and medical detail left out. */
  quiet: boolean
  /** Room-sized type; nothing is a link (nobody clicks a wall). */
  big: boolean
}

export default function HuddleBoard({
  view,
  clinicName,
  pmsConnected,
}: {
  view: HuddleView
  clinicName: string
  /** Is practice software feeding the schedule? Decides what an empty day says. */
  pmsConnected: boolean
}) {
  const [presenting, setPresenting] = useState(false)
  const [quiet, setQuiet] = useState(false)

  // The remembered choice is read after mount: the server cannot know it,
  // and guessing would flash full names on a screen set to hide them… so the
  // first paint is the server's (details shown) only where nobody chose.
  useEffect(() => {
    setQuiet(readQuiet())
  }, [])

  const toggleQuiet = useCallback(() => {
    setQuiet((was) => {
      writeQuiet(!was)
      return !was
    })
  }, [])

  const startPresenting = useCallback(() => {
    setPresenting(true)
    // The browser's own full screen, where it has one. Best-effort: the
    // overlay already covers the app, so a refusal changes nothing.
    try {
      void document.documentElement.requestFullscreen?.()?.catch(() => {})
    } catch {
      // Not available here (an iPhone, an embedded view).
    }
  }, [])

  const stopPresenting = useCallback(() => {
    setPresenting(false)
    try {
      if (document.fullscreenElement) void document.exitFullscreen?.()?.catch(() => {})
    } catch {
      // Nothing to leave.
    }
  }, [])

  const body = (show: Show) => (
    <div className={show.big ? 'space-y-8' : 'space-y-5'}>
      {view.recap && (
        <Section title={view.recap.isYesterday ? 'Yesterday' : 'Last time in'} sub={view.recap.dayLabel} show={show}>
          <Lines lines={view.recap.lines} show={show} />
        </Section>
      )}

      <TodaySection day={view.today} show={show} pmsConnected={pmsConnected} />

      {view.next && <NextSection day={view.next} isTomorrow={view.next.isTomorrow} show={show} />}

      <Section title="Before you go" show={show}>
        {view.headsUp.length > 0 ? (
          <Lines lines={view.headsUp} show={show} />
        ) : (
          <p className={`${show.big ? 'text-xl' : 'text-sm'} text-gray-600 dark:text-gray-400`}>
            Nothing else is waiting on the team.
          </p>
        )}
      </Section>
    </div>
  )

  return (
    <>
      <PageFrame
        group="Daily"
        clinicName={clinicName}
        title="The Huddle"
        subtitle={`${view.today.dayLabel} · ${todaySummary(view.today)}`}
        actions={
          <>
            <ActionButton variant="secondary" onClick={toggleQuiet}>
              {quiet ? 'Show details' : 'Hide details'}
            </ActionButton>
            {/* The page's one primary: the meeting itself. */}
            <ActionButton variant="primary" onClick={startPresenting}>
              Present
            </ActionButton>
          </>
        }
      >
        <SourceNote view={view} />
        {body({ quiet, big: false })}
      </PageFrame>

      {presenting && (
        <Presenting
          clinicName={clinicName}
          dayLabel={view.today.dayLabel}
          asOf={view.asOf}
          quiet={quiet}
          onToggleQuiet={toggleQuiet}
          onExit={stopPresenting}
        >
          {body({ quiet, big: true })}
        </Presenting>
      )}
    </>
  )
}

/** Law 2 — where the page's facts come from, and how old the read is. */
function SourceNote({ view }: { view: HuddleView }) {
  return (
    <p className="mb-5 text-sm text-gray-600 dark:text-gray-400" data-huddle-source>
      As of {view.asOf}. {view.source.text}
      {view.source.href && view.source.cta && (
        <>
          {' '}
          <Link href={view.source.href} className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 underline underline-offset-2">
            {view.source.cta}
          </Link>
        </>
      )}
    </p>
  )
}

function Section({
  title,
  sub,
  aside,
  show,
  children,
}: {
  title: string
  sub?: string
  aside?: ReactNode
  show: Show
  children: ReactNode
}) {
  return (
    <section className={`v2-card ${show.big ? 'p-8' : 'p-5'}`} aria-label={title}>
      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${show.big ? 'mb-5' : 'mb-3'}`}>
        <h2 className={`${show.big ? 'text-3xl' : 'text-base'} font-bold text-gray-900 dark:text-gray-100`}>
          {title}
          {sub && (
            <span className={`ml-2 font-normal ${show.big ? 'text-xl' : 'text-sm'} text-gray-600 dark:text-gray-400`}>{sub}</span>
          )}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A recap or heads-up line: a tone mark, the sentence, and its door. */
function Lines({ lines, show }: { lines: HuddleLine[]; show: Show }) {
  return (
    <ul className={show.big ? 'space-y-3' : 'space-y-2'}>
      {lines.map((l) => (
        <li key={l.key} className="flex items-start gap-3">
          {/* The dot repeats the tone the sentence already states — decorative. */}
          <span
            aria-hidden="true"
            data-tone={l.tone}
            className={`shrink-0 rounded-full ${show.big ? 'mt-3 h-3 w-3' : 'mt-1.5 h-2 w-2'} ${TONE_DOT[l.tone]}`}
          />
          <p className={`min-w-0 ${show.big ? 'text-2xl' : 'text-sm'} text-gray-800 dark:text-gray-100`}>
            {show.quiet && l.quiet ? l.quiet : l.text}
            {!show.big && l.href && l.cta && (
              <>
                {' '}
                <Link href={l.href} className="font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400 underline underline-offset-2">
                  {l.cta}
                </Link>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}

function VisitRow({ visit, show }: { visit: HuddleVisitView; show: Show }) {
  const name = show.quiet ? visit.shortName : visit.name
  const meta = visit.provider ? `${visit.type} · ${visit.provider}` : visit.type
  return (
    <li className={`flex items-start ${show.big ? 'gap-6 py-4' : 'gap-3 py-3'}`} data-visit-state={visit.state}>
      <span
        className={`shrink-0 pt-0.5 font-mono-num tabular-nums text-gray-600 dark:text-gray-400 ${show.big ? 'w-32 text-2xl' : 'w-[4.5rem] text-sm'}`}
      >
        {visit.time}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {show.big ? (
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{name}</span>
          ) : (
            <Link href={`/patients/${visit.patientId}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline">
              {name}
            </Link>
          )}
          <span className={`${show.big ? 'text-xl' : 'text-sm'} text-gray-600 dark:text-gray-400`}>{meta}</span>
          {visit.state === 'done' && <StatusPill tone="ok" label="Seen" size={show.big ? 'lg' : 'sm'} />}
          {visit.state === 'no_show' && <StatusPill tone="urgent" label="Didn’t make it" size={show.big ? 'lg' : 'sm'} />}
        </div>
        {visit.flags.length > 0 && (
          <ul className={`flex flex-wrap ${show.big ? 'mt-3 gap-2.5' : 'mt-1.5 gap-1.5'}`}>
            {visit.flags.map((f) => {
              const pill = <StatusPill tone={f.tone} label={show.quiet ? f.quiet : f.label} size={show.big ? 'lg' : 'sm'} wrap />
              return (
                <li key={f.key} className="max-w-full">
                  {!show.big && f.href ? (
                    <Link href={f.href} className="hover:underline">
                      {pill}
                    </Link>
                  ) : (
                    pill
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </li>
  )
}

function Tally({ day, show }: { day: HuddleDayView; show: Show }) {
  if (day.tally.length === 0) return null
  return (
    <ul className={`flex flex-wrap ${show.big ? 'mb-5 gap-2.5' : 'mb-3 gap-1.5'}`} aria-label="What the day holds">
      {day.tally.map((t) => (
        <li key={t.key}>
          <StatusPill tone={t.tone} label={t.text} size={show.big ? 'lg' : 'sm'} />
        </li>
      ))}
    </ul>
  )
}

function TodaySection({ day, show, pmsConnected }: { day: HuddleDayView; show: Show; pmsConnected: boolean }) {
  const ahead = day.visits.filter((v) => v.state === 'ahead')
  const ready = ahead.length - needsPrepCount(ahead)
  const readyLabel = `${ready} of ${ahead.length} ready`
  return (
    <Section
      title="Today"
      sub={day.dayLabel}
      show={show}
      aside={
        ahead.length > 0 ? (
          // The page's one heartbeat (law 7): how much of the day is ready.
          <span className="inline-flex items-center gap-2">
            <ProgressRing value={ready} max={ahead.length} size={show.big ? 56 : 40} label={readyLabel} />
            <span className={`${show.big ? 'text-xl' : 'text-sm'} font-medium text-gray-800 dark:text-gray-100`}>{readyLabel}</span>
          </span>
        ) : undefined
      }
    >
      {day.visits.length === 0 ? (
        pmsConnected ? (
          <EmptyState
            icon="🌤️"
            title="Nothing on the books today"
            body="A quiet one. When a visit is booked for today it shows here, patient by patient."
            action={
              <ActionButton variant="secondary" size="sm" href="/appointments?new=1">
                Book a visit
              </ActionButton>
            }
          />
        ) : (
          <EmptyState
            icon="🗓️"
            title="No visits booked here for today"
            body="Today’s full schedule lives in your practice software. Connect it and every patient shows here before the first one walks in."
            action={
              <ActionButton variant="secondary" size="sm" href="/integrations/pms">
                Connect your practice software
              </ActionButton>
            }
          />
        )
      ) : (
        <>
          <Tally day={day} show={show} />
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {day.visits.map((v) => (
              <VisitRow key={v.id} visit={v} show={show} />
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

function NextSection({ day, isTomorrow, show }: { day: HuddleDayView; isTomorrow: boolean; show: Show }) {
  const prep = day.visits.filter((v) => v.flags.some((f) => f.tone === 'warn'))
  const settled = day.visits.length - prep.length
  const n = day.visits.length
  return (
    <Section
      title={isTomorrow ? 'Tomorrow' : 'Next on the books'}
      sub={`${day.dayLabel} · ${n} ${n === 1 ? 'visit' : 'visits'}`}
      show={show}
      aside={
        show.big ? undefined : (
          <Link href={isTomorrow ? '/appointments?window=tomorrow' : '/appointments?window=this_week'} className="text-sm font-medium text-teal-700 hover:text-teal-800 dark:text-teal-400">
            Open the agenda →
          </Link>
        )
      }
    >
      {prep.length === 0 ? (
        <p className={`${show.big ? 'text-2xl' : 'text-sm'} text-gray-800 dark:text-gray-100`}>
          {n === 1 ? 'The one visit is ready' : `All ${n} are ready`} — confirmed, forms in, nothing owed.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[color:var(--color-hairline)]">
            {prep.map((v) => (
              <VisitRow key={v.id} visit={v} show={show} />
            ))}
          </ul>
          {settled > 0 && (
            <p className={`${show.big ? 'mt-4 text-xl' : 'mt-2 text-sm'} text-gray-600 dark:text-gray-400`}>
              The other {settled} {settled === 1 ? 'is' : 'are'} all set.
            </p>
          )}
        </>
      )}
    </Section>
  )
}

/** The whole-screen read for the meeting — the Modal primitive at `screen`. */
function Presenting({
  clinicName,
  dayLabel,
  asOf,
  quiet,
  onToggleQuiet,
  onExit,
  children,
}: {
  clinicName: string
  dayLabel: string
  asOf: string
  quiet: boolean
  onToggleQuiet: () => void
  onExit: () => void
  children: ReactNode
}) {
  // Leaving the BROWSER's full screen (its own Escape never reaches the
  // page) leaves Present too — otherwise the overlay would sit there
  // looking like a frozen app.
  useEffect(() => {
    let wasFull = Boolean(document.fullscreenElement)
    const onChange = () => {
      const isFull = Boolean(document.fullscreenElement)
      if (wasFull && !isFull) onExit()
      wasFull = isFull
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [onExit])

  return (
    <Modal open onClose={onExit} size="screen" label="The Huddle, on the big screen" backdropClose={false}>
      <div className="mx-auto w-full max-w-[110rem] px-6 py-8 sm:px-10" data-huddle-presenting>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">{clinicName}</p>
            <p className="text-5xl font-extrabold text-gray-900 dark:text-gray-100">The Huddle</p>
            <p className="mt-1 text-2xl text-gray-600 dark:text-gray-400">
              {dayLabel} · as of {asOf}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton variant="secondary" onClick={onToggleQuiet}>
              {quiet ? 'Show details' : 'Hide details'}
            </ActionButton>
            <ActionButton variant="primary" onClick={onExit}>
              Done
            </ActionButton>
          </div>
        </div>
        {children}
      </div>
    </Modal>
  )
}
