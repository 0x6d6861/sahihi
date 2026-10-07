"use client"

import { MAX_UPLOAD_BYTES } from "@sahihi/core"
import { useState } from "react"
import { FileTextIcon, UploadIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { Progress } from "@/components/arc/progress/progress"
import { FileUpload } from "@/components/extend/file-upload"
import { UPLOAD_STAGE_LABEL } from "@/lib/upload"
import { useDocumentUpload } from "./use-document-upload"

const PDF_ONLY = [{ label: "PDF", icon: FileTextIcon }]

/** Extend FileUpload drop zone, replaced by an Arc Progress while an upload runs. */
export function UploadDropzone({
  onDone,
  folderId,
}: {
  onDone?: (doc: { id: string; name: string }) => void
  folderId?: string
}) {
  const { upload, state } = useDocumentUpload({ onDone, folderId })

  if (state) {
    return (
      <div className="flex min-h-64 w-full flex-col justify-center gap-3 rounded-2xl border border-dashed px-6 text-left">
        <p className="truncate font-medium text-sm">{state.fileName}</p>
        <Progress value={state.percent} label={UPLOAD_STAGE_LABEL[state.stage]} showValue />
      </div>
    )
  }

  return (
    <FileUpload
      className="w-full"
      accept=".pdf,application/pdf"
      acceptedFileTypes={PDF_ONLY}
      multiple={false}
      showFileList={false}
      title="Click to upload or drop a PDF"
      description={`PDF up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`}
      onFilesAccepted={(files) => {
        const file = files[0]
        if (file) void upload(file)
      }}
    />
  )
}

/** Header action: opens the drop zone in a dialog, which closes when the upload succeeds. */
export function UploadDocument({ folderId }: { folderId?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UploadIcon aria-hidden />
          Upload document
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Upload a document"
        description="The original PDF is stored unchanged and fingerprinted (SHA-256)."
      >
        <UploadDropzone folderId={folderId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
