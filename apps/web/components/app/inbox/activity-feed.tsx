"use client"

import { DOCUMENT_PERIODS } from "@sahihi/core"
import Link from "next/link"
import { useRef, useState } from "react"
import { auditTimelineStyle } from "@/components/app/envelope/activity-list"
import { ActivityIcon } from "@/components/app/icons"
import { ListSearch, type SearchChip, uniqueLabels } from "@/components/app/list-search"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Timeline, type TimelineEvent } from "@/components/arc/timeline/timeline"
import { api } from "@/lib/api"
import { auditEventLabel } from "@/lib/audit-labels"
import { PERIOD_LABEL } from "@/lib/documents-list"
import { type ActivityFilters, activityQuery, hasInboxFilters } from "@/lib/inbox"

export interface ActivityItem {
  id: string
  type: string
  occurredAt: string
  envelopeId: string
  envelopeTitle: string
  recipientName: string | null
  actorName: string | null
  data: Record<string, unknown> | null
}

export interface ActivityPage {
  items: ActivityItem[]
  nextCursor: string | null
  /** The workspace's members, for the People chip (first page only) */
  people?: { id: string; name: string }[]
}

const GROUP_OPTIONS = [
  { value: "signing", label: "Signing" },
  { value: "sending", label: "Sending" },
  { value: "system", label: "System" },
]

function filterChips(
  f: ActivityFilters,
  people: NonNullable<ActivityPage["people"]>,
): SearchChip[] {
  return [
    { id: "group", label: "Type", any: "Any type", current: f.group, options: GROUP_OPTIONS },
    {
      id: "actor",
      label: "People",
      any: "Anyone",
      current: f.actor,
      options: uniqueLabels(people.map((p) => ({ value: p.id, label: p.name }))),
    },
    {
      id: "period",
      label: "Date",
      any: "Any time",
      current: f.period,
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
  ]
}

function toTimeline(items: readonly ActivityItem[]): TimelineEvent[] {
  return items.map((e) => ({
    id: e.id,
    at: e.occurredAt,
    title: auditEventLabel(e.type, e.recipientName, e.data),
    meta: [e.envelopeTitle, e.actorName && `by ${e.actorName}`].filter(Boolean).join(" · "),
    detail: (
      <Link href={`/envelopes/${e.envelopeId}`} className="text-sm underline underline-offset-4">
        Open {e.envelopeTitle}
      </Link>
    ),
    ...auditTimelineStyle(e.type),
  }))
}

/**
 * The Inbox's workspace activity (docs/notifications.md → Inbox, ADR 0041): what happened to every
 * envelope in the workspace, newest first, from `/api/activity`, as an Arc timeline. A search
 * (envelope, recipient or member) and Type / People / Date chips narrow it on the server. A row
 * expands to a link to its envelope. Only the newest request's answer is shown, so a slow page
 * can't land on top of a newer search. `now` comes from the server render so labels match on
 * hydration.
 */
export function ActivityFeed({ initial, now }: { initial: ActivityPage; now: number }) {
  const [filters, setFilters] = useState<ActivityFilters>({})
  const [items, setItems] = useState(initial.items)
  const [nextCursor, setNextCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState(false)
  /** The newest request; older answers are dropped */
  const latest = useRef(0)

  async function load(f: ActivityFilters, cursor?: string) {
    const id = ++latest.current
    setLoading(true)
    try {
      const page = await api<ActivityPage>(`/activity?${activityQuery(f, cursor)}`)
      if (id !== latest.current) return
      setItems((current) => (cursor ? [...current, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
    } catch {
      if (id === latest.current) {
        toastManager.add({ title: "Couldn't load the activity", type: "error" })
      }
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }

  function applyFilters(next: ActivityFilters) {
    setFilters(next)
    void load(next)
  }

  const filtered = hasInboxFilters(filters)

  return (
    <div className="flex flex-col gap-4">
      <ListSearch
        label="Search activity"
        placeholder="Search by envelope, recipient or member"
        query={filters.q ?? ""}
        onQueryChange={(q) => applyFilters({ ...filters, q })}
        chips={filterChips(filters, initial.people ?? [])}
        onChipChange={(id, value) => applyFilters({ ...filters, [id]: value })}
        onClearChips={() => applyFilters({ q: filters.q })}
        pending={loading}
      />
      <Panel className="gap-0 p-0">
        {items.length === 0 ? (
          <EmptyState
            className="md:py-10"
            icon={<ActivityIcon aria-hidden />}
            title={filtered ? "No matching activity" : "No activity yet"}
            description={
              filtered
                ? "Try another search or clear the filters."
                : "Envelopes created, sent and signed in this workspace show up here."
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={() => applyFilters({})}>
                  Clear search and filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="px-4 py-3" aria-busy={loading}>
            <Timeline
              events={toTimeline(items)}
              now={now}
              label="Workspace activity"
              timeZone="Africa/Nairobi"
              locale="en-GB"
              headingLevel={3}
            />
          </div>
        )}
        {nextCursor && (
          <div className="flex justify-center border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              loading={loading}
              onClick={() => void load(filters, nextCursor)}
            >
              Load more
            </Button>
          </div>
        )}
      </Panel>
    </div>
  )
}
