import Image from "next/image"
import { type ShotName, shots } from "./shots"

/**
 * A real app screenshot that follows the page theme. Both images are lazy and the hidden one is
 * `display: none`, so only the visible theme's file loads (Next's theme-image pattern). Pass
 * `high` for the first screen: `preload` would load both. Fills its positioned parent.
 */
export function Shot({
  name,
  alt,
  sizes,
  position = "center top",
  high = false,
}: {
  name: ShotName
  alt: string
  sizes: string
  /** `object-position` of the crop. */
  position?: string
  high?: boolean
}) {
  const { light, dark } = shots[name]
  const common = {
    alt,
    sizes,
    fill: true,
    placeholder: "blur" as const,
    fetchPriority: high ? ("high" as const) : undefined,
    style: { objectFit: "cover" as const, objectPosition: position },
  }
  return (
    <>
      <Image {...common} src={light} className="dark:hidden" />
      <Image {...common} src={dark} className="hidden dark:block" />
    </>
  )
}
