import type { DocumentStatus } from "@sahihi/core"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentViewer } from "@/components/app/document-viewer"
import { FilePenLineIcon, SendIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
import { apiServer } from "@/lib/api-server"
import { DOCUMENT_STATUS_BADGE } from "@/lib/constants"
import { shortHash } from "@/lib/documents"
import { filesHref } from "@/lib/files-list"
import { formatDate } from "@/lib/format"

interface DocumentDetail {
  id: string
  name: string
  status: DocumentStatus
  pageCount: number | null
  sha256: string | null
  failureReason: string | null
  createdAt: string
  source: { id: string; name: string; deletedAt: string | null } | null
}

export const metadata = { title: "Document" }

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<{
    document: DocumentDetail
    folderPath: { id: string; name: string }[]
  }>(`/documents/${encodeURIComponent(id)}`)
  if (status === 404 || !data) notFound()
  const doc = data.document

  // Presigned GET, only for READY documents (the API 404s otherwise).
  const file =
    doc.status === "READY"
      ? await apiServer<{ url: string }>(`/documents/${encodeURIComponent(doc.id)}/file`)
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* All files / the folders it lives in, root first / the document. */}
      <Breadcrumb
        ariaLabel="Location"
        items={[
          { label: "All files", href: "/files" },
          ...data.folderPath.map((f) => ({ label: f.name, href: filesHref({ folder: f.id }) })),
          { label: doc.name },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="truncate font-medium text-2xl tracking-tight">{doc.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <Badge tone={DOCUMENT_STATUS_BADGE[doc.status].tone} size="sm">
              {DOCUMENT_STATUS_BADGE[doc.status].label}
            </Badge>
            {doc.pageCount !== null && (
              <span>
                {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}
              </span>
            )}
            <span>Uploaded {formatDate(doc.createdAt)}</span>
            {doc.source && (
              <span>
                Prepared from{" "}
                {doc.source.deletedAt ? (
                  doc.source.name
                ) : (
                  <Link href={`/documents/${doc.source.id}`} className="underline">
                    {doc.source.name}
                  </Link>
                )}
              </span>
            )}
            {doc.sha256 && (
              <span className="font-mono text-xs" title={`SHA-256 ${doc.sha256}`}>
                SHA-256 {shortHash(doc.sha256)}
              </span>
            )}
          </div>
        </div>
        {doc.status === "READY" && (
          <div className="flex gap-2">
            <ButtonLink href={`/documents/${encodeURIComponent(doc.id)}/prepare`}>
              <FilePenLineIcon aria-hidden />
              Prepare
            </ButtonLink>
            <ButtonLink
              variant="primary"
              href={`/envelopes/new?documentId=${encodeURIComponent(doc.id)}`}
            >
              <SendIcon aria-hidden />
              Create envelope
            </ButtonLink>
          </div>
        )}
      </div>

      {doc.status === "READY" && file?.data ? (
        <DocumentViewer src={file.data.url} fileName={doc.name} />
      ) : (
        <Alert
          tone={doc.status === "FAILED" ? "danger" : "warning"}
          title={doc.status === "FAILED" ? "This PDF could not be processed" : "Not ready yet"}
        >
          {doc.status === "FAILED"
            ? (doc.failureReason ?? "Upload a new copy of the file.")
            : "The upload hasn't finished. Upload the file again if this persists."}
        </Alert>
      )}
    </div>
  )
}
