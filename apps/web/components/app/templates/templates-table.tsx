"use client"

import Link from "next/link"
import { ButtonLink } from "@/components/app/button-link"
import { LayoutTemplateIcon } from "@/components/app/icons"
import { Badge } from "@/components/arc/badge/badge"
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table"
import { TemplateRowActions } from "./template-row-actions"

/** One template, flattened for the table. Dates arrive pre-formatted from the server (en-GB, Nairobi). */
// A type alias (not an interface) so it satisfies the table's `Record<string, unknown>` bound.
export type TemplateTableRow = {
  id: string
  name: string
  description: string | null
  roles: string[]
  fields: number
  document: string
  savedBy: string
  /** ISO timestamp: sorts correctly as a string. */
  savedAt: string
  savedLabel: string
  canManage: boolean
}

/**
 * The workspace's templates in Arc's sortable table: sort by any column (newest first by default);
 * below 620px each row folds into two lines. Opening a template means using it. The table draws
 * its own frame, so the page doesn't wrap it in a Panel.
 */
export function TemplatesTable({ rows }: { rows: TemplateTableRow[] }) {
  return (
    <SortableDataTable
      rows={rows}
      rowKey="id"
      caption="Templates"
      itemName={{ one: "template", other: "templates" }}
      defaultSort={{ key: "savedAt", direction: "desc" }}
      columns={[
        {
          key: "name",
          label: "Template",
          render: (_, t) => (
            <span className="flex min-w-0 items-center gap-3">
              <LayoutTemplateIcon aria-hidden className="shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/templates/${t.id}/use`}
                  title={t.name}
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {t.name}
                </Link>
                {/* The document rides along under the name, so the table keeps to six columns. */}
                <span className="truncate text-muted-foreground text-xs" title={t.document}>
                  {t.description ? `${t.description} · ${t.document}` : t.document}
                </span>
              </span>
            </span>
          ),
        },
        {
          key: "roles",
          label: "Roles",
          sortable: false,
          render: (_, t) => (
            <span className="flex flex-wrap gap-1">
              {t.roles.map((r) => (
                <Badge key={r} size="sm">
                  {r}
                </Badge>
              ))}
            </span>
          ),
        },
        {
          key: "fields",
          label: "Fields",
          numeric: true,
          // Spelled out: on phones the row folds and a bare number would lose its column.
          render: (_, t) => (
            <span className="whitespace-nowrap text-muted-foreground tabular-nums">
              {t.fields} {t.fields === 1 ? "field" : "fields"}
            </span>
          ),
        },
        {
          key: "savedBy",
          label: "Saved by",
          render: (_, t) => (
            <span className="whitespace-nowrap text-muted-foreground">{t.savedBy}</span>
          ),
        },
        {
          key: "savedAt",
          label: "Saved",
          render: (_, t) => (
            <time
              dateTime={t.savedAt}
              className="whitespace-nowrap text-muted-foreground tabular-nums"
            >
              {t.savedLabel}
            </time>
          ),
        },
        {
          key: "actions",
          label: "Actions",
          sortable: false,
          render: (_, t) => (
            <span className="flex items-center justify-end gap-2">
              {/* Phones keep the row for the name; "Use template" is in the menu there. */}
              <span className="max-sm:hidden">
                <ButtonLink size="sm" href={`/templates/${t.id}/use`}>
                  Use template
                </ButtonLink>
              </span>
              <TemplateRowActions
                template={{ id: t.id, name: t.name, description: t.description }}
                canManage={t.canManage}
              />
            </span>
          ),
        },
      ]}
    />
  )
}

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

/** Recent bulk sends in the same Arc table as the templates above. */
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
