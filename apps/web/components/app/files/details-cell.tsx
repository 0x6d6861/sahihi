import { Badge } from "@/components/app/badge"
import { TableCell } from "@/components/ui/table"
import type { BadgeTone } from "@/lib/constants"

/**
 * The Details column of the All files list (recipients, the source document, folder contents) on one
 * truncated line. Hidden below `lg`; table rows stay one line high.
 */
export function DetailsCell({ text }: { text: string }) {
  return (
    <TableCell className="text-muted-foreground max-lg:hidden">
      <span className="block max-w-64 truncate" title={text}>
        {text}
      </span>
    </TableCell>
  )
}

/** The Type column: Document, Envelope, Template or Folder. From `md`. */
export function TypeCell({ children }: { children: React.ReactNode }) {
  return (
    <TableCell className="whitespace-nowrap text-muted-foreground max-md:hidden">
      {children}
    </TableCell>
  )
}

/** The Status column: one Arc badge (tone = meaning), or nothing. From `md`. */
export function StatusCell({ status }: { status: { label: string; tone: BadgeTone } | null }) {
  return (
    <TableCell className="whitespace-nowrap max-md:hidden">
      {status && (
        <Badge tone={status.tone} size="sm">
          {status.label}
        </Badge>
      )}
    </TableCell>
  )
}
