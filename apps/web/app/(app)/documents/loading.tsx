import { Card, CardHeader, CardPanel } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const ROWS = ["a", "b", "c", "d", "e"]

/** Shown while the documents list streams in. Mirrors the page layout. */
export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Loading documents…</span>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardPanel className="flex flex-col gap-3">
          {ROWS.map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
          ))}
        </CardPanel>
      </Card>
    </div>
  )
}
