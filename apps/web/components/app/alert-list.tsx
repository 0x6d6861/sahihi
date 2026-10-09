import { cn } from "@/lib/utils"

/**
 * A list inside an Arc `Alert`. The Alert's body is a `<p>`, which can't hold a `<ul>` (invalid
 * HTML, a hydration error), so this is spans with list roles.
 */
export function AlertList({
  bullets = false,
  className,
  children,
}: {
  bullets?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a <ul> can't sit in the Alert's <p>
    <span role="list" className={cn("flex flex-col gap-1", bullets && "list-disc ps-4", className)}>
      {children}
    </span>
  )
}

export function AlertListItem({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: an <li> needs a <ul>, which can't sit in a <p>
    <span role="listitem" className={cn("list-item", className)}>
      {children}
    </span>
  )
}
