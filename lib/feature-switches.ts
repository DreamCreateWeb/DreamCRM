/**
 * THE FEATURE SWITCHES (docs/ACTIVATION.md law 1, slice S3 — 2026-10-05).
 *
 * "Five doors, not twenty-five." A feature is OFF until the practice
 * chooses it; the sidebar carries what is on, and everything else waits
 * in an "Add" group behind an intro card — what it does, what to know,
 * ONE button. This file is the client-safe registry: which modules carry a
 * switch, which column holds it, the intro copy, and the pure arithmetic
 * that splits a module list into "on" and "addable". The server half
 * (lib/services/feature-switches.ts) reads and writes the columns.
 *
 * The DAY-ONE SIX are never switched: Overview, Dream Team, Messages,
 * Appointments, Patients, Settings (+ Website, whose go-live lever IS its
 * switch, and Integrations, which is the front door itself). Dream Team
 * joined the day-one set in S3 because its sign-here stack is where the
 * day-0 setup asks (hours, chairs, booking mode, texting) land — a door
 * behind a door is a hallway.
 *
 * One rule the whole thing rests on: a module with a switch is gated by
 * its switch ALONE. Payments and Shop used to appear only once the
 * payments bundle was active (Stripe engaged); a deliberate "Turn on
 * Payments" now beats that derived signal, because the page a clinic just
 * asked for must not vanish for want of a Stripe account — the hub's own
 * connect card is the next step. 0172 grandfathers existing clinics on
 * exactly the old signal so nobody sees a money page they did not see
 * yesterday.
 */

import type { ModuleDef } from '@/lib/modules/types'

export type FeatureKey = 'my_day' | 'followups' | 'leads' | 'intake_forms' | 'growth' | 'payments' | 'shop' | 'insurance'

export interface FeatureSwitchDef {
  key: FeatureKey
  /** The clinic sidebar module this switch governs (ModuleDef.id). */
  moduleId: string
  /** The module's root path — the intro renders there when off. */
  path: string
  /** The clinic_profile column, as the Drizzle property name. */
  column:
    | 'myDayEnabledAt'
    | 'followupsEnabledAt'
    | 'leadsEnabledAt'
    | 'intakeFormsEnabledAt'
    | 'growthEnabledAt'
    | 'paymentsEnabledAt'
    | 'shopEnabledAt'
    | 'insuranceEnabledAt'
  /** Sidebar label, reused by the intro ("Turn on My Day"). */
  label: string
  /** One line under the title. */
  lede: string
  /** What it does — three lines. */
  does: readonly string[]
  /** What to know — honest: money, labels, where data goes. */
  know: readonly string[]
  /**
   * The activation event that opens this door on its own, if any. 'a1' =
   * data connected (the day-one kick stamped A1); 'site_live' = the go-live
   * lever was pulled. null = only a person opens it.
   */
  autoOpen: 'a1' | 'site_live' | null
  /**
   * The feature keeps its OWN intro + setup page (insurance's NPI box) and
   * the generic gate must stay out of its way. The sidebar split still
   * applies.
   */
  ownIntro?: boolean
}

