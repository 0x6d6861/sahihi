"use client"

import type { RefObject } from "react"
import {
  PDFViewer,
  type PDFViewerHandle,
  type PDFViewerPageOverlayProps,
} from "@/components/extend/pdf-viewer"

/**
 * The lighter Extend viewer for signers (never PDFEditor, docs/ui.md). In its own module so the
 * page can load it with next/dynamic; the handle is a plain prop since dynamic() doesn't forward refs.
 */
export default function SigningViewer({
  src,
  fileName,
  handleRef,
  renderPageOverlay,
}: {
  src: string
  fileName: string
  handleRef: RefObject<PDFViewerHandle | null>
  renderPageOverlay: (p: PDFViewerPageOverlayProps) => React.ReactNode
}) {
  return (
    <PDFViewer
      ref={handleRef}
      src={src}
      fileName={fileName}
      defaultZoom="fit-width"
      showUpload={false}
      showDownload={false}
      renderPageOverlay={renderPageOverlay}
      className="size-full"
    />
  )
}
