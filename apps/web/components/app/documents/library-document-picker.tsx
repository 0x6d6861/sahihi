"use client"

import { useEffect, useState } from "react"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { Button } from "@/components/arc/button/button"
import { SearchField } from "@/components/arc/search-field/search-field"
import { api } from "@/lib/api"
import { formatDate, pluralize } from "@/lib/format"

export type LibraryDocument = {
  id: string
  name: string
  pageCount: number | null
  createdAt: string
}

const SEARCH_DELAY_MS = 250

/**
 * READY documents from the workspace library, searchable across every folder, each with one
 * action. Used to add a document to an envelope (ADR 0037) and to draft from one (ADR 0049).
 */
export function LibraryDocumentPicker({
  actionLabel,
  doneLabel,
  done = [],
  busyId,
  disabled,
  onPick,
}: {
  actionLabel: string
  /** Shown instead of the action for documents already picked. */
  doneLabel?: string
  done?: string[]
  /** The document whose action is running. */
  busyId?: string | null
  disabled?: boolean
  onPick: (doc: LibraryDocument) => void
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<LibraryDocument[] | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      const qs = new URLSearchParams({ page: "1", status: "READY" })
      if (q.trim()) qs.set("q", q.trim())
      try {
        const data = await api<{ items: LibraryDocument[] }>(`/documents?${qs}`)
        setResults(data.items)
      } catch {
        setResults([])
      }
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="flex flex-col gap-4">
      <SearchField
        label="Search your documents"
        value={q}
        placeholder="Name or tag"
        onValueChange={setQ}
      />
      <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-xl border">
        {results === null ? (
          <li className="px-3 py-6 text-center text-muted-foreground text-sm">Loading…</li>
        ) : results.length === 0 ? (
          <li className="px-3 py-6 text-center text-muted-foreground text-sm">
            No ready documents{q.trim() ? " match" : " yet"}.
          </li>
        ) : (
          results.map((d) => {
            const picked = done.includes(d.id)
            return (
              <li key={d.id} className="flex min-w-0 items-center gap-3 py-2 ps-3 pe-2">
                <DocumentTypeIcon status="READY" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-sm" title={d.name}>
                    {d.name}
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {pluralize(d.pageCount ?? 0, "page")} · {formatDate(d.createdAt)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant={picked ? "ghost" : "secondary"}
                  disabled={picked || disabled || (busyId != null && busyId !== d.id)}
                  loading={busyId === d.id}
                  onClick={() => onPick(d)}
                >
                  {picked ? (doneLabel ?? actionLabel) : actionLabel}
                </Button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
