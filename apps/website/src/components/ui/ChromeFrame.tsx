import type { ReactNode } from "react"

/**
 * Brushed-chrome bezel that wraps every product screen.
 * `aspect` sets the screen ratio (e.g. "16/10"); children fill the screen.
 * `quiet` swaps the metal for a hairline and a soft shadow (the hero's small illustrations).
 */
export function ChromeFrame({
  children,
  aspect = "16/10",
  className = "",
  quiet = false,
}: {
  children: ReactNode
  aspect?: string
  className?: string
  quiet?: boolean
}) {
  return (
    <div className={`frame ${className}`}>
      <div className={quiet ? "bezel-quiet" : "bezel"}>
        <div className="bezel-screen" style={{ aspectRatio: aspect }}>
          {children}
        </div>
      </div>
    </div>
  )
}
