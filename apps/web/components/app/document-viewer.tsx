"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"

// EmbedPDF is browser-only; load it on the routes that need it (docs/ui.md → Extend specifics).
const PDFViewer = dynamic(() => import("@/components/extend/pdf-viewer").then((m) => m.PDFViewer), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

/** Read-only viewer for a stored original. Uploads always go through the API, never the viewer. */
export function DocumentViewer({ src, fileName }: { src: string; fileName: string }) {
  return (
    <div className="h-[75dvh] min-h-96 overflow-hidden rounded-xl border">
      <PDFViewer
        src={src}
        fileName={fileName}
        showUpload={false}
        showDownload
        defaultZoom="fit-width"
        className="size-full"
      />
    </div>
  )
}
