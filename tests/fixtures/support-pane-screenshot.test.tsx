import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { writeFileSync, mkdirSync } from 'node:fs'

/**
 * SUPPORT PANE SCREENSHOT FIXTURE — render rig, SCREENSHOT=1 only (same
 * loop as the Dream Team and tray fixtures). Dumps the clinic-side support
 * conversation with a realistic exchange so the identity contract can be
 * judged on pixels: platform side reads "Support", clinic side keeps names.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/realtime/realtime-provider', () => ({ useRealtime: () => undefined }))

import SupportView from '@/app/(double-sidebar)/messages/support/support-view'

const NOW = Date.now()
const HOUR = 3_600_000

const messages = [
  {
    id: 1,
    body: 'Hi — our appointment reminders stopped going out on Tuesday. Patients are showing up unconfirmed.',
    createdAt: new Date(NOW - 26 * HOUR).toISOString(),
    authorId: 'staff_1',
    authorName: 'Dr. Cotham',
    fromSupport: false,
  },
  {
    id: 2,
    body: 'Thanks for flagging it — looking now. I can see the Tuesday batch; give me a few minutes to trace where it stopped.',
    createdAt: new Date(NOW - 25 * HOUR).toISOString(),
    authorId: 'platform_1',
    authorName: 'Dustin Mabray',
    fromSupport: true,
  },
  {
    id: 3,
    body: 'Found it — your reminder emails were pausing on a settings change from Monday. I’ve turned them back on and re-queued this week’s reminders. You’ll see tomorrow’s batch go out at 10am as usual.',
    createdAt: new Date(NOW - 24 * HOUR).toISOString(),
    authorId: 'platform_1',
    authorName: 'Dustin Mabray',
    fromSupport: true,
  },
  {
    id: 4,
    body: 'That did it — confirmations are coming in again. Thank you!',
    createdAt: new Date(NOW - 3 * HOUR).toISOString(),
    authorId: 'staff_1',
    authorName: 'Dr. Cotham',
    fromSupport: false,
  },
]

describe.runIf(process.env.SCREENSHOT === '1')('support pane screenshot fixture', () => {
  it('dumps the support conversation DOM', () => {
    const empty = process.env.SUPPORT_EMPTY === '1'
    const { container } = render(
      <div className="h-[52rem]">
        <SupportView messages={empty ? [] : messages} currentUserId="staff_1" />
      </div>,
    )
    const dir = process.env.SCREENSHOT_DIR ?? '/tmp/support-shot'
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/body${empty ? '-empty' : ''}.html`, container.innerHTML)
    expect(container.innerHTML.length).toBeGreaterThan(1000)
  })
})
