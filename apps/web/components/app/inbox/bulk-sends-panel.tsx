"use client"

import { useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { FileSearchIcon, LayoutTemplateIcon } from "@/components/app/icons"
import { ListSearch } from "@/components/app/list-search"
import { Panel } from "@/components/app/panel"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import {
  BULK_SEND_STATE_LABEL,
  BULK_SEND_STATES,
  type BulkSendFilters,
  filterBulkSends,
  hasInboxFilters,
} from "@/lib/inbox"
import { BulkSendsTable, type BulkSendTableRow } from "./bulk-sends-table"

/**
 * The Inbox's recent bulk sends (ADR 0041) with a search over title and template and a Status
 * chip. The list is short (the newest 25), so it's filtered here rather than by the API.
 */
export function BulkSendsPanel({ rows }: { rows: BulkSendTableRow[] }) {
  const [filters, setFilters] = useState<BulkSendFilters>({})

  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState
          className="md:py-10"
          icon={<LayoutTemplateIcon aria-hidden />}
          title="No bulk sends yet"
          description="Send one template to many people at once from a template's “Bulk send”."
          action={<ButtonLink href="/files?type=template">Go to templates</ButtonLink>}
        />
      </Panel>
    )
  }

  const shown = filterBulkSends(rows, filters)
  return (
    <div className="flex flex-col gap-4">
      <ListSearch
        label="Search bulk sends"
        placeholder="Search by title or template"
        query={filters.q ?? ""}
        onQueryChange={(q) => setFilters((f) => ({ ...f, q }))}
        chips={[
          {
            id: "state",
            label: "Status",
            any: "Any status",
            current: filters.state,
            options: BULK_SEND_STATES.map((s) => ({ value: s, label: BULK_SEND_STATE_LABEL[s] })),
          },
        ]}
        onChipChange={(_id, value) =>
          setFilters((f) => ({ ...f, state: value as BulkSendFilters["state"] }))
        }
        onClearChips={() => setFilters((f) => ({ q: f.q }))}
      />
      {shown.length > 0 ? (
        <BulkSendsTable rows={shown} />
      ) : (
        <Panel>
          <EmptyState
            className="md:py-10"
            icon={<FileSearchIcon aria-hidden />}
            title="No matching bulk sends"
            description="Try another search or clear the filters."
            action={
              hasInboxFilters(filters) ? (
                <Button variant="secondary" onClick={() => setFilters({})}>
                  Clear search and filters
                </Button>
              ) : undefined
            }
          />
        </Panel>
      )}
    </div>
  )
}
