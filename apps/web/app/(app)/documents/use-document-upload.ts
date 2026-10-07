"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toastManager } from "@/components/app/toast"
import { type UploadStage, uploadPercent } from "@/lib/upload"
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
