import { notFound, redirect } from "next/navigation"
import type { AuditEventRow, ChainVerification } from "@/components/app/envelope/activity-list"
import { EditorShell } from "@/components/app/envelope-editor/editor-shell"
import { apiServer } from "@/lib/api-server"
import { type EnvelopeResponse, isEditableDraft } from "@/lib/envelope-detail"

/**
 * Draft envelope editor (ADR 0021, ADR 0031): a full page with its own top bar (the steps as a
 * pill, More and Send). Anything but an editable draft goes back to the read-only envelope page.
 */
export default async function EditEnvelopePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const path = `/envelopes/${encodeURIComponent(id)}`
  const [{ status, data }, audit] = await Promise.all([
    apiServer<EnvelopeResponse>(path),
    apiServer<{ events: AuditEventRow[]; verification: ChainVerification }>(`${path}/audit`),
  ])
  if (status === 404 || !data) notFound()
  if (!isEditableDraft(data)) redirect(path)
  const e = data.envelope
  // Each document's original PDF (presigned, short-lived), by envelope document id.
  const urls = await Promise.all(
    e.documents.map((d) =>
      apiServer<{ url: string }>(`/documents/${encodeURIComponent(d.documentId)}/file`),
    ),
  )
  const files = Object.fromEntries(e.documents.map((d, i) => [d.id, urls[i]?.data?.url ?? null]))

  return <EditorShell envelope={e} files={files} audit={audit.data ?? null} />
}
