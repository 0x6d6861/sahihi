import { LayoutTemplateIcon, MailIcon } from "@/components/app/icons"
import { cn } from "@/lib/utils"

/**
 * The type mark before an envelope's or a template's name, in lists and grids alike (ADR 0036).
 * Neutral on purpose: colour on these pages means status (ADR 0023), and the PDF mark on
 * documents is the only branded file colour.
 */
export function EnvelopeTypeIcon({ className }: { className?: string }) {
  return <MailIcon aria-hidden className={cn("size-5 shrink-0 text-muted-foreground", className)} />
}

export function TemplateTypeIcon({ className }: { className?: string }) {
  return (
    <LayoutTemplateIcon
      aria-hidden
      className={cn("size-5 shrink-0 text-muted-foreground", className)}
    />
  )
}
