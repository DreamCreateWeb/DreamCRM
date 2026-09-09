import 'server-only'

// Tiny pure helpers shared by the seed data and the seeders.

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}


export function phoneNumber(): string {
  return `(512) 555-${String(1000 + Math.floor(Math.random() * 9000))}`
}

/**
 * Round a Date down to the nearest :00 or :30 minute boundary. Used when
 * seeding demo appointments so times look like a real clinic schedule
 * regardless of when the seeder runs.
 */
export function snapToHalfHour(d: Date): Date {
  const r = new Date(d)
  r.setMinutes(r.getMinutes() < 30 ? 0 : 30, 0, 0)
  return r
}
