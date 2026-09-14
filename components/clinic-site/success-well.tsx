import { brandWash, brandWashInk } from '@/lib/clinic-site-theme'

/**
 * The round brand-tinted well with a check in it that every public
 * confirmation page ends on — booking confirmed, request sent, intake
 * finished, packet complete.
 *
 * It is shared because the five copies had already drifted into two spellings
 * and one of them was broken: three passed `brandFill(brand) + '22'`, which
 * concatenates a hex alpha suffix onto a `var()` and is therefore not a
 * colour, so those three rendered with no background at all — a bare tick
 * floating on the page. The other two used `brand + '22'`, which works but
 * puts a pale brand's own check on a 13% wash of itself.
 *
 * Both are answered by the palette roles the template already owns:
 * `brandWash` for the surface and `brandWashInk` for the mark, which
 * `buildClinicPalette` grades to 4.5:1 against it. So a sage clinic gets a
 * deep sage tick on a pale sage disc rather than a faint one, and it holds on
 * every registered template.
 *
 * The icon is `aria-hidden` on purpose — every use sits directly above a
 * heading that says what happened, and "check mark" read aloud before "You're
 * booked" is noise, not information.
 */
export function SuccessWell({ brand, className = '' }: { brand: string; className?: string }) {
  return (
    <div
      className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${className}`}
      style={{ backgroundColor: brandWash(brand) }}
    >
      <svg
        className="w-10 h-10"
        style={{ color: brandWashInk(brand) }}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  )
}
