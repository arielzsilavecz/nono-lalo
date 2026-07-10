import type { CSSProperties } from 'react'

/**
 * Pan/zoom transform for the sharp dish image. Rendered by <DishImage>, which
 * shows the whole image (object-contain) over a blurred fill and applies this on
 * top: `zoom` 1 = whole image centered, higher zooms in, `position` pans.
 *
 * Every dish-image box uses the SAME `aspect-2/1` ratio so a given
 * position/zoom frames the same way everywhere. The class is written literally
 * in each JSX file so Tailwind's scanner detects it.
 *
 * `position` is stored as "TX% TY%" translate percentages (relative to the box).
 * Legacy values like "center center" parse to 0/0 (centered).
 */
export function imageFitStyle(position: string | null | undefined, zoom: number | null | undefined): CSSProperties {
  const [rawX, rawY] = (position ?? '').split(' ').map((v) => parseFloat(v))
  const tx = Number.isFinite(rawX) ? rawX : 0
  const ty = Number.isFinite(rawY) ? rawY : 0
  const z = Number.isFinite(zoom) && (zoom as number) > 0 ? (zoom as number) : 1
  return { transform: `translate(${tx}%, ${ty}%) scale(${z})` }
}
