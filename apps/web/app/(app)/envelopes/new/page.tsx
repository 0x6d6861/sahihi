import type { DocumentStatus } from "@sahihi/core"
import { FileTextIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
      <h1 className="font-semibold text-xl">New envelope</h1>
      <Card>
        <CardHeader>
          <CardTitle>Envelope details</CardTitle>
          <CardDescription>
            You'll add recipients and place fields on the next screen.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {documents.length === 0 ? (
            <Empty className="md:py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon aria-hidden />
                </EmptyMedia>
                <EmptyTitle>No ready documents</EmptyTitle>
                <EmptyDescription>Upload a PDF first, then come back here.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/documents" />}>Go to documents</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <NewEnvelopeForm documents={documents} defaultDocumentId={documentId} />
          )}
        </CardPanel>
      </Card>
    </div>
  )
}
