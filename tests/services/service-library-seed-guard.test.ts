/**
 * Guard: the deploy-time `seedServiceLibrary()` must NOT overwrite a row a
 * platform admin hand-edited in the dashboard (`editedByAdmin = true`). Without
 * this, every deploy would silently undo the admin's edit and snap the canon
 * back to the in-code seed. We mock the DB to record which slugs get an UPDATE
 * vs INSERT and assert the edited row is left untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const updated: Array<{ slug?: string }> = []
const inserted: Array<{ slug?: string }> = []
let existingRows: Array<{ slug: string; editedByAdmin: boolean }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: async () => existingRows }),
    update: () => ({
      set: (v: { slug?: string }) => {
        updated.push(v)
        return { where: async () => undefined }
      },
    }),
    insert: () => ({ values: async (v: { slug?: string }) => { inserted.push(v) } }),
  },
}))

import { seedServiceLibrary } from '@/lib/services/service-library'
import { SERVICE_LIBRARY_SEED } from '@/lib/services/service-library-seed'

const EDITED = SERVICE_LIBRARY_SEED[0].slug
const PLAIN = SERVICE_LIBRARY_SEED[1].slug

beforeEach(() => {
  updated.length = 0
  inserted.length = 0
  existingRows = []
})

describe('seedServiceLibrary — respects dashboard edits', () => {
  it('skips the UPDATE for an admin-edited row but refreshes a plain existing row', async () => {
    existingRows = [
      { slug: EDITED, editedByAdmin: true },
      { slug: PLAIN, editedByAdmin: false },
    ]
    await seedServiceLibrary()

    const updatedSlugs = updated.map((v) => v.slug)
    const insertedSlugs = inserted.map((v) => v.slug)

    // The admin-edited row is left completely alone.
    expect(updatedSlugs).not.toContain(EDITED)
    expect(insertedSlugs).not.toContain(EDITED)
    // A plain existing row still gets the canonical refresh.
    expect(updatedSlugs).toContain(PLAIN)
  })

  it('still inserts brand-new seed entries that do not exist yet', async () => {
    existingRows = [] // nothing in the table
    await seedServiceLibrary()
    // Every seed entry is missing → all inserted, none updated.
    expect(updated).toHaveLength(0)
    expect(inserted.length).toBe(SERVICE_LIBRARY_SEED.length)
  })
})
