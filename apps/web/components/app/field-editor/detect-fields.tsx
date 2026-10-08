"use client"

import { assignSuggestions, type FieldSuggestion, withoutDuplicates } from "@sahihi/core"
import { useState } from "react"
import { FileSearchIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { api } from "@/lib/api"
import { useFieldEditor } from "./context"

/**
 * "Detect fields" (ADR 0020): places a field on every anchor tag (`{{s1:signature}}`) and every
 * form field of the PDF or, failing both, next to labelled signature lines ("Signature: ____"). Numbered roles (`s1`, `s2`) go to that recipient in the list; named roles
 * ("Buyer Signature", "Seller Date") are split across the recipients in list order; the rest go to
 * the active recipient. The sender reviews them like any placed field.
 */
export function DetectFields() {
  const { state, dispatch, activeRecipientId, recipients, activeDocument } = useFieldEditor()
  const documentId = activeDocument.documentId
  const [pending, setPending] = useState(false)

  async function run() {
    if (!activeRecipientId) return
    setPending(true)
    try {
      const { suggestions } = await api<{ suggestions: FieldSuggestion[] }>(
        `/documents/${encodeURIComponent(documentId)}/field-suggestions`,
      )
      const owners = assignSuggestions(suggestions, [...recipients.keys()], activeRecipientId)
      const fields = withoutDuplicates(
        state.fields.filter((f) => f.envelopeDocumentId === activeDocument.id),
        suggestions.map((s, i) => ({
          recipientId: owners[i] ?? activeRecipientId,
          envelopeDocumentId: activeDocument.id,
          type: s.type,
          page: s.page,
          required: s.required,
          x: s.x,
          y: s.y,
          width: s.width,
          height: s.height,
        })),
      )
      if (fields.length === 0) {
        toastManager.add({
          title: suggestions.length ? "Detected fields already placed" : "No fields detected",
          description: suggestions.length
            ? "Every detected field already has a field on it."
            : "No {{s1:signature}} tags, form fields or labelled signature lines found. Place the fields by hand.",
          type: "info",
        })
        return
      }
      dispatch({ type: "import", fields })
      toastManager.add({
        title: `Added ${fields.length} detected field${fields.length === 1 ? "" : "s"}`,
        description: "Check who each field belongs to before you send.",
        type: "success",
      })
    } catch (err) {
      toastManager.add({
        title: "Couldn't detect fields",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Tooltip content="Place fields on {{s1:signature}} tags, form fields and labelled signature lines">
      <Button
        variant="secondary"
        size="sm"
        className="w-full"
        loading={pending}
        disabled={!activeRecipientId}
        onClick={() => void run()}
      >
        <FileSearchIcon aria-hidden />
        Detect fields
      </Button>
    </Tooltip>
  )
}
