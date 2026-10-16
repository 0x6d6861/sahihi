import { LogoMark } from "@/components/app/logo"
import { brandingLogoPath } from "@/lib/account"
import { cn } from "@/lib/utils"

/**
 * The signing page's top bar (64px): the sender's logo when the workspace has one, else Sahihi's
 * mark and name; the envelope's title and who it's from once known; `children` on the right (the
 * progress and "Go to next field" while signing).
 */
export function SignHeader({
  envelope,
  children,
}: {
  envelope?: {
    title: string
    organization: { name: string; logo?: string | null }
    sender: { name: string }
  }
  children?: React.ReactNode
}) {
  const logoPath = envelope ? brandingLogoPath(envelope.organization.logo) : null
  return (
    <header className="z-10 flex min-h-16 shrink-0 items-center gap-4 border-b bg-background py-2.5 ps-6 pe-5 max-md:flex-wrap max-md:ps-4 max-md:pe-4 max-lg:sticky max-lg:top-0">
      {logoPath && envelope ? (
        // Logos are drawn for white backgrounds (emails), so they sit on paper in dark mode too.
        <span className="on-paper shrink-0 rounded-lg bg-background px-2 py-1">
          {/* biome-ignore lint/performance/noImgElement: same-origin branding route */}
          <img
            src={logoPath}
            alt={envelope.organization.name}
            className="h-7 w-auto max-w-32 object-contain"
          />
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2 font-medium text-lg">
          <LogoMark className="size-4" />
          Sahihi
        </span>
      )}
      {envelope && (
        <>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border max-sm:hidden" />
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <h1 className="truncate font-medium text-sm" title={envelope.title}>
              {envelope.title}
            </h1>
            <p className="truncate text-muted-foreground text-xs">
              From {envelope.sender.name} · {envelope.organization.name}
            </p>
          </div>
        </>
      )}
      {children && (
        <div className="ml-auto flex shrink-0 items-center gap-4 max-md:w-full max-md:justify-between">
          {children}
        </div>
      )}
    </header>
  )
}

export type StatusTone = "success" | "primary" | "warning" | "danger" | "muted"

const TONES: Record<StatusTone, string> = {
  success: "bg-success/12 text-success-foreground",
  primary: "bg-primary/12 text-primary",
  warning: "bg-warning/12 text-warning-foreground",
  danger: "bg-destructive/10 text-destructive-foreground",
  muted: "bg-muted text-muted-foreground",
}

/**
 * A state of the signing link that isn't the document (signed, declined, expired, the code step…):
 * one 440px card centred on the canvas, with an icon in a tinted circle, a title and a line.
 */
export function StatusCard({
  icon: Icon,
  tone = "primary",
  title,
  description,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  tone?: StatusTone
  title: string
  description: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:pb-26">
      <section
        aria-labelledby="status-title"
        className={cn(
          "enter-fade flex w-full max-w-[440px] flex-col gap-4 rounded-(--radius-panel) border bg-card p-6 sm:p-7",
          className,
        )}
      >
        {Icon && (
          <span
            className={cn("flex size-10 items-center justify-center rounded-full", TONES[tone])}
          >
            <Icon aria-hidden className="size-5" />
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          <h2 id="status-title" className="font-medium text-[22px] leading-[1.45] tracking-tight">
            {title}
          </h2>
          <div className="text-muted-foreground text-sm leading-normal">{description}</div>
        </div>
        {children}
      </section>
    </div>
  )
}
