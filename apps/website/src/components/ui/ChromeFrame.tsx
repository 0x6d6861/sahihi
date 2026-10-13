import type { ReactNode } from "react"

/**
 * Brushed-chrome bezel that wraps every product mockup.
 * `aspect` sets the screen ratio (e.g. "16/10"); children fill the screen.
 */
export function ChromeFrame({
  children,
  aspect = "16/10",
  className = "",
}: {
  children: ReactNode
  aspect?: string
  className?: string
}) {
  return (
    <div className={`mockup ${className}`}>
      <div className="bezel">
        <div className="bezel-screen" style={{ aspectRatio: aspect }}>
          {children}
        </div>
      </div>
    </div>
  )
}
