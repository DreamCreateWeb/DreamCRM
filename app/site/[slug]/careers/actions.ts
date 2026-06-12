'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { jobPosting } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { createApplication } from '@/lib/services/careers'
import { uploadBlob } from '@/lib/blob'
import { sendContactRequestEmail } from '@/lib/email'
import { ALLOWED_RESUME_TYPES, MAX_RESUME_BYTES } from '@/lib/types/careers'
import { looksLikeBot } from '@/lib/form-trust'

export async function submitApplication(formData: FormData) {
  // Silent spam drop — honeypot / instant-submit returns normally (no throw =
  // success in the apply form) without creating an application row.
  if (looksLikeBot(formData)) return

  const orgId = formData.get('orgId')?.toString()
  const jobPostingId = formData.get('jobPostingId')?.toString()
  const name = formData.get('name')?.toString().trim()
  const email = formData.get('email')?.toString().trim()
  const phone = formData.get('phone')?.toString().trim() || null
  const linkedinUrl = formData.get('linkedinUrl')?.toString().trim() || null
  const coverNote = formData.get('coverNote')?.toString().trim() || null

  if (!orgId || !jobPostingId) throw new Error('Missing job reference')
  if (!name) throw new Error('Please enter your name')
  if (!email) throw new Error('Please enter your email')

  // Verify the job is real, belongs to this org, and is open — never trust
  // the hidden orgId/jobId from the client.
  const [job] = await db
    .select({ id: jobPosting.id, title: jobPosting.title })
    .from(jobPosting)
    .where(
      and(eq(jobPosting.id, jobPostingId), eq(jobPosting.organizationId, orgId), eq(jobPosting.status, 'open')),
    )
    .limit(1)
  if (!job) throw new Error('This position is no longer accepting applications.')

  let resumeUrl: string | null = null
  const resume = formData.get('resume')
  if (resume instanceof File && resume.size > 0) {
    if (resume.size > MAX_RESUME_BYTES) throw new Error('Résumé must be under 5MB.')
    // Require a recognised type — an absent/empty Content-Type must NOT slip an
    // arbitrary file through (it previously short-circuited the check).
    if (!resume.type || !(ALLOWED_RESUME_TYPES as readonly string[]).includes(resume.type)) {
      throw new Error('Résumé must be a PDF or Word document.')
    }
    const safe = (resume.name || 'resume').replace(/[^a-z0-9_.-]/gi, '_')
    const res = await uploadBlob(`resumes/${orgId}/${Date.now()}-${safe}`, resume, {
      contentType: resume.type || undefined,
    })
    resumeUrl = res.url
  }

  await createApplication({
    organizationId: orgId,
    jobPostingId,
    name,
    email,
    phone,
    linkedinUrl,
    coverNote,
    resumeUrl,
    source: 'career_site',
  })

  // Best-effort: notify the office an application arrived. Never fail the
  // applicant's submit on email trouble.
  const [profile] = await db
    .select({ email: clinicProfile.email, displayName: clinicProfile.displayName })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)
  if (profile?.email) {
    sendContactRequestEmail(profile.email, {
      clinicName: profile.displayName ?? 'Your Clinic',
      patientName: name,
      phone: phone ?? '',
      email,
      preferredDate: null,
      message: `New application for "${job.title}". Review it in Careers → Applicants.`,
    }).catch((err) => console.error('[careers] application email failed', err))
  }
}
