"use client"

import { MAX_ENVELOPE_DOCUMENTS } from "@sahihi/core"
import { useEffect, useState } from "react"
import { UploadDropzone } from "@/app/(app)/documents/upload-document"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { PlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { SearchField } from "@/components/arc/search-field/search-field"
import { api } from "@/lib/api"
import { formatDate, pluralize } from "@/lib/format"

type LibraryDocument = { id: string; name: string; pageCount: number | null; createdAt: string }

const SEARCH_DELAY_MS = 250

/**
 * "Add document" in the draft editor's Documents step (ADR 0037): pick READY documents from the
 * library (search spans every folder) or upload a new PDF. Each pick is added after the envelope's
 * current documents right away; documents already in it are marked.
 */
export function AddDocumentDialog({
  envelopeId,
  inEnvelope,
  onAdded,
}: {
  envelopeId: string
  /** Library ids already in the envelope. */
  inEnvelope: string[]
  onAdded: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<LibraryDocument[] | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const full = inEnvelope.length >= MAX_ENVELOPE_DOCUMENTS

  useEffect(() => {
    if (!open) return
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
  }, [open, q])

  async function add(doc: { id: string; name: string }) {
    setAdding(doc.id)
    try {
      await api(`/envelopes/${envelopeId}/documents`, {
        method: "POST",
        json: { documentIds: [doc.id] },
      })
      toastManager.add({ title: `Added “${doc.name}”`, type: "success" })
      onAdded()
      setOpen(false)
    } catch (err) {
      toastManager.add({
        title: "Not added",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    } finally {
      setAdding(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={full}>
          <PlusIcon aria-hidden />
          Add document
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a document"
        description="It's signed after the envelope's other documents. Pick one from your library or upload a PDF."
      >
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
                const added = inEnvelope.includes(d.id)
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
                      variant={added ? "ghost" : "secondary"}
                      disabled={added || adding !== null}
                      loading={adding === d.id}
                      onClick={() => void add(d)}
                    >
                      {added ? "Added" : "Add"}
                    </Button>
                  </li>
                )
              })
            )}
          </ul>
          <div className="flex flex-col gap-2">
            <p className="font-medium text-sm">Or upload a new PDF</p>
            <UploadDropzone onDone={(doc) => void add(doc)} />
          </div>
          <p className="text-muted-foreground text-xs">
            {pluralize(inEnvelope.length, "document")} of {MAX_ENVELOPE_DOCUMENTS} in this envelope.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
