// Re-export every schema namespace so server code can do
//   import { db, schema } from '@/lib/db'
//   db.select().from(schema.user)            // auth
//   db.select().from(schema.clinicProfile)    // platform
//   db.select().from(schema.patient)          // clinic
//   db.select().from(schema.customers)        // domain

export * from './auth'
export * from './platform'
export * from './clinic'
export * from './domain'
export * from './email'
export * from './referrals'
export * from './prospecting'
