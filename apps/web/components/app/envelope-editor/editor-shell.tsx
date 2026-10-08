"use client"

import { useCallback, useMemo, useState } from "react"
import type { AuditEventRow, ChainVerification } from "@/components/app/envelope/activity-list"
import { DraftStateProvider } from "@/components/app/envelope/draft-state"
import { FieldEditor } from "@/components/app/field-editor/field-editor"
import type { EditorDocument } from "@/components/app/field-editor/field-editor-surface"
import { useSearchParamState } from "@/components/app/use-search-param"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { pageRotationsOf } from "@/lib/envelope-documents"
import { type EditorStep, resolveStep } from "@/lib/envelope-editor"
import type { EditorField } from "@/lib/field-editor"
import { DocumentsStep } from "./documents-step"
import { EditorHeader } from "./editor-header"
import { PreviewStep } from "./preview-step"
import { RecipientsStep } from "./recipients-step"
import { SendProblems, SendProvider } from "./send-context"

/**
 * Draft envelope editor frame (ADR 0021, ADR 0031): a full page (the app shell hides its bar) with
 * its own top bar (`EditorHeader`: back, title, the steps as a pill, More and Send) and the current
 * step in the rest. All steps stay mounted while hidden, so switching never drops the field
 * autosave or unsaved recipient edits.
 */
export function EditorShell({
  envelope: e,
  files,
  audit,
}: {
  envelope: EnvelopeDetail
  /** Presigned URL of each envelope document's original, by envelope document id (ADR 0037). */
  files: Record<string, string | null>
  audit: { events: AuditEventRow[]; verification: ChainVerification } | null
}) {
  const fieldOwners = useMemo(
    () =>
      e.recipients
        .filter((r) => r.role !== "VIEWER")
        .map((r) => ({ id: r.id, name: r.name, colorIndex: r.colorIndex })),
    [e.recipients],
  )
  const hasFieldOwners = fieldOwners.length > 0
  // Without `?step=`, stay on the step picked at load: saving the first signer refreshes the
  // page, and the sender shouldn't be moved off the recipients step by it.
  const [initialStep] = useState(() => resolveStep(null, hasFieldOwners))
  const [step, setStep] = useSearchParamState<EditorStep>("step", (raw) =>
    resolveStep(raw ?? initialStep, hasFieldOwners),
  )
  const [fields, setFields] = useState<EditorField[]>([])
  const onFieldsChange = useCallback((f: EditorField[]) => setFields(f), [])
  const documents: EditorDocument[] = useMemo(
    () =>
      e.documents.map((d) => ({
        id: d.id,
        documentId: d.documentId,
        name: d.name,
        src: files[d.id] ?? null,
        pageRotations: pageRotationsOf(d),
      })),
    [e.documents, files],
  )
  // Adding, removing or replacing a document changes the server's fields: start again from them.
  const documentsKey = e.documents.map((d) => `${d.id}:${d.documentId}`).join(",")
  const fieldCountOf = useCallback(
    (id: string) => fields.filter((f) => f.envelopeDocumentId === id).length,
    [fields],
  )

  return (
    <DraftStateProvider>
      <SendProvider envelope={e} onFix={setStep}>
        <div className="flex min-h-0 flex-1 flex-col">
          <EditorHeader
            envelope={e}
            files={files}
            audit={audit}
            step={step}
            onStepChange={setStep}
            hasFieldOwners={hasFieldOwners}
          />
          <div className="shrink-0 px-4 pt-4 empty:hidden">
            <SendProblems />
          </div>
          <div className="min-h-0 flex-1">
            {/* Mounted only while shown: the Prepare view is heavy and holds no draft state. */}
            {step === "document" && (
              <div className="h-full overflow-y-auto">
                <DocumentsStep
                  envelope={e}
                  files={files}
                  fieldCountOf={fieldCountOf}
                  onNext={() => setStep("recipients")}
                />
              </div>
            )}
            <div hidden={step !== "recipients"} className="h-full overflow-y-auto">
              <RecipientsStep
                envelope={e}
                hasFieldOwners={hasFieldOwners}
                onNext={() => setStep("fields")}
              />
            </div>
            <div hidden={step !== "fields"} className="h-full">
              {hasFieldOwners ? (
                <FieldEditor
                  key={documentsKey}
                  envelopeId={e.id}
                  documents={documents}
                  recipients={fieldOwners}
                  initialFields={e.fields}
                  frameClassName="h-full"
                  onFieldsChange={onFieldsChange}
                />
              ) : null}
            </div>
            {/* Mounted only while shown: nothing to keep, and it saves loading the PDF twice. */}
            {step === "preview" && (
              <div className="h-full">
                <PreviewStep documents={documents} fields={fields} recipients={fieldOwners} />
              </div>
            )}
          </div>
        </div>
      </SendProvider>
    </DraftStateProvider>
  )
}
