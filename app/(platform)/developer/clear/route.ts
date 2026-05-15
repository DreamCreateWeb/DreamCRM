import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies()
  cookieStore.delete('demo_context')
  redirect('/dashboard')
}
