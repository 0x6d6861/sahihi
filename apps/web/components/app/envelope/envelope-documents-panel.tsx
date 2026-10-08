"use client"

import { useState } from "react"
import { DocumentViewer } from "@/components/app/document-viewer"
import { AttachmentsList } from "@/components/app/envelope/attachments-list"
import { DocumentSwitcher } from "@/components/app/envelope/document-switcher"
import type { AttachmentView } from "@/lib/envelope-documents"
import { pluralize } from "@/lib/format"

/**
 * The envelope page's Documents tab (ADR 0037): the originals as sent, one at a time with a
 * switcher, then the supporting files (download only).
 */
export function EnvelopeDocumentsPanel({
  envelopeId,
  documents,
  attachments,
}: {
  envelopeId: string
  /** In signing order, each with its original's presigned URL (null if it couldn't be loaded). */
  documents: { id: string; name: string; pageCount: number | null; url: string | null }[]
  attachments: AttachmentView[]
}) {
  const [activeId, setActiveId] = useState(documents[0]?.id ?? "")
  const active = documents.find((d) => d.id === activeId) ?? documents[0]
  const files = attachments.filter((a) => a.status === "READY")
  return (
    <div className="flex flex-col gap-4">
      <DocumentSwitcher
        documents={documents}
        value={active?.id ?? ""}
        onValueChange={setActiveId}
      />
      {active?.url ? (
        <DocumentViewer key={active.id} src={active.url} fileName={active.name} />
      ) : (
        <p className="text-muted-foreground text-sm">The document could not be loaded.</p>
      )}
      {files.length > 0 && (
        <section aria-labelledby="files-heading" className="flex flex-col gap-2 pt-2">
          <h3 id="files-heading" className="font-medium text-sm">
            Supporting files{" "}
            <span className="text-muted-foreground tabular-nums">{files.length}</span>
          </h3>
          <p className="text-muted-foreground text-xs">
            Shared with the recipients, not signed. {pluralize(files.length, "file")} listed on the
            certificate with {files.length === 1 ? "its" : "their"} fingerprint.
          </p>
          <AttachmentsList attachments={files} source={{ kind: "sender", envelopeId }} />
        </section>
      )}
    </div>
  )
}
