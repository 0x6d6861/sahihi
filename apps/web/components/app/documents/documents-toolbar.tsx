"use client"

import { DOCUMENT_LIST_STATUSES, DOCUMENT_PERIODS, labelColorName } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ColorDot } from "@/components/app/labels/labels"
import {
  type FilterChip,
  FilterMenu,
  FilterToolbar,
} from "@/components/arc/filter-toolbar/filter-toolbar"
import { SearchField } from "@/components/arc/search-field/search-field"
import {
  type DocumentsView,
  documentsHref,
  LIST_STATUS_LABEL,
  PERIOD_LABEL,
} from "@/lib/documents-list"
import type { TagRef } from "@/lib/labels"

const SEARCH_DELAY_MS = 300

type FilterKey = "tag" | "color" | "status" | "sender" | "period"
type Field = {
  id: FilterKey
  label: string
  options: { value: string; label: string; icon?: React.ReactNode }[]
}

/**
 * Search box and Tag / Color / Status / Sender / Period filters (Arc search field + filter
 * toolbar). State lives in the URL; the page (a Server Component) re-renders on navigation.
 * Search (names and tags), tag and color span every folder (ADR 0022, 0025).
 */
export function DocumentsToolbar({
  view,
  senders,
  tags,
  colors,
}: {
  view: DocumentsView
  senders: { id: string; name: string }[]
  /** Tags in use in the workspace. */
  tags: TagRef[]
  /** Label colours in use in the workspace (`#RRGGBB`). */
  colors: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(view.q ?? "")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Back/forward or a breadcrumb click changes the URL under us.
  useEffect(() => setQ(view.q ?? ""), [view.q])
  useEffect(() => () => clearTimeout(timer.current), [])

  const go = (patch: Partial<DocumentsView>) =>
    startTransition(() => router.replace(documentsHref(view, patch), { scroll: false }))

  function onSearch(value: string) {
    setQ(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => go({ q: value.trim() || undefined }), SEARCH_DELAY_MS)
  }

  const fields: Field[] = [
    ...(tags.length > 0
      ? [
          {
            id: "tag",
            label: "Tag",
            options: tags.map((t) => ({ value: t.name, label: t.name })),
          } satisfies Field,
        ]
      : []),
    ...(colors.length > 0 || view.color
      ? [
          {
            id: "color",
            label: "Color",
            options: [...new Set([...colors, ...(view.color ? [view.color] : [])])].map((c) => ({
              value: c,
              label: labelColorName(c),
              icon: <ColorDot color={c} />,
            })),
          } satisfies Field,
        ]
      : []),
    {
      id: "status",
      label: "Status",
      options: DOCUMENT_LIST_STATUSES.map((s) => ({ value: s, label: LIST_STATUS_LABEL[s] })),
    },
    {
      id: "sender",
      label: "Sender",
      options: senders.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      id: "period",
      label: "Period",
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
  ]

  const chips: FilterChip[] = fields.flatMap((field) => {
    const current = view[field.id]
    const option = field.options.find((o) =>
      field.id === "tag" ? o.value.toLowerCase() === current?.toLowerCase() : o.value === current,
    )
    return option ? [{ id: field.id, label: field.label, value: option.label }] : []
  })
  // A tag from a link that's no longer on anything still shows, so it can be removed.
  if (view.tag && !chips.some((c) => c.id === "tag")) {
    chips.unshift({ id: "tag", label: "Tag", value: view.tag })
  }

  function addFilter(chip: FilterChip) {
    const field = fields.find((f) => f.id === chip.id)
    const option = field?.options.find((o) => o.label === chip.value)
    if (field && option) go({ [field.id]: option.value } as Partial<DocumentsView>)
  }

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <SearchField
            label="Search documents"
            value={q}
            placeholder="Name or tag"
            onValueChange={onSearch}
          />
        </div>
        {/* Centred on the 44px search input (the trigger is 36px). */}
        <div className="flex h-11 items-center">
          <FilterMenu fields={fields} active={chips} onSelect={addFilter} align="end" />
        </div>
      </div>
      {/* The chip strip only appears once a filter is applied, so an idle toolbar stays one row. */}
      {chips.length > 0 && (
        <FilterToolbar
          label="Applied filters"
          filters={chips}
          onRemove={(id) => go({ [id as FilterKey]: undefined })}
          onClearAll={() => {
            setQ("")
            go({
              q: undefined,
              tag: undefined,
              color: undefined,
              status: undefined,
              sender: undefined,
              period: undefined,
            })
          }}
        />
      )}
    </div>
  )
}
