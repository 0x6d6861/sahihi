import { notFound, redirect } from "next/navigation"
import type { AuditEventRow, ChainVerification } from "@/components/app/envelope/activity-list"
import { EditorShell } from "@/components/app/envelope-editor/editor-shell"
import { apiServer } from "@/lib/api-server"
import { type EnvelopeResponse, isEditableDraft } from "@/lib/envelope-detail"

/**
 * Draft envelope editor (ADR 0021): full bleed inside the app shell, three steps (document &
 * recipients, fields, preview) in a left rail, Send in the top bar. Anything but an editable draft goes back to the
 * read-only envelope page.
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
  // The original PDF (presigned, short-lived).
  const file = await apiServer<{ url: string }>(
    `/documents/${encodeURIComponent(e.document.id)}/file`,
  )

  return <EditorShell envelope={e} fileUrl={file.data?.url ?? null} audit={audit.data ?? null} />
}
