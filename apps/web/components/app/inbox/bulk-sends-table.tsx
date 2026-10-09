"use client"

import Link from "next/link"
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table"

/** One bulk send, flattened for the table; the date arrives pre-formatted from the server. */
export type BulkSendTableRow = {
  id: string
  template: string
  title: string
  sent: number
  total: number
  failed: number
  done: boolean
  startedAt: string
  startedLabel: string
}

/** Recent bulk sends, in the Inbox (ADR 0041). */
export function BulkSendsTable({ rows }: { rows: BulkSendTableRow[] }) {
  return (
    <SortableDataTable
      rows={rows}
      rowKey="id"
      caption="Recent bulk sends"
      itemName={{ one: "bulk send", other: "bulk sends" }}
      defaultSort={{ key: "startedAt", direction: "desc" }}
      columns={[
        {
          key: "template",
          label: "Batch",
          render: (_, b) => (
            <span className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={`/bulk-sends/${b.id}`}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {b.template}
              </Link>
              {/* The batch title is the per-row pattern, e.g. "Lease: {{Tenant name}}". */}
              <span className="truncate text-muted-foreground text-xs" title={b.title}>
                Titled “{b.title}”
              </span>
            </span>
          ),
        },
        {
          key: "sent",
          label: "Progress",
          numeric: true,
          render: (_, b) => (
            <span className="whitespace-nowrap text-muted-foreground tabular-nums">
              {b.sent} of {b.total} sent
              {b.failed > 0 ? `, ${b.failed} failed` : ""}
              {b.done ? "" : " · in progress"}
            </span>
          ),
        },
        {
          key: "startedAt",
          label: "Started",
          render: (_, b) => (
            <time
              dateTime={b.startedAt}
              className="whitespace-nowrap text-muted-foreground tabular-nums"
            >
              {b.startedLabel}
            </time>
          ),
        },
      ]}
    />
  )
}
