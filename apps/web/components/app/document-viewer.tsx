"use client"

import dynamic from "next/dynamic"
import type { PDFViewerPageOverlayProps } from "@/components/extend/pdf-viewer"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// EmbedPDF is browser-only; load it on the routes that need it (docs/ui.md → Extend specifics).
const PDFViewer = dynamic(() => import("@/components/extend/pdf-viewer").then((m) => m.PDFViewer), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

/**
 * Read-only viewer for a stored original. Uploads always go through the API, never the viewer.
 * `renderPageOverlay` draws read-only content over the pages (the draft editor's preview); pass a
 * stable function, the viewer memoizes page rendering on it.
 */
export function DocumentViewer({
  src,
  fileName,
  renderPageOverlay,
  className,
}: {
  src: string
  fileName: string
  renderPageOverlay?: (p: PDFViewerPageOverlayProps) => React.ReactNode
  /** Size of the frame; defaults to 75dvh with a rounded border. */
  className?: string
}) {
  return (
    <div className={cn("h-[75dvh] min-h-96 overflow-hidden rounded-xl border", className)}>
      <PDFViewer
        src={src}
        fileName={fileName}
        renderPageOverlay={renderPageOverlay}
        showUpload={false}
        showDownload
        defaultZoom="fit-width"
        className="size-full"
      />
    </div>
  )
}
