import 'server-only'

/**
 * THE DREAM TEAM's data assembly (docs/ai-operations.md, D2). This is the
 * Approval Inbox read that lived inline on the clinic Overview from Phase 2
 * until the Dream Team page became the stack's home — moved WHOLE, not
 * rewritten, so every audited law (artifact enrichment, machine-handles,
 * unedited runs, the send-window honesty) rides along untouched.
 */

import {
  listOpenProposals,
  countOpenProposals,
  countConsecutiveUneditedApprovals,
  machineHandlesCardRow,
} from '@/lib/services/proposals'
import {
  insidePatientSendWindow,
  PATIENT_INBOX_CAPABILITIES,
} from '@/lib/services/proposal-generators'
import { listTrustGrants, listAutonomousWork } from '@/lib/services/autonomy'
import { isGrantable } from '@/lib/autonomy'
import { describeDays } from '@/lib/empty-chair'
import { expiryDayLabel } from '@/lib/types/dream-team'
import { clinicDayKey } from '@/lib/format-datetime'
import type {
  ProposalCardData,
  TrustGrantChip,
  AutonomousWorkChip,
} from '../dashboard/approval-inbox'

/** The email artifact's To-line: a named patient for an inquiry reply, the
 *  honest audience size for campaign-shaped sends. */
function emailToLine(
  capability: string,
  payload: Record<string, unknown>,
  author: string | null,
): string | null {
  if (capability === 'inquiry_response') return author
  const n = typeof payload.recipientCount === 'number' ? payload.recipientCount : null
  return n != null ? `~${n} patients` : 'your recall list'
}

export interface ApprovalInboxData {
  proposalCards: ProposalCardData[]
  totalOpen: number
  /** Capabilities currently at 'auto' — the take-it-back strip. */
  grants: Array<TrustGrantChip & { grantedAt: Date | null }>
  autonomousWork: AutonomousWorkChip[]
}

