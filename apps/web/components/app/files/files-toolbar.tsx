"use client"

import { DOCUMENT_PERIODS, type EnvelopeStage, FILE_KINDS, FILE_STATUSES } from "@sahihi/core"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import {
  ListSearch,
  labelChips,
  type SearchChip,
  uniqueLabels,
  useListNavigation,
} from "@/components/app/list-search"
import { ENVELOPE_STAGE_ICON } from "@/components/app/status-icon"
import { EnvelopeTypeIcon, TemplateTypeIcon } from "@/components/app/type-icons"
import { PERIOD_LABEL } from "@/lib/documents-list"
import { FILE_KIND_LABEL, type FilesView, fileStatusLabel, filesHref } from "@/lib/files-list"
import type { TagRef } from "@/lib/labels"
import type { ListLayout } from "@/lib/list-layout"

const FIRST_DOCUMENT_STATUS = FILE_STATUSES.find((s) => s.startsWith("document:"))

const TYPE_ICON = {
  document: <DocumentTypeIcon status="READY" className="size-4" />,
  envelope: <EnvelopeTypeIcon className="size-4" />,
  template: <TemplateTypeIcon className="size-4" />,
}

/**
 * The All files page's search section (ADR 0038): one search over documents, envelopes and
 * templates, then Type / Status / People / Added / Tags / Color chips and the List / Grid switch.
 * The Status chip lists envelope stages, then document states; picking one narrows to that type,
 * so the Type chip follows it.
 */
export function FilesToolbar({
  view,
  layout,
  people,
  tags,
  colors,
}: {
  view: FilesView
  layout: ListLayout
  people: { id: string; name: string }[]
  tags: TagRef[]
  colors: string[]
}) {
  const nav = useListNavigation("files", view.layout)
  const go = (patch: Partial<FilesView>) => nav.go(filesHref(view, patch))

  const chips: SearchChip[] = [
    {
      id: "type",
      label: "Type",
      any: "Any type",
      current: view.type,
      options: FILE_KINDS.map((k) => ({ value: k, label: FILE_KIND_LABEL[k], icon: TYPE_ICON[k] })),
    },
    {
      id: "status",
      label: "Status",
      any: "Any status",
      current: view.status,
      options: FILE_STATUSES.map((s) => {
        const [kind, value] = s.split(":")
        const Icon = kind === "envelope" ? ENVELOPE_STAGE_ICON[value as EnvelopeStage] : null
        return {
          value: s,
          label: fileStatusLabel(s),
          icon: Icon ? <Icon aria-hidden /> : TYPE_ICON.document,
          // Envelope stages, then document states.
          separatorBefore: s === FIRST_DOCUMENT_STATUS,
        }
      }),
    },
    {
      id: "owner",
      label: "People",
      any: "Anyone",
      current: view.owner,
      options: uniqueLabels(people.map((p) => ({ value: p.id, label: p.name }))),
    },
    {
      id: "period",
      label: "Added",
      any: "Any time",
      current: view.period,
      options: DOCUMENT_PERIODS.map((p) => ({ value: p, label: PERIOD_LABEL[p] })),
    },
    ...labelChips({ tags, colors, tag: view.tag, color: view.color }),
  ]

  function onChipChange(id: string, value: string | undefined) {
    if (id === "status" && value) {
      // A status belongs to one type: set the Type chip to match.
      const kind = value.split(":")[0] as FilesView["type"]
      return go({ status: value as FilesView["status"], type: kind })
    }
    if (id === "type" && view.status && value && !view.status.startsWith(`${value}:`)) {
      // A type the chosen status can't have: drop the status rather than show nothing.
      return go({ type: value as FilesView["type"], status: undefined })
    }
    go({ [id]: value } as Partial<FilesView>)
  }

  return (
    <ListSearch
      label="Search all files"
      placeholder="Search documents, envelopes, templates and folders"
      query={view.q ?? ""}
      onQueryChange={(q) => go({ q })}
      chips={chips}
      onChipChange={onChipChange}
      onClearChips={() =>
        go({
          type: undefined,
          status: undefined,
          owner: undefined,
          period: undefined,
          tag: undefined,
          color: undefined,
        })
      }
      layout={layout}
      onLayoutChange={(l) =>
        nav.setLayout(l, filesHref(view, { layout: undefined, page: view.page }))
      }
      pending={nav.pending}
    />
  )
}
