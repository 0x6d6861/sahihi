"use client"

import { MAX_UPLOAD_BYTES } from "@sahihi/core"
import { FileTextIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { FileUpload } from "@/components/extend/file-upload"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { UPLOAD_STAGE_LABEL } from "@/lib/upload"
import { useDocumentUpload } from "./use-document-upload"

const PDF_ONLY = [{ label: "PDF", icon: FileTextIcon }]

/** Extend FileUpload drop zone, replaced by a coss Progress while an upload runs. */
export function UploadDropzone({ onDone }: { onDone?: () => void }) {
  const { upload, state } = useDocumentUpload({ onDone })

  if (state) {
    return (
      <div className="flex min-h-64 w-full flex-col justify-center gap-2 rounded-xl border border-dashed px-6 text-left">
        <p className="truncate font-medium text-sm">{state.fileName}</p>
        <Progress value={state.percent}>
          <div className="flex items-center justify-between gap-2">
            <ProgressLabel className="font-normal text-muted-foreground">
              {UPLOAD_STAGE_LABEL[state.stage]}
            </ProgressLabel>
            <ProgressValue />
          </div>
        </Progress>
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
export function UploadDocument() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UploadIcon aria-hidden />
        Upload PDF
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            The original PDF is stored unchanged and fingerprinted (SHA-256).
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <UploadDropzone onDone={() => setOpen(false)} />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
