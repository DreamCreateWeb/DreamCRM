import type { CSSProperties, ElementType, ReactNode } from 'react'

/**
 * Editable primitives — the template author's Studio wiring, for free.
 *
 * Any template that renders content through these gets the Website Studio's
 * inline editing, AI targeting, and undo without knowing how the Studio
 * works: they emit exactly the `data-edit-*` attributes the EditBridge
 * (components/clinic-site/edit-bridge.tsx) listens for, so the
 * bridge ⇄ website-studio postMessage contract never changes per template.
 * tests/studio/field-wiring.test.ts scans for BOTH raw `data-edit-field`
 * markup and these call sites, and cross-checks every field against the
 * Studio's save registries — a template can't ship a dead edit affordance.
 *
 * Field grammar (unchanged from the raw attributes):
 *   - a clinic_profile column name        → 'tagline', 'heroImageUrl'
 *   - a copy-override region              → 'copy:home.differenceHeadline'
 *   - a section modal                     → 'services', 'faq', 'hours', …
 */

interface EditTextProps {
  /** clinic_profile column or `copy:*` override key this text saves to. */
  field: string
  /** Element to render (h1, p, span, …). Defaults to span. */
  as?: ElementType
  /** Human label the Studio shows on hover/focus. */
  label?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Inline-editable text region (EditBridge kind="text"). */
export function EditText({ field, as, label, className, style, children }: EditTextProps) {
  const Tag = (as ?? 'span') as ElementType
  return (
    <Tag
      data-edit-field={field}
      data-edit-kind="text"
      {...(label ? { 'data-edit-label': label } : {})}
      className={className}
      style={style}
    >
      {children}
    </Tag>
  )
}

interface EditImageProps {
  /** clinic_profile image column ('heroImageUrl', 'logoUrl', …). */
  field: string
  label?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Click-to-swap image region (EditBridge kind="image"). Wrap the rendered
 *  <img>/<div> — the Studio opens its uploader + focal-point picker. */
export function EditImage({ field, label, className, style, children }: EditImageProps) {
  return (
    <div
      data-edit-field={field}
      data-edit-kind="image"
      {...(label ? { 'data-edit-label': label } : {})}
      className={className}
      style={style}
    >
      {children}
    </div>
  )
}

interface EditModalProps {
  /** Section key mapped in the Studio's FORM_SECTION_SAVES / SECTION_TITLES
   *  (services, staff, faq, hours, …). */
  field: string
  label?: string
  /** AI-targeting / scroll anchor (data-edit-section). */
  section?: string
  as?: ElementType
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** Section whose editor is a Studio modal (EditBridge kind="modal"). */
export function EditModal({ field, label, section, as, className, style, children }: EditModalProps) {
  const Tag = (as ?? 'div') as ElementType
  return (
    <Tag
      data-edit-field={field}
      data-edit-kind="modal"
      {...(label ? { 'data-edit-label': label } : {})}
      {...(section ? { 'data-edit-section': section } : {})}
      className={className}
      style={style}
    >
      {children}
    </Tag>
  )
}
