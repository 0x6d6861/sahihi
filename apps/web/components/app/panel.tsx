import { cn } from "@/lib/utils"

/**
 * A titled, bordered section: the page-level grouping Arc's composition rules call for (cards rest on
 * a border, no shadow, no nesting). Arc's own `Card` is a content card (media, byline, quick look), so
 * forms, settings and detail blocks use this instead (ADR 0023).
 */
export function Panel({
  title,
  description,
  actions,
  headingLevel = 2,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  headingLevel?: 1 | 2 | 3
  className?: string
  children?: React.ReactNode
}) {
  const Heading = `h${headingLevel}` as const
  const hasHeader = title || description || actions
  return (
    <section className={cn("flex flex-col gap-5 rounded-2xl border bg-card p-6", className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && (
              <Heading
                className={cn(
                  "font-medium text-foreground",
                  headingLevel === 1 ? "text-2xl tracking-tight" : "text-base",
                )}
              >
                {title}
              </Heading>
            )}
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}
