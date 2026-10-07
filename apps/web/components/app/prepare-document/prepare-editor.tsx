"use client"

import type { RefObject } from "react"
import { toastManager } from "@/components/app/toast"
import { PDFEditor, type PDFEditorHandle } from "@/components/extend/pdf-editor"

// Prepare-document configuration (docs/ui.md → PDFEditor configurations #2): keep redact, pages and
// forms; no annotations, signing, stamps, comments or security. Never download from here, and never
// trust these bytes as a signed result (ADR 0004).
const PREPARE_FEATURES = {
  annotate: false,
  sign: false,
  stamps: false,
  comments: false,
  security: false,
}

/**
 * The editor itself, in its own module so the page can load it with next/dynamic. The handle is
 * passed as a plain prop because dynamic() wrappers don't reliably forward refs.
 */
export default function PrepareEditor({
  src,
  fileName,
  handleRef,
}: {
  src: string
  fileName: string
  handleRef: RefObject<PDFEditorHandle | null>
}) {
  return (
    <PDFEditor
      ref={handleRef}
      src={src}
      fileName={fileName}
      defaultMode="view"
      defaultZoom="fit-width"
      showUpload={false}
      showDownload={false}
      persistSignatures={false}
      features={PREPARE_FEATURES}
      onToast={(t) => toastManager.add({ title: t.message, type: t.tone })}
      className="size-full"
    />
  )
}