export async function loadApprovalInbox(
  organizationId: string,
  timeZone: string,
): Promise<ApprovalInboxData> {
  const [proposals, totalOpen, trustGrants, autonomousWork] = await Promise.all([
    // Best-effort reads — the page must never fail because one narrator
    // hiccupped (Phase-2 law, unchanged by the move).
    listOpenProposals(organizationId).catch(() => []),
    // includeGranted: the inbox's truncation notice compares against the
    // list's OWN population. The sidebar badge's "waiting on your yes"
    // count is a different number on purpose (round-1 Phase-3 audit).
    countOpenProposals(organizationId, { includeGranted: true }).catch(() => 0),
    listTrustGrants(organizationId).catch(() => []),
    listAutonomousWork(organizationId).catch(() => []),
  ])

  // EARNED TRUST (Phase 3): for each still-ask-first capability with a card
  // showing, how many recent approvals in a row went out unedited — the
  // card suggests the grant at 3+. Best-effort; at most four tiny reads.
  const grantedSet = new Set(trustGrants.filter((g) => g.level === 'auto').map((g) => g.capability))
  // WHO DECIDED (D12): a lane that is automatic because the product ships
  // that way must never be described to a clinic as something they handed
  // over. Only a stored 'auto' is a choice they made.
  const explicitlyGranted = new Set(
    trustGrants.filter((g) => g.level === 'auto' && g.explicit).map((g) => g.capability),
  )
  const grantedCapabilities = trustGrants
    .filter((g) => g.level === 'auto')
    .map((g) => ({ capability: g.capability, grantedAt: g.grantedAt }))
  // One clinic-local read for every card's copy — the same rule the hourly
  // driver applies before it sends anything to a patient's inbox.
  const insideSendWindow = insidePatientSendWindow(new Date(), timeZone)
  // The card's own words for what the rail's tone dot only colours — in the
  // CLINIC's day, so a card retiring at 11 PM Central still reads "today".
  const todayKey = clinicDayKey(new Date(), timeZone)
  const suggestFor = Array.from(
    new Set(
      proposals
        .map((p) => p.capability)
        .filter((c) => isGrantable(c) && !grantedSet.has(c)),
    ),
  )
  // A revoke floors the run: the machine never cites approvals the clinic
  // has since overruled by taking the job back (round-3 audit).
  const revokedAt = new Map(trustGrants.map((g) => [g.capability, g.revokedAt] as const))
  const uneditedRuns = new Map<string, number>(
    await Promise.all(
      suggestFor.map(async (c) => {
        const n = await countConsecutiveUneditedApprovals(organizationId, c, {
          since: revokedAt.get(c) ?? null,
        }).catch(() => 0)
        return [c, n] as const
      }),
    ),
  )

  // ARTIFACT ENRICHMENT (owner design directive 2026-08-13: show the work,
  // not a paragraph). Social-flavored cards resolve their destination's
  // platform + handle at READ time from the connected accounts — the same
  // source the composer's live preview uses, so the two can never drift —
  // and legacy payloads without labels degrade to a neutral feed card.
  const needsChannels = proposals.some(
    (p) => p.capability === 'social_post' || p.capability === 'content_plan',
  )
  const channelById = new Map<string, { platform: string; label: string; handle: string | null }>()
  if (needsChannels) {
    try {
      const { getComposerChannels } = await import('@/lib/services/social-posts')
      for (const c of await getComposerChannels(organizationId)) {
        channelById.set(c.accountId, { platform: c.platform, label: c.label, handle: c.handle ?? null })
      }
    } catch {
      /* previews degrade to the neutral card */
    }
  }
  const firstChannelOf = (payload: Record<string, unknown>) => {
    const ids = Array.isArray(payload.accountIds) ? (payload.accountIds as unknown[]) : []
    for (const id of ids) {
      if (typeof id !== 'string') continue
      const c = channelById.get(id)
      if (c) return { accountId: id, ...c }
    }
    return null
  }

  const proposalCards: ProposalCardData[] = proposals.map((p) => {
    const payload = (p.payload ?? {}) as Record<string, unknown>
    let meta: string | null = null
    if (p.capability === 'outreach_campaign' && typeof payload.recipientCount === 'number') {
      meta = `goes to ~${payload.recipientCount} patients`
    } else if (p.capability === 'social_post' && Array.isArray(payload.accountIds)) {
      // NAME the destinations when the payload carries them (verification
      // round: "posts to 3 channels" hid that one is the clinic's Google
      // Business listing — the destination is the other half of a public
      // post). Older payloads without labels keep the honest count.
      const labels = Array.isArray(payload.channels)
        ? (payload.channels as unknown[])
            .map((c) => (c && typeof c === 'object' ? (c as Record<string, unknown>).label : null))
            .filter((l): l is string => typeof l === 'string' && !!l.trim())
        : []
      if (labels.length > 0) {
        const shown = labels.slice(0, 3)
        const rest = labels.length - shown.length
        meta = `posts to ${shown.join(', ')}${rest > 0 ? ` +${rest} more` : ''}`
      } else {
        const n = (payload.accountIds as unknown[]).length
        meta = `posts to ${n} ${n === 1 ? 'channel' : 'channels'}`
      }
    } else if (p.capability === 'schedule_gap') {
      // WHO it reaches and WHICH days it names — the two facts a person needs
      // before saying yes to mail going out about their own schedule.
      const n = typeof payload.recipientCount === 'number' ? payload.recipientCount : null
      const days = Array.isArray(payload.dayLabels)
        ? (payload.dayLabels as unknown[]).filter((d): d is string => typeof d === 'string' && !!d.trim())
        : []
      const who = n != null ? `goes to ~${n} patients` : 'goes to your recall list'
      meta = days.length > 0 ? `${who} · about ${describeDays(days)}` : who
    } else if (p.capability === 'content_plan') {
      // WHAT IT COMMITS TO, in one line: how much writing, and where it
      // lands. A month plan is the biggest single yes in the inbox, so the
      // meta must not undersell it as "4 items".
      const n = Array.isArray(payload.items) ? (payload.items as unknown[]).length : 0
      const channels = Array.isArray(payload.accountIds) ? (payload.accountIds as unknown[]).length : 0
      meta =
        n > 0
          ? `${n} ${n === 1 ? 'piece' : 'pieces'} over four weeks${channels > 0 ? ` · ${channels} ${channels === 1 ? 'channel' : 'channels'} + your blog` : ''}`
          : null
    } else if (p.capability === 'inquiry_response') {
      meta = 'replies by email'
    } else if (p.capability === 'review_reply') {
      meta = 'public reply on Google'
    }
    // The thing being answered (generators store it in payload.context) —
    // quoted on the card so staff never approve a public reply blind.
    const rawCtx = payload.context as Record<string, unknown> | undefined
    const context =
      rawCtx && typeof rawCtx === 'object'
        ? {
            kind: typeof rawCtx.kind === 'string' ? rawCtx.kind : 'context',
            author: typeof rawCtx.author === 'string' ? rawCtx.author : null,
            starRating: typeof rawCtx.starRating === 'number' ? rawCtx.starRating : null,
            text: typeof rawCtx.text === 'string' ? rawCtx.text : null,
            // The date an inquiry asked about — a date-only inquiry's whole
            // statement (round-3 audit; the card renders it).
            preferredDate: typeof rawCtx.preferredDate === 'string' ? rawCtx.preferredDate : null,
          }
        : null
    // The artifact payload each card renders instead of a text dump.
    let artifact: ProposalCardData['artifact'] = null
    if (p.capability === 'social_post') {
      artifact = { kind: 'social', channel: firstChannelOf(payload) }
    } else if (p.capability === 'content_plan') {
      const items = Array.isArray(payload.items)
        ? (payload.items as unknown[])
            .map((it) => {
              if (!it || typeof it !== 'object') return null
              const o = it as Record<string, unknown>
              const kind = o.kind === 'blog' ? ('blog' as const) : ('social' as const)
              const body = typeof o.body === 'string' ? o.body : ''
              if (!body.trim()) return null
              return { kind, title: typeof o.title === 'string' ? o.title : null, body }
            })
            .filter((x): x is NonNullable<typeof x> => x !== null)
        : []
      artifact = items.length > 0 ? { kind: 'plan', items, channel: firstChannelOf(payload) } : null
    } else if (
      p.capability === 'inquiry_response' ||
      p.capability === 'outreach_campaign' ||
      p.capability === 'schedule_gap'
    ) {
      artifact = { kind: 'email', toLine: emailToLine(p.capability, payload, context?.author ?? null) }
    } else if (p.capability === 'gbp_website_fix' && typeof payload.targetUrl === 'string') {
      artifact = {
        kind: 'gbp',
        targetUrl: payload.targetUrl,
        previousUri: typeof payload.previousUri === 'string' ? payload.previousUri : null,
      }
    }
    return {
      id: p.id,
      capability: p.capability,
      capabilityLabel: p.capabilityLabel,
      title: p.title,
      body: p.body,
      artifact,
      // The patient-facing subject is part of the artifact (round-2 gap) —
      // shown + editable on the card for the email-sending capabilities.
      subject: typeof payload.subject === 'string' ? payload.subject : null,
      meta,
      context,
      uneditedRun: uneditedRuns.get(p.capability) ?? 0,
      // The machine tried this one alone and gave up — the card says so
      // instead of promising it goes out within the hour.
      handedBack: payload.handBack === true,
      // THE one law, asked once per card: is this mine to send, or yours to
      // decide? (granted + filed at or after the grant + not handed back).
      machineHandles: machineHandlesCardRow(grantedCapabilities, {
        capability: p.capability,
        createdAt: p.createdAt,
        handedBack: payload.handBack === true,
      }),
      // The capability is automatic AT ALL — the consent checkbox's gate, so
      // a card the machine won't act on never re-asks for a standing trust.
      capabilityGranted: grantedSet.has(p.capability),
      grantExplicit: explicitlyGranted.has(p.capability),
      // When the card retires itself — the queue rail's urgency dot.
      expiresAt: p.expiresAt ?? null,
      expiresLabel: expiryDayLabel(todayKey, p.expiresAt ? clinicDayKey(p.expiresAt, timeZone) : null),
      // Patient mail waits for daylight, so "within the hour" would be a lie
      // in the evening (round-2 audit).
      waitsForMorning:
        PATIENT_INBOX_CAPABILITIES.includes(p.capability) && !insideSendWindow,
    }
  })

  return {
    proposalCards,
    totalOpen,
    grants: trustGrants
      .filter((g) => g.level === 'auto')
      .map((g) => ({
        capability: g.capability,
        label: g.label,
        grantedAt: g.grantedAt,
        explicit: g.explicit,
      })),
    autonomousWork,
  }
}
