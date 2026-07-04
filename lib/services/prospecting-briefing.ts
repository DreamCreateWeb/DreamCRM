import 'server-only'
import { clinicDayStart } from '@/lib/clinic-timezone'
import { chooseNextAction, type NextAction } from '@/lib/prospecting-briefing'
import {
  getProspectingConfig,
  getCallList,
  getPhoneQueue,
  getRecentHotArrivals,
  type CallListRow,
  type PhoneQueueRow,
} from './prospecting'
import { getUpcomingMeetings, formatMeetingTime } from './prospect-meetings'

/**
 * The morning cockpit — one composed read the owner opens each day: what's on
 * the calendar, who to call first (and why), what came in overnight, and the
 * single clearest next action. Reuses the existing call-list / meetings /
 * phone-queue reads so it stays a thin aggregator, not a new data path.
 */

export interface BriefingDemo {
  prospectId: string
  name: string
  when: string
  attendeeEmail: string | null
}

export interface DailyBriefing {
  nextAction: NextAction
  todaysDemos: BriefingDemo[]
  callFirst: CallListRow[]
  callListTotal: number
  phoneQueueTop: PhoneQueueRow[]
  phoneQueueTotal: number
  overnightHot: { count: number; names: string[] }
  engine: { killSwitch: boolean; dryRun: boolean; autoEnroll: boolean; live: boolean }
}

export async function getDailyBriefing(opts?: { now?: Date }): Promise<DailyBriefing> {
  const now = opts?.now ?? new Date()
  const config = await getProspectingConfig()
  const [callList, meetings, phoneQueue, overnightHot] = await Promise.all([
    getCallList(),
    getUpcomingMeetings(20, now),
    getPhoneQueue(50),
    getRecentHotArrivals({ now, sinceHours: 24, limit: 5 }),
  ])

  const hostTz = config.booking.hostTimeZone
  const todayStart = clinicDayStart(now, hostTz, 0).getTime()
  const tomorrowStart = clinicDayStart(now, hostTz, 1).getTime()
  const todaysDemos: BriefingDemo[] = meetings
    .filter((m) => {
      const t = m.scheduledAt.getTime()
      return t >= todayStart && t < tomorrowStart
    })
    .map((m) => ({
      prospectId: m.prospectId,
      name: m.prospectName,
      when: formatMeetingTime(m.scheduledAt, m.hostTimeZone),
      attendeeEmail: m.attendeeEmail,
    }))

  const callFirst = callList.slice(0, 5)
  const senderReady =
    Boolean(process.env.OUTREACH_EMAIL_FROM?.trim()) || Boolean(process.env.OUTREACH_GMAIL_ACCOUNT_ID?.trim())

  const nextAction = chooseNextAction({
    demosToday: todaysDemos.length,
    firstDemoName: todaysDemos[0]?.name ?? null,
    firstDemoWhen: todaysDemos[0]?.when ?? null,
    callFirstCount: callList.length,
    topCallName: callFirst[0]?.name ?? null,
    phoneQueueCount: phoneQueue.length,
    overnightHotCount: overnightHot.count,
    killSwitch: config.killSwitch,
    dryRun: config.dryRun,
    senderReady,
  })

  return {
    nextAction,
    todaysDemos,
    callFirst,
    callListTotal: callList.length,
    phoneQueueTop: phoneQueue.slice(0, 3),
    phoneQueueTotal: phoneQueue.length,
    overnightHot,
    engine: {
      killSwitch: config.killSwitch,
      dryRun: config.dryRun,
      autoEnroll: config.autoEnroll.enabled,
      live: !config.killSwitch && !config.dryRun,
    },
  }
}
