"use client"

import { DOCUMENT_PERIODS } from "@sahihi/core"
import {
  ListSearch,
  labelChips,
  type SearchChip,
  uniqueLabels,
  useListNavigation,
} from "@/components/app/list-search"
import { PERIOD_LABEL } from "@/lib/documents-list"
import type { TagRef } from "@/lib/labels"
import type { ListLayout } from "@/lib/list-layout"
import { type TemplatesView, templatesHref } from "@/lib/template-list"

/**
 * The Templates page's search section (ADR 0036): search (name, description, document), then
 * Saved by / Created chips and the List / Grid switch.
 */
export function TemplatesToolbar({
  view,
  layout,
  savers,
  tags,
  colors,
}: {
  view: TemplatesView
  layout: ListLayout
  /** Tags and label colours in use in the workspace (ADR 0038). */
  tags: TagRef[]
  colors: string[]
  savers: { id: string; name: string }[]
}) {
  const nav = useListNavigation("templates", view.layout)
  const go = (patch: Partial<TemplatesView>) => nav.go(templatesHref(view, patch))

  const chips: SearchChip[] = [
    {
      id: "by",
      label: "Saved by",
      any: "Anyone",
      current: view.by,
      options: uniqueLabels(savers.map((s) => ({ value: s.id, label: s.name }))),
    },
    {
      id: "period",
      label: "Created",
      any: "Any time",
      current: view.period,
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
    ...labelChips({ tags, colors, tag: view.tag, color: view.color }),
  ]

  return (
    <ListSearch
      label="Search templates"
      placeholder="Search by name, tag, description or document"
      query={view.q ?? ""}
      onQueryChange={(q) => go({ q })}
      chips={chips}
      onChipChange={(id, value) => go({ [id]: value } as Partial<TemplatesView>)}
      onClearChips={() =>
        go({ tag: undefined, color: undefined, by: undefined, period: undefined })
      }
      layout={layout}
      onLayoutChange={(l) =>
        nav.setLayout(l, templatesHref(view, { layout: undefined, page: view.page }))
      }
      pending={nav.pending}
    />
  )
}
