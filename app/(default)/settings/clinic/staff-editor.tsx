'use client'

import { useState, useRef } from 'react'
import type { ClinicStaff } from '@/lib/types/clinic-content'
import FocalPointPicker from '@/components/ui/focal-point-picker'
import { uploadFileWithProgress, UploadCancelledError, type UploadHandle } from '@/lib/upload-with-progress'
import { AddButton, EditorCard, EmptyHint, Field, inputCls, textareaCls } from '@/components/ui/editor-kit'

interface Props {
  name: string
  defaultValue?: ClinicStaff[] | null
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function kebab(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

/** Parse a newline/comma-separated specialties textarea into a clean
 *  `string[]`. Trims each token, drops empties, returns null when the result
 *  is empty so the JSON column matches the type's null-when-absent contract. */
function parseSpecialties(raw: string): string[] | null {
  const list = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return list.length > 0 ? list : null
}

export default function StaffEditor({ name, defaultValue }: Props) {
  const [items, setItems] = useState<ClinicStaff[]>(defaultValue ?? [])

  function update(idx: number, patch: Partial<ClinicStaff>) {
    setItems((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  function move(idx: number, dir: -1 | 1) {
    setItems((prev) => {
      const swap = idx + dir
      if (swap < 0 || swap >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }
  function add() {
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        name: '',
        title: '',
        bio: '',
        photoUrl: null,
        slug: null,
        credentials: null,
        specialties: null,
        funFact: null,
        bookHref: null,
      },
    ])
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="space-y-3">
        {items.length === 0 && (
          <EmptyHint>
            No team members yet. Add your dentists, hygienists, and front-desk staff — they
            appear on your homepage and the Team page.
          </EmptyHint>
        )}
        {items.map((s, i) => (
          <StaffRow
            key={s.id}
            index={i}
            total={items.length}
            value={s}
            onChange={(patch) => update(i, patch)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onRemove={() => remove(i)}
          />
        ))}
      </div>
      <AddButton onClick={add}>Add team member</AddButton>
    </div>
  )
}

function StaffRow({
  index,
  total,
  value,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  index: number
  total: number
  value: ClinicStaff
  onChange: (patch: Partial<ClinicStaff>) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  // Upload type/size/server failures were silently swallowed before — surface
  // them like ImageUploader does so a bad photo upload never fails quietly.
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [reposition, setReposition] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const handleRef = useRef<UploadHandle | null>(null)
  // Local textarea state for specialties so we don't fight controlled-input
  // round-tripping the array -> string conversion on every keystroke.
  const [specialtiesText, setSpecialtiesText] = useState((value.specialties ?? []).join('\n'))

  async function handleUpload(file: File) {
    setUploadError(null)
    if (!file.type.startsWith('image/')) {
      setUploadError('Please pick an image file.')
      return
    }
    // 8MB matches the server's IMAGE_MAX_BYTES (was a silent 5MB drop).
    if (file.size > 8 * 1024 * 1024) {
      setUploadError('That image is over 8MB — pick a smaller one.')
      return
    }
    setUploading(true)
    setProgress(0)
    const handle = uploadFileWithProgress(file, 'clinic-staff', setProgress)
    handleRef.current = handle
    try {
      const url = await handle.promise
      onChange({ photoUrl: url })
    } catch (err) {
      if (!(err instanceof UploadCancelledError)) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      }
    } finally {
      setUploading(false)
      handleRef.current = null
    }
  }

  const derivedSlug = value.name ? kebab(value.name) : ''

  return (
    <EditorCard
      label={`Team member ${index + 1}`}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      canMoveUp={index > 0}
      canMoveDown={index < total - 1}
      onRemove={onRemove}
    >
      <div className="flex gap-4">
        {/* Photo column */}
        <div className="shrink-0 flex flex-col items-center gap-1.5 w-20">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-xs text-gray-400 hover:border-gray-400 transition relative"
            aria-label="Upload photo"
          >
            {value.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={value.photoUrl}
                alt=""
                className="w-full h-full object-cover"
                style={value.photoPosition ? { objectPosition: value.photoPosition } : undefined}
              />
            ) : (
              'Add photo'
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center gap-1 text-white text-[10px] leading-none">
                <span>{progress}%</span>
              </div>
            )}
          </button>
          {uploading && (
            <button
              type="button"
              onClick={() => handleRef.current?.cancel()}
              className="text-[11px] text-gray-400 hover:text-rose-600 leading-tight"
            >
              Cancel
            </button>
          )}
          {uploadError && (
            <p className="text-[11px] text-rose-600 text-center leading-tight" role="alert">
              {uploadError}
            </p>
          )}
          {value.photoUrl && !uploading && (
            <button
              type="button"
              onClick={() => setReposition((v) => !v)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 leading-tight"
            >
              {reposition ? 'Done' : '◎ Reposition'}
            </button>
          )}
          {reposition && value.photoUrl && (
            <div className="w-24">
              <FocalPointPicker
                compact
                src={value.photoUrl}
                aspectClass="aspect-[4/5]"
                value={value.photoPosition ?? '50% 50%'}
                onChange={(pos) => onChange({ photoPosition: pos })}
              />
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleUpload(file)
              e.target.value = ''
            }}
          />
        </div>

        {/* Fields — min-w-0 lets them shrink instead of overflowing the modal. */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                type="text"
                value={value.name}
                onChange={(e) => onChange({ name: e.target.value })}
                className={inputCls}
                placeholder="Dr. Jane Smith"
              />
            </Field>
            <Field label="Title">
              <input
                type="text"
                value={value.title ?? ''}
                onChange={(e) => onChange({ title: e.target.value })}
                className={inputCls}
                placeholder="Lead Dentist"
              />
            </Field>
          </div>
          <Field label="Credentials">
            <input
              type="text"
              value={value.credentials ?? ''}
              onChange={(e) => onChange({ credentials: e.target.value || null })}
              className={inputCls}
              placeholder="DDS · 12 years experience"
            />
          </Field>
          <Field label="Bio">
            <textarea
              value={value.bio ?? ''}
              onChange={(e) => onChange({ bio: e.target.value })}
              className={textareaCls}
              rows={3}
              placeholder="A few sentences about who they are and their approach."
            />
          </Field>
          <Field label="Specialties" hint="One per line — e.g. Family dentistry, Pediatric care.">
            <textarea
              value={specialtiesText}
              onChange={(e) => {
                setSpecialtiesText(e.target.value)
                onChange({ specialties: parseSpecialties(e.target.value) })
              }}
              className={textareaCls}
              rows={2}
              placeholder={'Family dentistry\nRestorative care'}
            />
          </Field>
          <Field label="Outside the office" hint="A humanizing detail shown on their profile.">
            <input
              type="text"
              value={value.funFact ?? ''}
              onChange={(e) => onChange({ funFact: e.target.value || null })}
              className={inputCls}
              placeholder="When she's not in the chair, she's hiking the Hill Country."
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="URL slug" hint={derivedSlug ? `Defaults to “${derivedSlug}”.` : undefined}>
              <input
                type="text"
                value={value.slug ?? ''}
                onChange={(e) => onChange({ slug: e.target.value || null })}
                className={inputCls}
                placeholder={derivedSlug || 'a-z, 0-9, dashes'}
              />
            </Field>
            <Field label="Booking URL override">
              <input
                type="text"
                value={value.bookHref ?? ''}
                onChange={(e) => onChange({ bookHref: e.target.value || null })}
                className={inputCls}
                placeholder="/book?provider=jane"
              />
            </Field>
          </div>
        </div>
      </div>
    </EditorCard>
  )
}
