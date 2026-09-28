import type { DocumentStatus } from "@sahihi/core"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { PrepareDocument } from "@/components/app/prepare-document/prepare-document"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { apiServer } from "@/lib/api-server"

export const metadata = { title: "Prepare document" }

export default async function PrepareDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, data } = await apiServer<{
    document: { id: string; name: string; status: DocumentStatus }
  }>(`/documents/${encodeURIComponent(id)}`)
  if (status === 404 || !data) notFound()
  const doc = data.document
  if (doc.status !== "READY") redirect(`/documents/${doc.id}`)

  const file = await apiServer<{ url: string }>(`/documents/${encodeURIComponent(doc.id)}/file`)
  if (!file.data) notFound()

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/documents" />}>Documents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="max-w-64 truncate"
              render={<Link href={`/documents/${doc.id}`} />}
            >
              {doc.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Prepare</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="font-semibold text-xl">Prepare document</h1>
      <PrepareDocument documentId={doc.id} documentName={doc.name} src={file.data.url} />
    </div>
  )
}
