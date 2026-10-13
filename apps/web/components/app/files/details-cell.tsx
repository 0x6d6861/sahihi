import { TableCell } from "@/components/ui/table"

/**
 * The Details column of the All files list: what used to be a second line under the name (type,
 * recipients, progress, folder contents), on one truncated line. Hidden below `lg`; table rows
 * stay one line high.
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
