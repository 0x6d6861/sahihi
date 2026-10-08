"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toastManager } from "@/components/app/toast"
import { batchSummary, splitUploads, type UploadStage, uploadPercent } from "@/lib/upload"
import { UploadRejectedError, uploadPdf } from "@/lib/upload-client"

export interface UploadState {
  fileName: string
  stage: UploadStage
  percent: number
}

/**
 * Drop-zone upload with progress state and toasts. The flow itself is `uploadPdf`.
 * `onDone` gets the new document. The success toast offers "Create envelope" on it.
 */
export function useDocumentUpload({
  onDone,
  folderId,
}: {
  onDone?: (doc: { id: string; name: string }) => void
  /** Folder the upload lands in (the one open on the Documents page). */
  folderId?: string
} = {}) {
  const router = useRouter()
  const [state, setState] = useState<UploadState | null>(null)

  const upload = useCallback(
    async (file: File) => {
      try {
        const doc = await uploadPdf(file, {
          folderId,
          onStage: (stage, fraction) =>
            setState({ fileName: file.name, stage, percent: uploadPercent(stage, fraction) }),
        })
        toastManager.add({
          title: "Document uploaded",
          description: doc.name,
          type: "success",
          action: {
            label: "Create envelope",
            onClick: () => router.push(`/envelopes/new?documentId=${encodeURIComponent(doc.id)}`),
          },
        })
        onDone?.(doc)
        router.refresh()
      } catch (err) {
        const rejected = err instanceof UploadRejectedError
        toastManager.add({
          title: rejected ? "Can't upload this file" : "Upload failed",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
      } finally {
        setState(null)
      }
    },
    [onDone, folderId, router],
  )

  return { upload, state, busy: state !== null }
}

/**
 * Several PDFs dropped from the desktop (ADR 0039), one after another into `folderId` (null = top
 * level). One toast follows the batch ("Uploading 2 of 5…") and ends with what worked; files that
 * aren't PDFs, or are too big, are skipped before anything is sent.
 */
export function useBatchUpload() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  const uploadMany = useCallback(
    async (files: File[], folderId: string | null, folderName: string) => {
      const { accepted, skipped } = splitUploads(files)
      const where = folderId ? ` to ${folderName}` : ""
      if (accepted.length === 0) {
        toastManager.add({
          title: files.length === 1 ? "Can't upload this file" : "Can't upload these files",
          description: skipped[0]?.message,
          type: "error",
        })
        return
      }
      setBusy(true)
      const toast = toastManager.add({ title: `Uploading${where}…`, type: "loading" })
      const failed: string[] = skipped.map((s) => `${s.file.name}: ${s.message}`)
      let uploaded = 0
      for (const [i, file] of accepted.entries()) {
        if (toast) {
          toastManager.update(toast, {
            title: `Uploading ${i + 1} of ${accepted.length}${where}…`,
            description: file.name,
          })
        }
        try {
          await uploadPdf(file, { folderId: folderId ?? undefined })
          uploaded += 1
        } catch (err) {
          failed.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed"}`)
        }
      }
      const result = {
        title: batchSummary(uploaded, failed.length),
        description:
          failed.length > 0 ? failed.join(" · ") : folderId ? `In ${folderName}` : undefined,
        type:
          failed.length === 0
            ? ("success" as const)
            : uploaded > 0
              ? ("warning" as const)
              : ("error" as const),
      }
      if (toast) toastManager.update(toast, result)
      else toastManager.add(result)
      setBusy(false)
      router.refresh()
    },
    [router],
  )

  return { uploadMany, busy }
}
