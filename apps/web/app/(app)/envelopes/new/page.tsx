import type { DocumentStatus } from "@sahihi/core"
import { ButtonLink } from "@/components/app/button-link"
import { FileTextIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { apiServer } from "@/lib/api-server"
import { NewEnvelopeForm, type ReadyDocument } from "./new-envelope-form"

export const metadata = { title: "New envelope" }

interface DocumentRow {
  id: string
  name: string
  status: DocumentStatus
}

export default async function NewEnvelopePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string | string[] }>
}) {
  const raw = (await searchParams).documentId
  const documentId = typeof raw === "string" ? raw : undefined

  // The 25 newest documents. A preselected one further back is fetched on its own.
  const { data } = await apiServer<{ items: DocumentRow[] }>("/documents")
  const documents: ReadyDocument[] = (data?.items ?? [])
    .filter((d) => d.status === "READY")
    .map(({ id, name }) => ({ id, name }))
  if (documentId && !documents.some((d) => d.id === documentId)) {
    const one = await apiServer<{ document: DocumentRow }>(
      `/documents/${encodeURIComponent(documentId)}`,
    )
    if (one.data?.document.status === "READY") {
      documents.unshift({ id: one.data.document.id, name: one.data.document.name })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-medium text-2xl tracking-tight">New envelope</h1>
      <Panel
        title="Envelope details"
        description="You'll add recipients and place fields on the next screen."
      >
        {documents.length === 0 ? (
          <EmptyState
            className="md:py-8"
            icon={<FileTextIcon aria-hidden />}
            title="No ready documents"
            description="Upload a PDF first, then come back here."
            action={
              <ButtonLink variant="primary" href="/documents">
                Go to documents
              </ButtonLink>
            }
          />
        ) : (
          <NewEnvelopeForm documents={documents} defaultDocumentId={documentId} />
        )}
      </Panel>
    </div>
  )
}
