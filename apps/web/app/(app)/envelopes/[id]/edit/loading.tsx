import { Skeleton } from "@/components/ui/skeleton"

const ROWS = ["a", "b", "c", "d", "e"]

/** The draft editor's columns, inside the app shell, while it renders on the server. */
export default function EditorLoading() {
  return (
    <div className="flex h-full min-h-0" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex w-64 shrink-0 flex-col gap-3 border-r bg-sidebar p-4 max-md:hidden">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-2 w-full" />
        {ROWS.map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="ml-auto h-8 w-20" />
        </div>
        <div className="flex min-h-0 flex-1">
          <Skeleton className="m-6 flex-1" />
          <div className="flex w-72 shrink-0 flex-col gap-3 border-l p-4 max-lg:hidden">
            {ROWS.map((key) => (
              <Skeleton key={key} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
