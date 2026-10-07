"use client"

import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { SaveIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/arc/drawer/drawer"
import { Progress } from "@/components/arc/progress/progress"
import type { PDFEditorHandle } from "@/components/extend/pdf-editor"
// coss Skeleton: a block the size of the PDF editor (Arc's skeleton draws text lines).
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { preparedFileName } from "@/lib/documents"
import { UPLOAD_STAGE_LABEL, type UploadStage, uploadPercent } from "@/lib/upload"
import { uploadPdf } from "@/lib/upload-client"
import { cn } from "@/lib/utils"

const PrepareEditor = dynamic(() => import("./prepare-editor"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

/**
 * Full PDFEditor over a READY original. "Save as new document" applies pending redactions, takes
 * the edited bytes and runs the normal upload flow with `sourceDocumentId`, so the server
 * re-inspects and re-hashes them. The original document is never modified. By default the new
 * document opens; the draft editor's first step passes `onSaved` to switch the envelope to it
 * instead (ADR 0024).
 */
export function PrepareDocument({
  documentId,
  documentName,
  src,
  onSaved,
  saveLabel = "Save as new document",
  confirmNote,
  note,
  actions,
  frameClassName,
  className,
}: {
  documentId: string
  documentName: string
  src: string
  /** Runs after the upload, while the dialog still shows progress; throw to report a failure. */
  onSaved?: (doc: { id: string; name: string }) => Promise<void>
  saveLabel?: string
  /** Appended to the confirmation's description (e.g. what happens to placed fields). */
  confirmNote?: string
  /** Shown in the side panel above the buttons. */
  note?: string
  /** Extra buttons under Save in the side panel (e.g. "Skip"). */
  actions?: React.ReactNode
  /** Size of the editor + panel frame; defaults to 78dvh with a rounded border. */
  frameClassName?: string
  className?: string
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
      if (onSaved) {
        await onSaved(doc)
        setProgress(null)
        setOpen(false)
        return
      }
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
  // The wording and actions sit beside the pages like the field tools (ADR 0024): a fixed panel
  // from `lg`, a drawer opened from a bar above the editor below it.
  const panel = (
    <ScrollArea className="h-full">
      <section className="flex flex-col gap-3 p-4">
        <h2 className="font-medium text-sm">Prepare document</h2>
        <p className="text-muted-foreground text-sm">
          Optional. Redact, rotate, reorder or delete pages, or fill existing form fields with the
          editor's tools.
        </p>
      </section>
      <Separator />
      <section className="flex flex-col gap-3 p-4">
        <h2 className="font-medium text-sm">Save</h2>
        <p className="text-muted-foreground text-sm">
          Creates <span className="font-medium text-foreground">{newName}</span>. “{documentName}”
          stays as it is.
        </p>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
        <div className="flex flex-col gap-2">
          <Button onClick={() => setOpen(true)} disabled={saving}>
            <SaveIcon aria-hidden />
            {saveLabel}
          </Button>
          {actions}
        </div>
      </section>
    </ScrollArea>
  )

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent
          title="Save as a new document?"
          description={`“${newName}” will be created from your edits and fingerprinted on its own. Any redaction marks are applied permanently: the covered content is removed from the new file. “${documentName}” is not changed.${confirmNote ? ` ${confirmNote}` : ""}`}
        >
          {progress && (
            <Progress
              value={progress.percent}
              label={UPLOAD_STAGE_LABEL[progress.stage]}
              showValue
            />
          )}
          <DialogActions>
            <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </DialogActions>
        </DialogContent>
      </Dialog>
      <div
        className={cn("flex h-[78dvh] min-h-96 overflow-hidden rounded-2xl border", frameClassName)}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Below `lg` the side panel is hidden: open it as a drawer from this bar. */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 text-muted-foreground text-xs lg:hidden">
            <Drawer>
              <DrawerTrigger asChild>
                <Button variant="secondary" size="sm">
                  <SaveIcon aria-hidden />
                  {saveLabel}
                </Button>
              </DrawerTrigger>
              <DrawerContent side="right" title="Prepare document">
                {panel}
              </DrawerContent>
            </Drawer>
            <span className="truncate">Edit the pages, then save.</span>
          </div>
          <div className="min-h-0 flex-1">
            <PrepareEditor src={src} fileName={documentName} handleRef={handleRef} />
          </div>
        </div>
        <aside
          aria-label="Prepare document"
          className="w-72 shrink-0 border-l bg-background max-lg:hidden"
        >
          {panel}
        </aside>
      </div>
    </div>
  )
}
