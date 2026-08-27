/**
 * THE NOTIFICATION TYPE REGISTRY — client-safe, the single home for what each
 * notification type LOOKS like (icon + tone) and how loudly it may reach a
 * person's inbox (urgent or not).
 *
 * Why it exists (the 2026-08-25 notifications overhaul): the bell painted one
 * icon per BUCKET (💬/🎯/📣 — three Mosaic-era leftovers), so a 1-star review,
 * a no-show and a paid order all wore the same face; and a few dispatch sites
 * compensated by baking emoji into the TITLE, which then leaked into email
 * subjects. Icons live here now, titles stay words.
 *
 * URGENCY is the load-bearing half. `notify()` used to email EVERY event the
 * moment it happened whenever the "Email digest" toggle was on (its default) —
 * a per-event firehose wearing a digest's name. Email delivery is now a
 * per-user MODE ('all' | 'urgent' | 'none'), and `urgent: true` here is what
 * the 'urgent' mode means: something went wrong, or a stranger is waiting on
 * a human — the alerts worth interrupting an inbox for. Routine activity
 * (a booking, a paid order, a submitted form) stays in the bell, where the
 * morning digest already summarizes the day.
 */

export type NotificationTone = 'urgent' | 'warn' | 'ok' | 'info' | 'neutral'

export interface NotificationTypeDef {
  /** Emoji shown in the tray row (and anywhere else a type needs a face). */
  icon: string
  /** Semantic tone for the row accent (DESIGN-SYSTEM six-tone palette). */
  tone: NotificationTone
  /** Emails under the 'urgent' delivery mode. Reserve for "something broke"
   *  or "a person is waiting on you" — every `true` here is somebody's
   *  interrupted morning, and the firehose this replaced was retired for a
   *  reason. */
  urgent?: boolean
}

export const NOTIFICATION_TYPES: Record<string, NotificationTypeDef> = {
  // ---- Conversations & inquiries (a person is waiting) ----
  patient_message: { icon: '💬', tone: 'info', urgent: true },
  inbox_message: { icon: '📥', tone: 'info', urgent: true },
  website_lead: { icon: '👋', tone: 'info', urgent: true },
  insurance_question: { icon: '🛡️', tone: 'info', urgent: true },
  platform_inbound_email: { icon: '📥', tone: 'info', urgent: true },

  // ---- Something went wrong (always urgent) ----
  patient_message_bounce: { icon: '↩️', tone: 'urgent', urgent: true },
  payment_failed: { icon: '💳', tone: 'urgent', urgent: true },
  pms_sync_failing: { icon: '🔌', tone: 'urgent', urgent: true },
  domain_attach_manual: { icon: '🌐', tone: 'warn', urgent: true },
  campaign_sent_with_errors: { icon: '📣', tone: 'warn', urgent: true },
  prospect_watchdog: { icon: '🚨', tone: 'urgent', urgent: true },

  // ---- Reputation (a bad experience is fresh — reach out today) ----
  review_low_rating: { icon: '⭐', tone: 'urgent', urgent: true },
  nps_detractor: { icon: '🩹', tone: 'urgent', urgent: true },
  private_feedback: { icon: '🗒️', tone: 'info' },

  // ---- Schedule movement ----
  appointment_cancelled: { icon: '🗓️', tone: 'warn' },
  appointment_no_show: { icon: '🪑', tone: 'warn' },
  online_booking: { icon: '🗓️', tone: 'ok' },
  portal_booking: { icon: '🗓️', tone: 'ok' },
  portal_reschedule: { icon: '🗓️', tone: 'info' },
  waitlist_claimed: { icon: '⚡', tone: 'ok' },
  intake_submitted: { icon: '📋', tone: 'ok' },

  // ---- Money that arrived (good news; the bell is enough) ----
  balance_payment_paid: { icon: '💸', tone: 'ok' },
  booking_deposit_paid: { icon: '💸', tone: 'ok' },
  shop_order_paid: { icon: '🛍️', tone: 'ok' },
  membership_joined: { icon: '🤝', tone: 'ok' },
  payment_plan: { icon: '📆', tone: 'ok' },

  // ---- Campaigns ----
  campaign_sent: { icon: '📣', tone: 'ok' },

  // ---- Support (clinic ↔ Dream Create — a person is waiting either way) ----
  support_message: { icon: '🎧', tone: 'info', urgent: true },
  support_reply: { icon: '🎧', tone: 'info', urgent: true },

  // ---- Platform (Dream Create's own desk) ----
  clinic_signup: { icon: '🎉', tone: 'ok', urgent: true },
  subscription_cancelled: { icon: '👋', tone: 'urgent', urgent: true },
  prospect_call_list: { icon: '📞', tone: 'warn', urgent: true },
  prospect_demo_booked: { icon: '📅', tone: 'ok', urgent: true },
  prospect_engaged: { icon: '🔥', tone: 'info' },
}

const FALLBACK: NotificationTypeDef = { icon: '🔔', tone: 'neutral' }

/** Lookup with an honest fallback — an unregistered type gets the plain
 *  bell, never a crash and never a wrong borrowed face. */
export function notificationType(type: string): NotificationTypeDef {
  return NOTIFICATION_TYPES[type] ?? FALLBACK
}

/** Does this type email under the 'urgent' delivery mode? */
export function isUrgentType(type: string): boolean {
  return NOTIFICATION_TYPES[type]?.urgent === true
}

/** The three per-user email delivery modes (notification_prefs.email_mode).
 *  'all' = every bell alert also emails (the old behavior, now opt-in);
 *  'urgent' = only urgent types email (the default);
 *  'none' = the bell only. forceEmail dispatches bypass the mode either way. */
export const EMAIL_MODES = ['all', 'urgent', 'none'] as const
export type EmailMode = (typeof EMAIL_MODES)[number]
