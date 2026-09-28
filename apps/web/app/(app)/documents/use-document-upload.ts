"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import { toastManager } from "@/components/ui/toast"
import { type UploadStage, uploadPercent } from "@/lib/upload"
import { UploadRejectedError, uploadPdf } from "@/lib/upload-client"

export interface UploadState {
  fileName: string
  stage: UploadStage
  percent: number
}

/** Drop-zone upload with progress state and toasts. The flow itself is `uploadPdf`. */
export function useDocumentUpload({ onDone }: { onDone?: () => void } = {}) {
  const router = useRouter()
  const [state, setState] = useState<UploadState | null>(null)

  const upload = useCallback(
    async (file: File) => {
      try {
        const doc = await uploadPdf(file, {
          onStage: (stage, fraction) =>
            setState({ fileName: file.name, stage, percent: uploadPercent(stage, fraction) }),
        })
        toastManager.add({ title: "Document uploaded", description: doc.name, type: "success" })
        onDone?.()
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
    [onDone, router],
  )

  return { upload, state, busy: state !== null }
}
