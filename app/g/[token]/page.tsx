import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGradeByToken } from '@/lib/services/practice-grader'
import ReportView from './report-view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your practice’s online grade — DreamCRM',
  // Token-auth page: anyone with the link can read it, so crawlers must not
  // index it (robots.txt disallows /g/ too — belt + suspenders).
  robots: { index: false, follow: false },
}

/**
 * The public grade report — /g/<token>, token IS the auth (the /r /d
 * pattern). Data + gate live here; the whole visual body is ReportView
 * (framework-free so the offline design harness renders it too).
 */
export default async function GradeReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const view = await getGradeByToken(token)
  if (!view) notFound()
  return <ReportView view={view} />
}
