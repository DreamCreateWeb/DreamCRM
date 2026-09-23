import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * `deliver()` has a DEADLINE (DREAMCRM-89).
 *
 * Before this, no transport had one: the Gmail token fetch and send, SES and
 * Resend all ran to the default socket timeout. Harmless while every
 * patient-facing caller fired and forgot — #599 put an AWAITED send inside the
 * public booking action (`submitBookingRequest`), so a hung provider became a
 * patient sitting on a spinner after their visit was already committed, and
 * `not_sent` — the state whose copy tells them to save their details — was only
 * reachable at the socket timeout.
 *
 * Most of these drive a transport that NEVER SETTLES. Against the code as it
 * stood before this change each of those hangs until vitest's own test timeout
 * (watched: 6 failed / 2 passed, every failure "Test timed out in 20000ms"),
 * which is the defect stated as a test. The two that passed then are the two
 * that pin what must NOT change: a prompt send is untouched, and a real
 * provider rejection still surfaces as itself rather than as a timeout.
 *
 * ---------------------------------------------------------------------------
 * THE CLOCK IS FAKE NOW (DREAMCRM-117), AND THE ASSERTIONS GOT STRONGER FOR IT.
 *
 * As written this file raced a REAL 120ms `setTimeout` and asked whether the
 * call came back inside `BUDGET_MS * 6`. That is two defects wearing one
 * shape:
 *
 *   1. IT LOST ONCE, on a loaded CI worker — six vitest workers on a two-core
 *      runner, and 720ms of wall clock is not a promise anybody can make about
 *      a `setTimeout` that has to be scheduled behind them.
 *   2. THE TOLERANCE WAS THE TEST. `< 6x the budget` passes for a deadline of
 *      120ms and equally for one of 700ms, and it passes for a call that spends
 *      the budget once and for one that spends it twice — which is precisely
 *      the regression the "bounds the WHOLE call" case exists to catch. The
 *      slack that kept the flake rare was the same slack that blunted it.
 *
 * The fix is not a larger constant. It is a clock this file owns: `setTimeout`,
 * `clearTimeout` and `Date` are faked, and each case advances the clock itself
 * until the call settles. Every number below is then an EQUALITY — the deadline
 * fires at 120ms, Gmail's half at 60, and the whole call costs one budget and
 * not two — and none of them can be moved by how busy the runner is.
 *
 * Only those three are faked. `queueMicrotask` and `process.nextTick` stay
 * real, because `deliver()` reaches its Gmail tier through a dynamic
 * `import()`: faking the microtask queue would stop the module ever resolving
 * and turn three of these into a hang for a brand-new reason.
 *
 * RE-WATCHED AGAINST THE DEFECT ON THE NEW CLOCK, because a rewrite of the
 * instrument invalidates the reading the old one took (§2d). Replacing the
 * race in `withDeadline` with a bare `return await pending` — the code as it
 * stood before DREAMCRM-89 — gives 7 failed / 2 passed, and every failure now
 * names the defect in a sentence at ~3s instead of timing out at 20s. The two
 * survivors are the same two as before, and they are the point: a prompt send
 * and a real provider rejection must not change.
 *
 * A second mutation covers what the old tolerance could not see at all:
 * giving Gmail `remainingMs()` instead of half the budget reddens two cases
 * immediately. Under `< BUDGET_MS * 6` it was green.
 */
const mocks = vi.hoisted(() => ({
  resendSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  sesSend: vi.fn<(msg: unknown) => Promise<unknown>>(),
  gmailToken: vi.fn<(id: string) => Promise<string>>(),
  gmailSend: vi.fn<(token: string, msg: unknown) => Promise<unknown>>(),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.resendSend }
  },
}))
vi.mock('@/lib/ses', () => ({ sendEmailViaSes: mocks.sesSend }))
vi.mock('@/lib/services/gmail', () => ({
  getAccessToken: mocks.gmailToken,
  sendMessage: mocks.gmailSend,
}))

import { deliver } from '@/lib/email'

/** A promise that never settles — a provider that accepted the socket and went
 *  quiet, which is the failure this deadline exists for. */
function hangs<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

const MSG = { to: 'patient@acmedental.com', subject: 'Your visit', html: '<p>hi</p>' }
const GMAIL = { accountId: 'acct_1', from: 'Acme Dental <frontdesk@acmedental.com>' }

// The budget every case below is measured against. It is no longer a
// compromise between "fast suite" and "measurable split" — on a fake clock
// neither costs anything — so it stays at the value the file was written with,
// and the two-tier split (Gmail gets at most half) lands on a whole 60.
const BUDGET_MS = 120

