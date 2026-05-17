export const CALENDAR_CATEGORIES = ['work', 'personal', 'reservation', 'event', 'misc'] as const
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number]

export const CATEGORY_COLOR: Record<CalendarCategory, string> = {
  work: 'sky',
  personal: 'green',
  reservation: 'violet',
  event: 'red',
  misc: 'yellow',
}

export const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  work: 'Work',
  personal: 'Life & Family',
  reservation: 'Reservations',
  event: 'Events',
  misc: 'Misc',
}
