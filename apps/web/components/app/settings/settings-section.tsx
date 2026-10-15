import { cn } from "@/lib/utils"

/**
 * A section of a Settings page: the heading and its one-line description sit on the page, the
 * section's rows or form in a bordered card under them, like the design's grouped settings. Same
 * props as `Panel`, so a section can switch between them; `className` goes to the card.
 */
export function SettingsSection({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  const hasHeader = title || description || actions
  return (
    <section className="flex flex-col gap-3">
      {hasHeader && (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {title && <h2 className="font-medium text-foreground text-lg">{title}</h2>}
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children && (
        <div className={cn("flex flex-col gap-5 rounded-2xl border bg-card p-5", className)}>
          {children}
        </div>
      )}
    </section>
  )
}
