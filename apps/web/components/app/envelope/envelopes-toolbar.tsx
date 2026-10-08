"use client"

import { DOCUMENT_PERIODS, ENVELOPE_STAGES } from "@sahihi/core"
import {
  ListSearch,
  labelChips,
  type SearchChip,
  uniqueLabels,
  useListNavigation,
} from "@/components/app/list-search"
import { ENVELOPE_STAGE_ICON } from "@/components/app/status-icon"
import { PERIOD_LABEL } from "@/lib/documents-list"
import { ENVELOPE_STAGE_LABEL, type EnvelopesView, envelopesHref } from "@/lib/envelope-list"
import type { TagRef } from "@/lib/labels"
import type { ListLayout } from "@/lib/list-layout"

/**
 * The Envelopes page's search section (ADR 0036): search (title, document, recipient name or
 * email), then Status / Sent by / Created chips and the List / Grid switch. The Status chip
 * replaces the old stage tabs.
 */
export function EnvelopesToolbar({
  view,
  layout,
  senders,
  tags,
  colors,
}: {
  view: EnvelopesView
  layout: ListLayout
  /** Tags and label colours in use in the workspace (ADR 0038). */
  tags: TagRef[]
  colors: string[]
  senders: { id: string; name: string }[]
}) {
  const nav = useListNavigation("envelopes", view.layout)
  const go = (patch: Partial<EnvelopesView>) => nav.go(envelopesHref(view, patch))

  const chips: SearchChip[] = [
    {
      id: "stage",
      label: "Status",
      any: "Any status",
      current: view.stage,
      options: ENVELOPE_STAGES.map((s) => {
        const Icon = ENVELOPE_STAGE_ICON[s]
        return { value: s, label: ENVELOPE_STAGE_LABEL[s], icon: <Icon aria-hidden /> }
      }),
    },
    {
      id: "sender",
      label: "Sent by",
      any: "Anyone",
      current: view.sender,
      options: uniqueLabels(senders.map((s) => ({ value: s.id, label: s.name }))),
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
      label="Search envelopes"
      placeholder="Search by title, tag, document or recipient"
      query={view.q ?? ""}
      onQueryChange={(q) => go({ q })}
      chips={chips}
      onChipChange={(id, value) => go({ [id]: value } as Partial<EnvelopesView>)}
      onClearChips={() =>
        go({
          tag: undefined,
          color: undefined,
          stage: undefined,
          sender: undefined,
          period: undefined,
        })
      }
      layout={layout}
      onLayoutChange={(l) =>
        nav.setLayout(l, envelopesHref(view, { layout: undefined, page: view.page }))
      }
      pending={nav.pending}
    />
  )
}
