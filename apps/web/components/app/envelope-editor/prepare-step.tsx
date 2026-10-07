"use client"

import { useRouter } from "next/navigation"
import { useDraftState } from "@/components/app/envelope/draft-state"
import { PrepareDocument } from "@/components/app/prepare-document/prepare-document"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { api } from "@/lib/api"

/**
 * Step 1 of the draft editor (ADR 0024): the full PDF editor over the envelope's document, to
 * redact, rotate, reorder or remove pages, or fill its form fields. Optional: "Skip" moves on.
 * Saving uploads a new document (the original stays in the library) and switches the draft to it
 * with `PUT /envelopes/:id/document`, which removes every placed field.
 */
export function PrepareStep({
  envelopeId,
  document,
  src,
  fieldCount,
  onNext,
}: {
  envelopeId: string
  document: { id: string; name: string }
  src: string
  /** Fields placed right now (live), for the warning. */
  fieldCount: number
  onNext: () => void
}) {
  const router = useRouter()
  const draft = useDraftState()

  async function switchEnvelope(doc: { id: string; name: string }) {
    // Nothing may still be on its way to the old document's fields.
    await draft?.settle()
    const { fieldsRemoved } = await api<{ fieldsRemoved: number }>(
      `/envelopes/${envelopeId}/document`,
      { method: "PUT", json: { documentId: doc.id } },
    )
    toastManager.add({
      title: "Envelope now uses the prepared document",
      description:
        fieldsRemoved > 0
          ? `${doc.name}. ${fieldsRemoved} placed ${fieldsRemoved === 1 ? "field was" : "fields were"} removed; place them again.`
          : doc.name,
      type: "success",
    })
    router.refresh()
    onNext()
  }

  const note =
    fieldCount > 0
      ? `This envelope then uses the new document, and its ${fieldCount} placed ${fieldCount === 1 ? "field is" : "fields are"} removed: pages may have moved, turned or gone.`
      : "This envelope then uses the new document."

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
        <Button variant="secondary" onClick={onNext}>
          Skip this step
        </Button>
      }
      className="h-full"
      frameClassName="h-full min-h-0 rounded-none border-0"
    />
  )
}
