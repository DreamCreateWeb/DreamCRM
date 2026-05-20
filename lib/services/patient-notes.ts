import 'server-only'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newPatientNoteId } from './patients'

export interface PatientNoteRow {
  id: string
  body: string
  authorId: string | null
  authorName: string | null
  createdAt: Date
}

export async function listPatientNotes(
  organizationId: string,
  patientId: string,
): Promise<PatientNoteRow[]> {
  const rows = await db
    .select({
      id: schema.patientNote.id,
      body: schema.patientNote.body,
      authorId: schema.patientNote.authorId,
      authorName: schema.user.name,
      createdAt: schema.patientNote.createdAt,
    })
    .from(schema.patientNote)
    .leftJoin(schema.user, eq(schema.patientNote.authorId, schema.user.id))
    .where(
      and(
        eq(schema.patientNote.organizationId, organizationId),
        eq(schema.patientNote.patientId, patientId),
        isNull(schema.patientNote.deletedAt),
      ),
    )
    .orderBy(desc(schema.patientNote.createdAt))
  return rows
}

export interface AddPatientNoteInput {
  organizationId: string
  patientId: string
  authorId: string | null
  body: string
}

export async function addPatientNote(input: AddPatientNoteInput): Promise<string> {
  const trimmed = input.body.trim()
  if (!trimmed) throw new Error('Note body is required')
  const id = newPatientNoteId()
  await db.insert(schema.patientNote).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    authorId: input.authorId,
    body: trimmed,
  })
  return id
}

export async function deletePatientNote(organizationId: string, noteId: string) {
  await db
    .update(schema.patientNote)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(schema.patientNote.organizationId, organizationId), eq(schema.patientNote.id, noteId)),
    )
}
