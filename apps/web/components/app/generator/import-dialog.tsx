"use client"

import { MAX_IMPORT_BYTES } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/app/button"
import { LibraryDocumentPicker } from "@/components/app/documents/library-document-picker"
import { FileTextIcon, LoaderIcon, UploadIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { FileUpload } from "@/components/extend/file-upload"
import { api } from "@/lib/api"
import { importErrorMessage } from "@/lib/generator"
import { startDocument, useStarting } from "./start-actions"

const IMPORTABLE = [
  { label: "PDF", icon: FileTextIcon },
  { label: "DOCX", icon: FileTextIcon },
]
const ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"

/**
 * "Import a document" on /generate (docs/ai-documents.md → Starting points, ADR 0049): a READY PDF
 * from the workspace's documents, or a PDF or Word file from the computer (sent to
 * `POST /generated-documents/import`, read and not stored). Either way the wording comes in as
 * written and the new draft opens.
 */
export function ImportButton() {
  const [open, setOpen] = useState(false)
  const starting = useStarting()
  return (
    <>
      <Button variant="secondary" disabled={starting} onClick={() => setOpen(true)}>
        <UploadIcon aria-hidden />
        Import a document
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [source, setSource] = useState<"library" | "upload">("library")
  // The library document or file being imported; the dialog stays put until the draft opens.
  const [busy, setBusy] = useState<{ id?: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (target: { id?: string; name: string }, request: () => Promise<void>) => {
    setBusy(target)
    setError(null)
    try {
      await request()
    } catch (err) {
      setError(importErrorMessage(err))
      setBusy(null)
    }
  }

  const fromFile = (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      setError(importErrorMessage({ status: 413 }))
      return
    }
    void run({ name: file.name }, async () => {
      const form = new FormData()
      form.set("file", file)
      const { id } = await api<{ id: string }>("/generated-documents/import", {
        method: "POST",
        body: form,
      })
      router.push(`/generate/${id}`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title="Import a document"
        description="The text comes in exactly as written: headings become sections. Then the assistant suggests which names, dates and amounts should be blanks."
      >
        <div className="flex flex-col gap-4">
          <SegmentedControl
            label="Import from"
            value={source}
            onValueChange={(v) => {
              setSource(v as "library" | "upload")
              setError(null)
            }}
            options={[
              { value: "library", label: "Your documents" },
              { value: "upload", label: "Upload a file" },
            ]}
          />
          {error && (
            <Alert tone="danger" title="Not imported">
              {error}
            </Alert>
          )}
          {source === "library" ? (
            <LibraryDocumentPicker
              actionLabel="Import"
              busyId={busy?.id ?? null}
              disabled={busy !== null}
              onPick={(d) =>
                void run({ id: d.id, name: d.name }, () =>
                  startDocument(router, { documentId: d.id }),
                )
              }
            />
          ) : busy ? (
            <div
              className="flex min-h-64 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 text-center"
              role="status"
            >
              <LoaderIcon aria-hidden className="size-5 animate-spin text-muted-foreground" />
              <p className="font-medium text-sm">Importing {busy.name}…</p>
              <p className="text-muted-foreground text-xs">Reading the text and its headings.</p>
            </div>
          ) : (
            <FileUpload
              className="w-full"
              accept={ACCEPT}
              acceptedFileTypes={IMPORTABLE}
              multiple={false}
              showFileList={false}
              title="Click to upload or drop a PDF or Word file"
              description={`PDF or DOCX up to ${MAX_IMPORT_BYTES / 1024 / 1024} MB. The file itself isn't kept.`}
              onFilesAccepted={(files) => {
                const file = files[0]
                if (file) fromFile(file)
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
