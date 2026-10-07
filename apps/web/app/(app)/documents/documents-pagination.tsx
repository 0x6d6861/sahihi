"use client"

import { useRouter } from "next/navigation"
import { Pagination } from "@/components/arc/pagination/pagination"
import { type DocumentsView, documentsHref } from "@/lib/documents-list"

/** Arc Pagination for the documents list; the page lives in the URL, so moving is a navigation. */
export function DocumentsPagination({
  view,
  page,
  pageCount,
  total,
  pageSize,
}: {
  /** Folder and filters the links keep. */
  view: DocumentsView
  page: number
  pageCount: number
  total: number
  pageSize: number
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
        label="Documents pages"
        onPageChange={(p) => router.push(documentsHref(view, { page: p }))}
      />
    </div>
  )
}
