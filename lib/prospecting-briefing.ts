// Pure logic for the daily sales briefing — the "one clear next action" the
// owner should take when they open the workspace each morning. Kept pure (no
// DB/server deps) so the priority ladder is unit-testable; the service
// (lib/services/prospecting-briefing.ts) composes the data and calls this.

export interface NextAction {
  icon: string
  headline: string
  sub: string
  href: string
}

export interface BriefingSignals {
  demosToday: number
  firstDemoName: string | null
  firstDemoWhen: string | null
  callFirstCount: number
  topCallName: string | null
  phoneQueueCount: number
  overnightHotCount: number
  killSwitch: boolean
  dryRun: boolean
  senderReady: boolean
}

/**
 * The single most important thing to do right now, chosen by a priority
 * ladder: a demo on the calendar today beats a warm hand-raiser, which beats
 * a cold call, which beats housekeeping. Always returns something actionable.
 */
export function chooseNextAction(s: BriefingSignals): NextAction {
  if (s.killSwitch) {
    return {
      icon: '🟠',
      headline: 'The engine is switched off',
      sub: 'Turn it on and pick a state — discovery starts pulling clinics within a few hours.',
      href: '/platform/prospecting/settings',
    }
  }
  if (s.demosToday > 0) {
    const many = s.demosToday > 1 ? ` (${s.demosToday} today)` : ''
    return {
      icon: '📅',
      headline: `You have a demo today${many}`,
      sub: s.firstDemoName
        ? `First up: ${s.firstDemoName}${s.firstDemoWhen ? ` at ${s.firstDemoWhen}` : ''}. Open the prep brief before the call.`
        : 'Open the prep brief before the call.',
      href: '/platform/prospecting/call-list',
    }
  }
  if (s.callFirstCount > 0) {
    return {
      icon: '🔥',
      headline: `${s.callFirstCount} ${s.callFirstCount === 1 ? 'practice' : 'practices'} raised a hand`,
      sub: s.topCallName
        ? `Call ${s.topCallName} first — they replied or clicked, so they're warm right now.`
        : 'They replied or clicked — call them while it’s warm.',
      href: '/platform/prospecting/call-list',
    }
  }
  if (s.phoneQueueCount > 0) {
    return {
      icon: '📵',
      headline: `${s.phoneQueueCount} hot ${s.phoneQueueCount === 1 ? 'practice has' : 'practices have'} no email`,
      sub: 'These can’t be emailed — they’re your best cold calls. Start dialing the phone-first queue.',
      href: '/platform/prospecting/call-list',
    }
  }
  if (s.dryRun) {
    return {
      icon: '🧪',
      headline: 'Outreach is in dry-run',
      sub: s.senderReady
        ? 'Sending is wired and safe to test. Review a few drafted touches, then flip dry-run off to go live.'
        : 'Verify your sending domain, then flip dry-run off to start the drip.',
      href: '/platform/prospecting/settings',
    }
  }
  return {
    icon: '🎯',
    headline: 'The machine is hunting',
    sub:
      s.overnightHotCount > 0
        ? `${s.overnightHotCount} new hot ${s.overnightHotCount === 1 ? 'prospect' : 'prospects'} entered recently. Outreach is live — replies will land on your call list.`
        : 'Outreach is live. New replies and hot prospects will surface here as they come in.',
    href: '/platform/prospecting',
  }
}
