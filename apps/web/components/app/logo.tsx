import { cn } from "@/lib/utils"

/**
 * The Sahihi mark: ※ drawn as a stamp, a saltire with a square in each gap, the same mark as the
 * website's (`apps/website/src/components/ui/Logo.tsx`; the site can't be imported, so the paths are
 * copied). It takes the text colour, so it follows the theme. `app/icon.svg` is the tab icon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-5 shrink-0", className)}>
      <path
        d="M5.9 5.9l12.2 12.2M18.1 5.9L5.9 18.1"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="square"
      />
      <rect x="10" y="0.9" width="4" height="4" fill="currentColor" />
      <rect x="19.1" y="10" width="4" height="4" fill="currentColor" />
      <rect x="10" y="19.1" width="4" height="4" fill="currentColor" />
      <rect x="0.9" y="10" width="4" height="4" fill="currentColor" />
    </svg>
  )
}
