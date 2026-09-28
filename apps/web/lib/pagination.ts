export type PageWindowItem = number | "ellipsis-start" | "ellipsis-end"

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1
  return Math.ceil(total / pageSize)
}

/**
 * Page numbers to show in a pagination bar: always the first and last page, `siblings` pages on
 * each side of the current one, and an ellipsis for each gap. Gaps of one page show the number.
 */
export function pageWindow(current: number, pageCount: number, siblings = 1): PageWindowItem[] {
  if (pageCount <= 1) return [1]
  const page = Math.min(Math.max(1, current), pageCount)
  const start = Math.max(2, page - siblings)
  const end = Math.min(pageCount - 1, page + siblings)

  const items: PageWindowItem[] = [1]
  if (start === 3) items.push(2)
  else if (start > 3) items.push("ellipsis-start")
  for (let p = start; p <= end; p++) items.push(p)
  if (end === pageCount - 2) items.push(pageCount - 1)
  else if (end < pageCount - 2) items.push("ellipsis-end")
  items.push(pageCount)
  return items
}