// Registry order = the clinic sidebar's order (tests/feature-switches pins it).
export const FEATURE_SWITCHES: readonly FeatureSwitchDef[] = [
  {
    key: 'my_day',
    moduleId: 'my_day',
    path: '/my-day',
    column: 'myDayEnabledAt',
    label: 'My Day',
    lede: 'One screen per person: what is theirs today, and nothing that is not.',
    does: [
      'Shows each staff member their own follow-ups, their conversations, and today’s schedule.',
      'Surfaces the unclaimed follow-ups so nothing sits with nobody.',
      'Mirrors itself as an optional morning digest email, per person.',
    ],
    know: [
      'It reads what the rest of the app already knows — nothing new to enter.',
      'Each person can switch their digest email off; the page stays.',
      'It opens on its own the day your patient data is connected.',
    ],
    autoOpen: 'a1',
  },
  {
    key: 'followups',
    moduleId: 'followups',
    path: '/followups',
    column: 'followupsEnabledAt',
    label: 'Follow-ups',
    lede: 'A board of the calls and notes that are owed, with a name on each.',
    does: [
      'Keeps every “call them back” as a card with a due date and an owner.',
      'Writes its own cards from your rules: overdue balances, recall due, unconfirmed visits.',
      'Rebooks a no-show by itself when you let it.',
    ],
    know: [
      'The rules run hourly and only ever add a card — they never send anything.',
      'Cards are visible to every staff member in the clinic.',
      'It opens on its own the day your patient data is connected.',
    ],
    autoOpen: 'a1',
  },
  {
    key: 'leads',
    moduleId: 'leads',
    path: '/leads',
    column: 'leadsEnabledAt',
    label: 'Inquiries',
    lede: 'Everyone who asked a question through your website, in one list.',
    does: [
      'Collects website contact-form and chat inquiries with where each one came from.',
      'Ages them in colour so a three-day-old question is impossible to miss.',
      'Turns an inquiry into a patient record without retyping.',
    ],
    know: [
      'It fills from your public site — it has nothing to show until the site is live.',
      'An inquiry is never auto-replied to; a person answers.',
      'It opens on its own the day your website goes live.',
    ],
    autoOpen: 'site_live',
  },
  {
    key: 'intake_forms',
    moduleId: 'intake_forms',
    path: '/intake-forms',
    column: 'intakeFormsEnabledAt',
    label: 'Intake Forms',
    lede: 'Patients fill in their history and insurance before they arrive.',
    does: [
      'Sends a new patient the forms before the visit and chases the ones not done.',
      'Reads an insurance-card photo into the record and writes a pre-visit summary.',
      'Offers every form in Spanish.',
    ],
    know: [
      'A patient’s answers land on their record; the card photo stays as a document.',
      'The summary and the card reading use an AI service without a signed BAA — the same posture as the rest of the app.',
      'Nothing goes to patients until you turn this on — from then, every booking confirmation carries the link.',
    ],
    autoOpen: null,
  },
  {
    key: 'insurance',
    moduleId: 'insurance',
    path: '/insurance',
    column: 'insuranceEnabledAt',
    label: 'Insurance',
    lede: 'Type what is on the card, get the benefits back.',
    does: [],
    know: [],
    autoOpen: null,
    ownIntro: true,
  },
  {
    key: 'growth',
    moduleId: 'growth',
    path: '/growth',
    column: 'growthEnabledAt',
    label: 'Growth',
    lede: 'Recall, reviews, social and the numbers behind new patients.',
    does: [
      'Finds the patients who are overdue and reachable and invites them back.',
      'Asks for a Google review after a visit and features the good ones on your site.',
      'Posts to your social accounts from one composer and reports what worked.',
    ],
    know: [
      'Recall nudges and review asks go out on their own once their switches are on; campaigns and review replies are drafted first and wait for your yes.',
      'It needs patients loaded and Google connected to have anything to say.',
      'Texting rides a per-clinic carrier registration; email is live today.',
    ],
    autoOpen: null,
  },
  {
    key: 'payments',
    moduleId: 'payments_hub',
    path: '/payments',
    column: 'paymentsEnabledAt',
    label: 'Payments',
    lede: 'Balances paid online, payment plans, memberships — paid out to your bank.',
    does: [
      'Sends a patient a link to pay a balance and reconciles what came in.',
      'Runs payment plans and the dunning for the ones that stall.',
      'Sells membership plans from your website.',
    ],
    know: [
      'It runs on your own Stripe account — connecting one is the first step inside.',
      'Stripe’s card fees apply; we never hold your money.',
      'Nothing is charged without a patient’s own action.',
    ],
    autoOpen: null,
  },
  {
    key: 'shop',
    moduleId: 'shop',
    path: '/shop',
    column: 'shopEnabledAt',
    label: 'Shop',
    lede: 'A storefront on your website for whitening kits, brushes and the rest.',
    does: [
      'Lists products on your site with checkout, orders and fulfilment.',
      'Runs coupons and birthday codes, and nudges you when stock is low.',
      'Exports orders as CSV for the bookkeeper.',
    ],
    know: [
      'It runs on your own Stripe account — connect one in Payments first.',
      'Stripe’s card fees apply to every order.',
      'Never a day-one thing; turn it on when you have something to sell.',
    ],
    autoOpen: null,
  },
] as const

