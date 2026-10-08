import { documentsSummary, type UsageLevel } from "@sahihi/core"
import { cookies } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ButtonLink } from "@/components/app/button-link"
import { EnvelopeCard, type EnvelopeItem } from "@/components/app/envelope/envelope-card"
import { EnvelopeRowActions } from "@/components/app/envelope/envelope-row-actions"
import { EnvelopesToolbar } from "@/components/app/envelope/envelopes-toolbar"
import { FileSearchIcon, PlusIcon, SendIcon } from "@/components/app/icons"
import { ListGrid } from "@/components/app/list-card"
import { ListPagination } from "@/components/app/list-pagination"
import { Panel } from "@/components/app/panel"
import { People, Person } from "@/components/app/people"
import { ProgressRing } from "@/components/app/progress-ring"
import { EnvelopeStatusIcon } from "@/components/app/status-icon"
import { EnvelopeTypeIcon } from "@/components/app/type-icons"
import { Alert } from "@/components/arc/alert/alert"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiServer } from "@/lib/api-server"
import { quotaBanner } from "@/lib/billing"
import {
  envelopesApiQuery,
  envelopesHref,
  hasEnvelopeFilters,
  parseEnvelopesView,
  recipientSummary,
  signingProgress,
} from "@/lib/envelope-list"
import { formatDate, formatDateTime, formatDayMonth, pluralize } from "@/lib/format"
import { LIST_LAYOUT_COOKIE, resolveListLayout } from "@/lib/list-layout"
import { totalPages } from "@/lib/pagination"

export const metadata = { title: "Envelopes" }

/**
 * Every envelope of the workspace, newest first (ADR 0036): Drive-style search and chips
 * (Status, Sent by, Created), then a list or a grid of document thumbnails, 25 a page.
 */
export default async function EnvelopesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseEnvelopesView(await searchParams)
  const layout = resolveListLayout(
    view.layout,
    (await cookies()).get(LIST_LAYOUT_COOKIE.envelopes)?.value,
  )
  const [envelopes, { data: billing }] = await Promise.all([
    apiServer<{
      items: EnvelopeItem[]
      page: number
      pageSize: number
      total: number
      senders: { id: string; name: string }[]
    }>(`/envelopes?${envelopesApiQuery(view)}`),
    apiServer<{
      period: { end: string }
      envelopes: { used: number; limit: number | null; level: UsageLevel }
    }>("/billing"),
  ])
  if (envelopes.status === 400) redirect("/envelopes")
  const data = envelopes.data
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const page = data?.page ?? 1
  const pageSize = data?.pageSize ?? 1
  const pageCount = totalPages(total, pageSize)
  // Past the last page (e.g. after a filter change elsewhere): go to the last page that has rows.
  if (items.length === 0 && total > 0) redirect(envelopesHref(view, { page: pageCount }))
  const filtered = hasEnvelopeFilters(view)
  const blank = total === 0 && !filtered
  const banner = billing
    ? quotaBanner(
        billing.envelopes.level,
        billing.envelopes.used,
        billing.envelopes.limit,
        formatDayMonth(new Date(billing.period.end)),
      )
    : null
  const pagination =
    pageCount > 1 ? (
      <ListPagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        label="Envelopes pages"
        hrefs={Array.from({ length: pageCount }, (_, i) => envelopesHref(view, { page: i + 1 }))}
      />
    ) : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-medium text-2xl tracking-tight">Envelopes</h1>
          {!blank && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {pluralize(total, filtered ? "matching envelope" : "envelope")}
            </p>
          )}
        </div>
        <ButtonLink variant="primary" href="/envelopes/new">
          <PlusIcon aria-hidden />
          New envelope
        </ButtonLink>
      </header>

      {banner && (
        <Alert tone={banner.tone} title={banner.title}>
          {banner.description}{" "}
          <Link href="/settings/billing" className="underline underline-offset-4">
            Plan and usage
          </Link>
        </Alert>
      )}

      {blank ? (
        <Panel>
          <EmptyState
            className="md:py-10"
            icon={<SendIcon aria-hidden />}
            title="No envelopes yet"
            description="Pick a document, add recipients and send it for signature."
            action={
              <ButtonLink variant="primary" href="/envelopes/new">
                New envelope
              </ButtonLink>
            }
          />
        </Panel>
      ) : (
        <section aria-label="Envelopes" className="flex flex-col gap-6">
          <EnvelopesToolbar view={view} layout={layout} senders={data?.senders ?? []} />
          {total === 0 ? (
            <Panel>
              <EmptyState
                className="md:py-10"
                icon={<FileSearchIcon aria-hidden />}
                title="No matching envelopes"
                description="Try another search or clear the filters."
                action={<ButtonLink href="/envelopes">Clear filters</ButtonLink>}
              />
            </Panel>
          ) : layout === "grid" ? (
            <div className="flex flex-col gap-4">
              <ListGrid>
                {items.map((e) => (
                  <li key={e.id} className="grid">
                    <EnvelopeCard envelope={e} />
                  </li>
                ))}
              </ListGrid>
              {pagination}
            </div>
          ) : (
            <Panel className="gap-0 p-2 sm:p-3">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-3">Envelope</TableHead>
                    <TableHead className="max-md:hidden">Recipients</TableHead>
                    <TableHead className="max-md:hidden">Signed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="max-lg:hidden">Sent by</TableHead>
                    <TableHead className="max-lg:hidden">Created</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => {
                    const progress = signingProgress(e.recipients)
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="w-full max-w-0 ps-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <EnvelopeTypeIcon />
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <Link
                                href={`/envelopes/${e.id}`}
                                title={e.title}
                                className="truncate font-medium underline-offset-4 hover:underline"
                              >
                                {e.title}
                              </Link>
                              <span className="truncate text-muted-foreground text-xs">
                                {documentsSummary(e.documents.map((d) => d.name))}
                              </span>
                              {/* Phones: recipients and progress move under the title. */}
                              <span className="truncate text-muted-foreground text-xs md:hidden">
                                {recipientSummary(e.recipients.map((r) => r.name))}
                                {progress.total > 0 && e.status !== "DRAFT"
                                  ? ` · ${progress.signed} of ${progress.total} signed`
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-md:hidden">
                          {e.recipients.length > 0 ? (
                            <People people={e.recipients} label="Recipients" max={3} />
                          ) : (
                            <span className="text-muted-foreground text-xs">None yet</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                          {progress.total > 0 && e.status !== "DRAFT" ? (
                            <span className="flex items-center gap-2">
                              <ProgressRing
                                value={progress.signed}
                                max={progress.total}
                                label={`${progress.signed} of ${progress.total} signed`}
                              />
                              <span aria-hidden>
                                {progress.signed} of {progress.total}
                              </span>
                            </span>
                          ) : (
                            <span className="text-xs">Not sent</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <EnvelopeStatusIcon status={e.status} />
                        </TableCell>
                        <TableCell className="max-w-44 text-muted-foreground max-lg:hidden">
                          <Person person={e.createdBy} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-lg:hidden">
                          <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                            {formatDate(e.createdAt)}
                          </time>
                        </TableCell>
                        <TableCell className="pe-1">
                          <EnvelopeRowActions envelope={e} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {pagination && <div className="border-t px-3 pt-3">{pagination}</div>}
            </Panel>
          )}
        </section>
      )}
    </div>
  )
}
