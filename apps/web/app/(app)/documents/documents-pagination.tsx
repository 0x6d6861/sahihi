import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { pageWindow } from "@/lib/pagination"

const href = (page: number) => (page <= 1 ? "/documents" : `/documents?page=${page}`)
const disabledLink = { "aria-disabled": true, className: "pointer-events-none opacity-50" }

/** coss Pagination for the documents list. Plain links, so the page stays a Server Component. */
export function DocumentsPagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
}) {
  const first = (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 pt-4 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        {first}–{last} of {total}
      </p>
      <Pagination className="sm:mx-0 sm:w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious {...(page > 1 ? { href: href(page - 1) } : disabledLink)} />
          </PaginationItem>
          {pageWindow(page, pageCount).map((item) =>
            typeof item === "number" ? (
              <PaginationItem key={item}>
                <PaginationLink
                  href={href(item)}
                  isActive={item === page}
                  aria-current={item === page ? "page" : undefined}
                >
                  {item}
                </PaginationLink>
              </PaginationItem>
            ) : (
              <PaginationItem key={item}>
                <PaginationEllipsis />
              </PaginationItem>
            ),
          )}
          <PaginationItem>
            <PaginationNext {...(page < pageCount ? { href: href(page + 1) } : disabledLink)} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
