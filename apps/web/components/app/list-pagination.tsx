"use client"

import { useRouter } from "next/navigation"
import { Pagination } from "@/components/arc/pagination/pagination"

/**
 * Arc Pagination for the Envelopes and Templates lists: the page lives in the URL, so moving is a
 * navigation. `hrefs[n - 1]` is the link to page n, built on the server with the page's filters.
 */
export function ListPagination({
  page,
  pageCount,
  total,
  pageSize,
  label,
  hrefs,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  /** Names the navigation ("Envelopes pages"). */
  label: string
  hrefs: string[]
}) {
  const router = useRouter()
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <p className="text-muted-foreground text-sm tabular-nums">
        {first} to {last} of {total}
      </p>
      <Pagination
        page={page}
        pageCount={pageCount}
        label={label}
        onPageChange={(p) => {
          const href = hrefs[p - 1]
          if (href) router.push(href)
        }}
      />
    </div>
  )
}