export const FEATURE_BY_KEY: Record<FeatureKey, FeatureSwitchDef> = Object.fromEntries(
  FEATURE_SWITCHES.map((f) => [f.key, f]),
) as Record<FeatureKey, FeatureSwitchDef>

const FEATURE_BY_MODULE: ReadonlyMap<string, FeatureSwitchDef> = new Map(FEATURE_SWITCHES.map((f) => [f.moduleId, f]))

/** The switch that governs a module, or null for a day-one module. */
export function featureForModule(moduleId: string): FeatureSwitchDef | null {
  return FEATURE_BY_MODULE.get(moduleId) ?? null
}

/** The on/off state of every switch, as the gate reads it. */
export type FeatureSwitchState = Readonly<Record<FeatureKey, boolean>>

/** Every door open — the pre-S3 world, and the fail-open default. */
export const ALL_ON: FeatureSwitchState = Object.fromEntries(FEATURE_SWITCHES.map((f) => [f.key, true])) as FeatureSwitchState

/** Every door closed — what a new clinic meets. */
export const ALL_OFF: FeatureSwitchState = Object.fromEntries(FEATURE_SWITCHES.map((f) => [f.key, false])) as FeatureSwitchState

/**
 * The doors a PERSON closed (`clinic_profile.doors_closed`, audit round 2):
 * key → the ISO instant of the close. Untrusted jsonb in, only known keys
 * with string values out; anything else is an empty memory.
 */
export function parseDoorsClosed(raw: unknown): Partial<Record<FeatureKey, string>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Partial<Record<FeatureKey, string>> = {}
  for (const f of FEATURE_SWITCHES) {
    const v = (raw as Record<string, unknown>)[f.key]
    if (typeof v === 'string' && v) out[f.key] = v
  }
  return out
}

/**
 * Split a module list into the modules that show (day-one modules and
 * switched-on ones) and the ones waiting in "Add" (switched off). Order
 * is preserved on both sides.
 */
export function splitModulesBySwitch(modules: readonly ModuleDef[], state: FeatureSwitchState): { on: ModuleDef[]; add: ModuleDef[] } {
  const on: ModuleDef[] = []
  const add: ModuleDef[] = []
  for (const m of modules) {
    const f = featureForModule(m.id)
    if (!f || state[f.key]) on.push(m)
    else add.push(m)
  }
  return { on, add }
}

/** Module ids that carry a switch — the bundle gate stands aside for these. */
export const SWITCHED_MODULE_IDS: ReadonlySet<string> = new Set(FEATURE_SWITCHES.map((f) => f.moduleId))

/** The keys an activation event opens on its own. */
export function doorsOpenedBy(event: 'a1' | 'site_live'): FeatureKey[] {
  return FEATURE_SWITCHES.filter((f) => f.autoOpen === event).map((f) => f.key)
}

/** The intro's copy — one place, so the button and the refusal agree. */
export const FEATURE_INTRO = {
  notOn: 'Not turned on',
  turnOn: (label: string) => `Turn on ${label}`,
  turnOff: (label: string) => `Turn off ${label}`,
  askManager: 'An owner or admin can turn this on.',
  onlyManagers: 'Only an owner or admin can change what is turned on.',
  turnOffConfirm: (label: string) =>
    `Turn off ${label}? Nothing is deleted — it leaves the sidebar and comes back the moment you turn it on again.`,
} as const
