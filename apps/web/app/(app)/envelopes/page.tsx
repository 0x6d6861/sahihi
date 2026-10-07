import type { EnvelopeStatus, UsageLevel } from "@sahihi/core"
import Link from "next/link"
import { ButtonLink } from "@/components/app/button-link"
import { EnvelopeViews } from "@/components/app/envelope/envelope-views"
import { PlusIcon, SendIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
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
import { ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import {
  ENVELOPE_VIEW_LABEL,
  inView,
  parseEnvelopeView,
  recipientSummary,
  signingProgress,
  viewCounts,
} from "@/lib/envelope-list"
import { formatDate, formatDateTime, formatDayMonth, pluralize } from "@/lib/format"

interface EnvelopeRow {
  id: string
  title: string
  status: EnvelopeStatus
  createdAt: string
  document: { name: string }
  recipients: { id: string; name: string; status: string; role: string }[]
}

export const metadata = { title: "Envelopes" }

/** Every envelope of the workspace, newest first, in views by stage (`?view=`). */
export default async function EnvelopesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const view = parseEnvelopeView((await searchParams).view)
  const [{ data }, { data: billing }] = await Promise.all([
    apiServer<{ items: EnvelopeRow[] }>("/envelopes"),
    apiServer<{
      period: { end: string }
      envelopes: { used: number; limit: number | null; level: UsageLevel }
    }>("/billing"),
  ])
  const all = data?.items ?? []
  const counts = viewCounts(all.map((e) => e.status))
  const items = all.filter((e) => inView(e.status, view))
  const banner = billing
    ? quotaBanner(
        billing.envelopes.level,
        billing.envelopes.used,
        billing.envelopes.limit,
        formatDayMonth(new Date(billing.period.end)),
      )
    : null

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-medium text-2xl tracking-tight">Envelopes</h1>
          {all.length > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {pluralize(all.length, "envelope")}
              {counts.active > 0 ? `, ${counts.active} waiting for signatures` : ""}
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

      {all.length === 0 ? (
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
        <section aria-label="Envelopes" className="flex flex-col gap-3">
          <EnvelopeViews value={view} counts={counts} />
          <Panel className="gap-0 p-2 sm:p-3">
            {items.length === 0 ? (
              <p className="px-3 py-10 text-center text-muted-foreground text-sm">
                No envelopes in {ENVELOPE_VIEW_LABEL[view].toLowerCase()}.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-3">Envelope</TableHead>
                    <TableHead className="max-md:hidden">Recipients</TableHead>
                    <TableHead className="max-md:hidden">Signed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="max-lg:hidden">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((e) => {
                    const badge = ENVELOPE_STATUS_BADGE[e.status]
                    const progress = signingProgress(e.recipients)
                    const names = recipientSummary(e.recipients.map((r) => r.name))
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="w-full max-w-0 ps-3">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <Link
                              href={`/envelopes/${e.id}`}
                              title={e.title}
                              className="truncate font-medium underline-offset-4 hover:underline"
                            >
                              {e.title}
                            </Link>
                            <span className="truncate text-muted-foreground text-xs">
                              {e.document.name}
                            </span>
                            {/* Phones: recipients and progress move under the title. */}
                            <span className="truncate text-muted-foreground text-xs md:hidden">
                              {names}
                              {progress.total > 0 &&
                                ` · ${progress.signed} of ${progress.total} signed`}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-muted-foreground max-md:hidden">
                          {names}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums max-md:hidden">
                          {progress.total > 0
                            ? `${progress.signed} of ${progress.total}`
                            : "None yet"}
                        </TableCell>
                        <TableCell>
                          <Badge tone={badge.tone} size="sm">
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap pe-3 text-muted-foreground tabular-nums max-lg:hidden">
                          <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)}>
                            {formatDate(e.createdAt)}
                          </time>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </Panel>
        </section>
      )}
    </div>
  )
}
