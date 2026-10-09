import type { DocumentStatus } from "@sahihi/core"
import { notFound, redirect } from "next/navigation"
import { PrepareDocument } from "@/components/app/prepare-document/prepare-document"
import { Breadcrumb } from "@/components/arc/breadcrumb/breadcrumb"
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
      <Breadcrumb
        items={[
          { label: "All files", href: "/files" },
          { label: doc.name, href: `/documents/${doc.id}` },
          { label: "Prepare" },
        ]}
      />
      <h1 className="font-medium text-2xl tracking-tight">Prepare document</h1>
      <PrepareDocument documentId={doc.id} documentName={doc.name} src={file.data.url} />
    </div>
  )
}
