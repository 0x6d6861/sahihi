import { cn } from "@/lib/utils"

/**
 * One auth step: an `h1`, an optional line under it (a link to the other flow, or what happens next)
 * and the form. It sits straight on the page beside the brand panel, so it has no card around it.
 */
export function AuthForm({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <section className={cn("flex w-full max-w-sm flex-col gap-6", className)}>
      <header className="flex flex-col gap-2">
        <h1 className="font-medium text-3xl text-foreground tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </header>
      {children}
    </section>
  )
}

/** The "or" rule between two ways in (passkey, email). */
export function AuthDivider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-muted-foreground text-xs" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
