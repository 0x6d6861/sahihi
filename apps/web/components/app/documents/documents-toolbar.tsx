"use client"

import { DOCUMENT_LIST_STATUSES, DOCUMENT_PERIODS, labelColorName } from "@sahihi/core"
import { ColorDot } from "@/components/app/labels/labels"
import {
  ListSearch,
  type SearchChip,
  uniqueLabels,
  useListNavigation,
} from "@/components/app/list-search"
import {
  type DocumentsView,
  documentsHref,
  LIST_STATUS_LABEL,
  PERIOD_LABEL,
} from "@/lib/documents-list"
import type { TagRef } from "@/lib/labels"
import type { ListLayout } from "@/lib/list-layout"

/**
 * The Documents page's search section (ADR 0035): search, then Status / People / Added / Tags /
 * Color chips and the List / Grid switch. State lives in the URL; search (names and tags), tag and
 * color span every folder (ADR 0022, 0025).
 */
export function DocumentsToolbar({
  view,
  layout,
  senders,
  tags,
  colors,
}: {
  view: DocumentsView
  /** The layout on screen: the URL's, else the saved one. */
  layout: ListLayout
  senders: { id: string; name: string }[]
  /** Tags in use in the workspace. */
  tags: TagRef[]
  /** Label colours in use in the workspace (`#RRGGBB`). */
  colors: string[]
}) {
  const nav = useListNavigation("documents", view.layout)
  const go = (patch: Partial<DocumentsView>) => nav.go(documentsHref(view, patch))

  const chips: SearchChip[] = [
    {
      id: "status",
      label: "Status",
      any: "Any status",
      current: view.status,
      options: DOCUMENT_LIST_STATUSES.map((s) => ({ value: s, label: LIST_STATUS_LABEL[s] })),
    },
    {
      id: "sender",
      label: "People",
      any: "Anyone",
      current: view.sender,
      options: uniqueLabels(senders.map((s) => ({ value: s.id, label: s.name }))),
    },
    {
      id: "period",
      label: "Added",
      any: "Any time",
      current: view.period,
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
    // A tag or colour from a link that's no longer on anything still shows, so it can be cleared.
    ...(tags.length > 0 || view.tag
      ? [
          {
            id: "tag",
            label: "Tags",
            any: "Any tag",
            current: view.tag,
            caseInsensitive: true,
            options: uniqueLabels([
              ...tags.map((t) => ({ value: t.name, label: t.name })),
              ...(view.tag && !tags.some((t) => t.name.toLowerCase() === view.tag?.toLowerCase())
                ? [{ value: view.tag, label: view.tag }]
                : []),
            ]),
          } satisfies SearchChip,
        ]
      : []),
    ...(colors.length > 0 || view.color
      ? [
          {
            id: "color",
            label: "Color",
            any: "Any color",
            current: view.color,
            options: [...new Set([...colors, ...(view.color ? [view.color] : [])])].map((c) => ({
              value: c,
              label: labelColorName(c),
              icon: <ColorDot color={c} />,
            })),
          } satisfies SearchChip,
        ]
      : []),
  ]

  return (
    <ListSearch
      label="Search documents"
      placeholder="Search documents and folders"
      query={view.q ?? ""}
      onQueryChange={(q) => go({ q })}
      chips={chips}
      onChipChange={(id, value) => go({ [id]: value } as Partial<DocumentsView>)}
      onClearChips={() =>
        go({
          tag: undefined,
          color: undefined,
          status: undefined,
          sender: undefined,
          period: undefined,
        })
      }
      layout={layout}
      // Same page either way: both layouts show the same documents.
      onLayoutChange={(l) =>
        nav.setLayout(l, documentsHref(view, { layout: undefined, page: view.page }))
      }
      pending={nav.pending}
    />
  )
}
