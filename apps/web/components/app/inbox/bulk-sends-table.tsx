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
            <Link
              href={`/bulk-sends/${b.id}`}
              className="block truncate font-medium underline-offset-4 hover:underline"
            >
              {b.template}
            </Link>
          ),
        },
        {
          // The per-row title pattern, e.g. "Lease: {{Tenant name}}".
          key: "title",
          label: "Title",
          render: (_, b) => (
            <span className="block truncate text-muted-foreground" title={b.title}>
              {b.title}
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
