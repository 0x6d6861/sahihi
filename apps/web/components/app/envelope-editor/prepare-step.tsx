"use client"

import { useRouter } from "next/navigation"
import { useDraftState } from "@/components/app/envelope/draft-state"
import { PrepareDocument } from "@/components/app/prepare-document/prepare-document"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { api } from "@/lib/api"

/**
 * "Prepare pages" of one of the draft's documents (ADR 0024, 0037): the full PDF editor over it, to
 * redact, rotate, reorder or remove pages, or fill its form fields. Saving uploads a new document
 * (the original stays in the library) and puts it in this document's place with
 * `PUT /envelopes/:id/document`, which removes this document's placed fields only.
 */
export function PrepareStep({
  envelopeId,
  envelopeDocumentId,
  document,
  src,
  fieldCount,
  onDone,
}: {
  envelopeId: string
  envelopeDocumentId: string
  document: { id: string; name: string }
  src: string
  /** Fields placed right now (live) on this document, for the warning. */
  fieldCount: number
  onDone: () => void
}) {
  const router = useRouter()
  const draft = useDraftState()

  async function switchEnvelope(doc: { id: string; name: string }) {
    // Nothing may still be on its way to the old document's fields.
    await draft?.settle()
    const { fieldsRemoved } = await api<{ fieldsRemoved: number }>(
      `/envelopes/${envelopeId}/document`,
      { method: "PUT", json: { documentId: doc.id, envelopeDocumentId } },
    )
    toastManager.add({
      title: "The envelope now uses the prepared document",
      description:
        fieldsRemoved > 0
          ? `${doc.name}. ${fieldsRemoved} placed ${fieldsRemoved === 1 ? "field was" : "fields were"} removed; place them again.`
          : doc.name,
      type: "success",
    })
    router.refresh()
    onDone()
  }

  const note =
    fieldCount > 0
      ? `The envelope then uses the new document, and the ${fieldCount} ${fieldCount === 1 ? "field" : "fields"} placed on this one ${fieldCount === 1 ? "is" : "are"} removed: pages may have moved, turned or gone.`
      : "The envelope then uses the new document in this one's place."

  return (
    <PrepareDocument
      documentId={document.id}
      documentName={document.name}
      src={src}
      onSaved={switchEnvelope}
      saveLabel="Save and use"
      confirmNote={note}
      note={note}
      actions={
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      }
      className="h-full"
      frameClassName="h-full min-h-0 rounded-none border-0"
    />
  )
}