/**
 * How far the fake clock may be wound before a call is declared stuck.
 *
 * It is a FAILURE MESSAGE, not a tolerance: nothing here is supposed to settle
 * anywhere near it, and the assertions are equalities rather than bounds. Its
 * job is to turn "the deadline is gone" from a twenty-second vitest timeout
 * into a sentence naming what did not happen — which is what this file's own
 * mutation check reads (delete the race in `withDeadline` and every hanging
 * case reports this, in milliseconds).
 */
const STUCK_AFTER_MS = BUDGET_MS * 10

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  mocks.resendSend.mockReset()
  mocks.sesSend.mockReset()
  mocks.gmailToken.mockReset().mockResolvedValue('access-tok')
  mocks.gmailSend.mockReset()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_TIMEOUT_MS = String(BUDGET_MS)
  delete process.env.EMAIL_DRIVER
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
  vi.useRealTimers()
  delete process.env.EMAIL_TIMEOUT_MS
})

/**
 * Drive a `deliver()` call to settlement on the fake clock, and report how many
 * milliseconds of it that took.
 *
 * The clock is advanced a millisecond at a time rather than jumped to the
 * budget, so `elapsedMs` is WHEN THE CALL GAVE UP rather than a number this
 * helper chose — a deadline that fired at 47ms and one that fired at 120ms
 * would be indistinguishable under a single `advanceTimersByTime(BUDGET_MS)`.
 *
 * `advanceTimersByTimeAsync` yields to the real event loop between steps, which
 * is what lets the dynamic `import()` of the Gmail service resolve; the initial
 * zero-advance is that same yield before the clock has moved at all, so a call
 * that settles without any timer firing reports 0.
 */
async function runToSettlement<T>(call: Promise<T>) {
  let done = false
  // Attached before anything can reject, so a settled-and-ignored rejection
  // never reaches the process as an unhandled one.
  void call.then(
    () => { done = true },
    () => { done = true },
  )

  const startedAt = Date.now()
  await vi.advanceTimersByTimeAsync(0)
  while (!done && Date.now() - startedAt < STUCK_AFTER_MS) {
    await vi.advanceTimersByTimeAsync(1)
  }

  const elapsedMs = Date.now() - startedAt
  if (!done) {
    throw new Error(
      `deliver() had still not settled after ${STUCK_AFTER_MS}ms on the fake clock. ` +
        'That is the DREAMCRM-89 defect: a transport that accepts the socket and goes quiet ' +
        'is being waited on with no deadline, so the caller waits to the socket timeout.',
    )
  }
  return { call, elapsedMs }
}

