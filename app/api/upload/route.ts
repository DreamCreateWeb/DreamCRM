import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/session'
import { uploadBlob } from '@/lib/blob'

export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file')
  const folder = (form.get('folder') as string | null) ?? 'uploads'

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'no file' }, { status: 400 })
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'file too large (max 50MB)' }, { status: 413 })
  }

  const name = (file as File).name || 'upload.bin'
  const safe = name.replace(/[^a-z0-9_.-]/gi, '_')
  const result = await uploadBlob(`${folder}/${session.user.id}/${Date.now()}-${safe}`, file, {
    contentType: file.type || undefined,
  })

  return NextResponse.json(result)
}
