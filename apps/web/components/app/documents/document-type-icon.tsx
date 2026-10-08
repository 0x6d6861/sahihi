import type { DocumentStatus } from "@sahihi/core"
import { PdfIcon } from "@/components/app/icons"
import { cn } from "@/lib/utils"

/**
 * The file-type mark before a document's name, shared by the list and the grid so they match.
 * Every document is a PDF; a failed upload's mark is muted, since there's no file behind it.
 */
export function DocumentTypeIcon({
  status,
  className,
}: {
  status: DocumentStatus
  className?: string
}) {
  return (
    <PdfIcon
      aria-hidden
      className={cn(
        "size-5 shrink-0",
        status === "FAILED" ? "text-muted-foreground" : "text-destructive-foreground",
        className,
      )}
    />
  )
}
