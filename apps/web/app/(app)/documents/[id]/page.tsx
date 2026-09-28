import type { DocumentStatus } from "@sahihi/core"
import { FilePenLineIcon, SendIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DocumentViewer } from "@/components/app/document-viewer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { apiServer } from "@/lib/api-server"
import { shortHash } from "@/lib/documents"

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
  const { status, data } = await apiServer<{ document: DocumentDetail }>(
    `/documents/${encodeURIComponent(id)}`,
  )
  if (status === 404 || !data) notFound()
  const doc = data.document

  // Presigned GET, only for READY documents (the API 404s otherwise).
  const file =
    doc.status === "READY"
      ? await apiServer<{ url: string }>(`/documents/${encodeURIComponent(doc.id)}/file`)
      : null

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/documents" />}>Documents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="max-w-64 truncate">{doc.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="truncate font-semibold text-xl">{doc.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
            <Badge variant={doc.status === "READY" ? "success" : "error"}>
              {doc.status.toLowerCase()}
            </Badge>
            {doc.pageCount !== null && (
              <span>
                {doc.pageCount} {doc.pageCount === 1 ? "page" : "pages"}
              </span>
            )}
            <span>Uploaded {new Date(doc.createdAt).toLocaleDateString()}</span>
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
            <Button
              variant="outline"
              render={<Link href={`/documents/${encodeURIComponent(doc.id)}/prepare`} />}
            >
              <FilePenLineIcon aria-hidden />
              Prepare
            </Button>
            <Button
              render={<Link href={`/envelopes/new?documentId=${encodeURIComponent(doc.id)}`} />}
            >
              <SendIcon aria-hidden />
              Create envelope
            </Button>
          </div>
        )}
      </div>

      {doc.status === "READY" && file?.data ? (
        <DocumentViewer src={file.data.url} fileName={doc.name} />
      ) : (
        <Alert variant={doc.status === "FAILED" ? "error" : "warning"}>
          <AlertTitle>
            {doc.status === "FAILED" ? "This PDF could not be processed" : "Not ready yet"}
          </AlertTitle>
          <AlertDescription>
            {doc.status === "FAILED"
              ? (doc.failureReason ?? "Upload a new copy of the file.")
              : "The upload hasn't finished. Upload the file again if this persists."}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
