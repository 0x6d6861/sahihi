"use client"

import { SaveIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import type { PDFEditorHandle } from "@/components/extend/pdf-editor"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { toastManager } from "@/components/ui/toast"
import { preparedFileName } from "@/lib/documents"
import { UPLOAD_STAGE_LABEL, type UploadStage, uploadPercent } from "@/lib/upload"
import { uploadPdf } from "@/lib/upload-client"

const PrepareEditor = dynamic(() => import("./prepare-editor"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

/**
 * Full PDFEditor over a READY original. "Save as new document" applies pending redactions, takes
 * the edited bytes and runs the normal upload flow with `sourceDocumentId`, so the server
 * re-inspects and re-hashes them. The original document is never modified.
 */
export function PrepareDocument({
  documentId,
  documentName,
  src,
}: {
  documentId: string
  documentName: string
  src: string
}) {
  const router = useRouter()
  const handleRef = useRef<PDFEditorHandle | null>(null)
  const [open, setOpen] = useState(false)
  const [progress, setProgress] = useState<{ stage: UploadStage; percent: number } | null>(null)
  const newName = preparedFileName(documentName)

  async function save() {
    const editor = handleRef.current
    if (!editor) return
    setProgress({ stage: "creating", percent: 0 })
    try {
      // Redaction marks are only marks until applied; getDocumentBuffer() would keep the text.
      await editor.applyRedactions()
      const buffer = await editor.getDocumentBuffer()
      const file = new File([buffer], newName, { type: "application/pdf" })
      const doc = await uploadPdf(file, {
        sourceDocumentId: documentId,
        onStage: (stage, fraction) =>
          setProgress({ stage, percent: uploadPercent(stage, fraction) }),
      })
      toastManager.add({ title: "Saved as a new document", description: doc.name, type: "success" })
      router.push(`/documents/${doc.id}`)
    } catch (err) {
      setProgress(null)
      toastManager.add({
        title: "Could not save the prepared document",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    }
  }

  const saving = progress !== null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Redact, rotate, reorder or delete pages, or fill existing form fields. Saving creates{" "}
          <span className="font-medium text-foreground">{newName}</span>; the original stays as it
          is.
        </p>
        <AlertDialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
          <AlertDialogTrigger render={<Button />}>
            <SaveIcon aria-hidden />
            Save as new document
          </AlertDialogTrigger>
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>Save as a new document?</AlertDialogTitle>
              <AlertDialogDescription>
                “{newName}” will be created from your edits and fingerprinted on its own. Any
                redaction marks are applied permanently: the covered content is removed from the new
                file. “{documentName}” is not changed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {progress && (
              <div className="flex flex-col gap-2 px-6">
                <Progress value={progress.percent} />
                <p className="text-muted-foreground text-xs">
                  {UPLOAD_STAGE_LABEL[progress.stage]}
                </p>
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" disabled={saving} />}>
                Cancel
              </AlertDialogClose>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </div>
      <div className="h-[78dvh] min-h-96 overflow-hidden rounded-xl border">
        <PrepareEditor src={src} fileName={documentName} handleRef={handleRef} />
      </div>
    </div>
  )
}