describe('deliver() deadline', () => {
  it('gives up on a Resend send that never answers, instead of waiting forever', async () => {
    mocks.resendSend.mockImplementation(() => hangs())

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG }))

    await expect(call).rejects.toThrow(/didn’t respond in time/)
    // The point of the fix, and now an equality rather than a tolerance: it
    // gives up AT the budget, not at the socket timeout and not at some
    // multiple of the budget nobody chose.
    expect(elapsedMs).toBe(BUDGET_MS)
  })

  it('gives up on an SES send that never answers', async () => {
    process.env.EMAIL_DRIVER = 'ses'
    mocks.sesSend.mockImplementation(() => hangs())

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG }))

    await expect(call).rejects.toThrow(/didn’t respond in time/)
    expect(mocks.sesSend).toHaveBeenCalledOnce()
    expect(elapsedMs).toBe(BUDGET_MS)
  })

  it('falls back to the platform sender when the clinic Gmail hangs, and still delivers', async () => {
    mocks.gmailSend.mockImplementation(() => hangs())
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null })

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG, gmail: GMAIL }))

    await expect(call).resolves.toBeUndefined()
    // A hung Tier-2 mailbox must not swallow the whole budget: the patient
    // still gets the email from the platform sender, and Gmail's share of the
    // wait is the half the code promises — not "less than the whole thing".
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    expect(elapsedMs).toBe(BUDGET_MS / 2)
  })

  it('bounds the WHOLE call when Gmail and the platform sender both hang', async () => {
    mocks.gmailSend.mockImplementation(() => hangs())
    mocks.resendSend.mockImplementation(() => hangs())

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG, gmail: GMAIL }))

    await expect(call).rejects.toThrow(/didn’t respond in time/)
    // ONE budget for the call, not one per transport — the caller gets a single
    // number it can reason about. This is the case the old `< BUDGET_MS * 6`
    // could not actually make: two full budgets is 240ms, which passed.
    expect(elapsedMs).toBe(BUDGET_MS)
    // Gmail was tried and abandoned, and the fallback got a real attempt.
    expect(mocks.gmailSend).toHaveBeenCalledOnce()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
  })

  it('a hung Gmail TOKEN fetch counts against the same budget and still falls back', async () => {
    mocks.gmailToken.mockImplementation(() => hangs())
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_2' }, error: null })

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG, gmail: GMAIL }))

    await expect(call).resolves.toBeUndefined()
    expect(mocks.gmailSend).not.toHaveBeenCalled()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    // The token fetch is inside the same `withDeadline`, so it spends Gmail's
    // half and nothing more.
    expect(elapsedMs).toBe(BUDGET_MS / 2)
  })

  /**
   * THE ABANDONED SEND KEEPS A HANDLER, and this is the branch where that is
   * load-bearing (Sentinel's note on #649). Two corrections behind the shape
   * of this case, both his:
   *
   *   1. On the RACED path `Promise.race` subscribes to the send itself, so a
   *      late rejection is already handled and the guard is redundant. The
   *      only branch it carries is the budget-already-spent one: the transport
   *      promise is constructed as the argument, then `ms <= 0` throws before
   *      the race, so nothing else ever subscribes.
   *   2. Asserting on `process.on('unhandledRejection')` proves nothing here.
   *      Deleting the guard and rejecting late still fires no event this
   *      listener sees under vitest — watched, three runs, 9/9 green with the
   *      line removed. So the assertion is on the MECHANISM instead: a
   *      `catch` handler is attached to the promise being walked away from.
   *      Delete `void pending.catch(() => {})` and this goes red.
   *
   * Reached by moving the CLOCK rather than shrinking the budget: a 1ms budget
   * lands here about eleven runs in twelve, and the twelfth reads one
   * millisecond left and races instead. A guard that needs repeated runs to
   * fail is not a guard. The clock this file installs is now fake, so the spy
   * below replaces `Date.now` on the fake `Date` — the same override, one layer
   * further out, and the case is reached identically.
   */
  it('attaches a handler to the send it abandons when the budget is already spent', async () => {
    const realNow = Date.now()
    const now = vi.spyOn(Date, 'now')
    // First reading is `startedAt`; every later one is past the deadline.
    now.mockReturnValueOnce(realNow).mockReturnValue(realNow + BUDGET_MS + 10)

    const caught = vi.fn()
    mocks.resendSend.mockImplementation(() => {
      const p: Promise<unknown> = new Promise(() => {})
      const real = p.catch.bind(p)
      p.catch = (...a: Parameters<typeof real>) => {
        caught()
        return real(...a)
      }
      return p
    })
    try {
      await expect(deliver({ ...MSG })).rejects.toThrow(/didn’t respond in time/)
      // The send was CONSTRUCTED — it is the argument — and then thrown past
      // before anything raced it. `within 0ms` is that path's fingerprint; a
      // raced timeout names the budget it actually waited out.
      expect(mocks.resendSend).toHaveBeenCalledOnce()
      expect(warn.mock.calls.flat().join(' ')).toMatch(/Resend did not respond within 0ms/)
      expect(caught).toHaveBeenCalled()
    } finally {
      now.mockRestore()
    }
  })

  it('reports the DEADLINE to the caller, not the provider failure that lands afterwards', async () => {
    let rejectLate: (err: unknown) => void = () => {}
    mocks.resendSend.mockImplementation(
      () => new Promise((_resolve, reject) => { rejectLate = reject }),
    )

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG }))
    await expect(call).rejects.toThrow(/didn’t respond in time/)
    expect(elapsedMs).toBe(BUDGET_MS)

    // The provider finally answers — with an error — after nobody is waiting.
    // The caller's outcome must not change under it: what they were told is
    // "we do not know whether this went out", and a later `connection reset`
    // does not retroactively make that a rejection.
    rejectLate(new Error('connection reset'))
    await vi.advanceTimersByTimeAsync(30)
    await expect(call).rejects.toThrow(/didn’t respond in time/)
  })

  it('leaves a send that answers promptly completely alone', async () => {
    mocks.resendSend.mockResolvedValue({ data: { id: 'msg_3' }, error: null })

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG }))

    await expect(call).resolves.toBeUndefined()
    expect(mocks.resendSend).toHaveBeenCalledOnce()
    // Not one millisecond of the budget: a prompt send never waits on the
    // deadline, it only ever races it.
    expect(elapsedMs).toBe(0)
  })

  it('still surfaces a real provider REJECTION as itself, not as a timeout', async () => {
    mocks.resendSend.mockResolvedValue({ error: { name: 'validation_error', message: 'bad from' } })

    const { call, elapsedMs } = await runToSettlement(deliver({ ...MSG }))

    await expect(call).rejects.toThrow(/couldn’t be sent right now/)
    // And it surfaces IMMEDIATELY. A rejection that had to wait out the budget
    // would mean the race was inspecting the wrong promise.
    expect(elapsedMs).toBe(0)
  })
})
