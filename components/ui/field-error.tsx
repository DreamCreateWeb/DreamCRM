/**
 * Inline field-level error, shown directly under an input. Pair with
 * `aria-invalid` + `aria-describedby={id}` on the field so assistive tech ties
 * the message to it. Renders nothing when there's no error.
 */
export function FieldError({ id, message }: { id?: string; message?: string | null }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">
      {message}
    </p>
  )
}

export default FieldError
