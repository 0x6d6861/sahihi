"use client"

import { MAX_ENVELOPE_DOCUMENTS } from "@sahihi/core"
import { useState } from "react"
import { UploadDropzone } from "@/app/(app)/documents/upload-document"
import { Button } from "@/components/app/button"
import { LibraryDocumentPicker } from "@/components/app/documents/library-document-picker"
import { PlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { api } from "@/lib/api"
import { pluralize } from "@/lib/format"

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
  const [adding, setAdding] = useState<string | null>(null)
  const full = inEnvelope.length >= MAX_ENVELOPE_DOCUMENTS

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
          <LibraryDocumentPicker
            actionLabel="Add"
            doneLabel="Added"
            done={inEnvelope}
            busyId={adding}
            onPick={(d) => void add(d)}
          />
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
