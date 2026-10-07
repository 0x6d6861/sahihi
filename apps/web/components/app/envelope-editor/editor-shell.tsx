"use client"

import { useCallback, useMemo, useState } from "react"
import type { AuditEventRow, ChainVerification } from "@/components/app/envelope/activity-list"
import { DraftStateProvider } from "@/components/app/envelope/draft-state"
import { FieldEditor } from "@/components/app/field-editor/field-editor"
import { useSearchParamState } from "@/components/app/use-search-param"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { type EditorStep, resolveStep } from "@/lib/envelope-editor"
import type { EditorField } from "@/lib/field-editor"
import { EditorHeader } from "./editor-header"
import { PrepareStep } from "./prepare-step"
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
  fileUrl,
  audit,
}: {
  envelope: EnvelopeDetail
  fileUrl: string | null
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
  const pageRotations = (e.document.pages ?? []).map((p) => p.rotation)
  const noFile = (
    <p className="p-6 text-muted-foreground text-sm">The document could not be loaded.</p>
  )

  return (
    <DraftStateProvider>
      <SendProvider envelope={e} onFix={setStep}>
        <div className="flex min-h-0 flex-1 flex-col">
          <EditorHeader
            envelope={e}
            fileUrl={fileUrl}
            audit={audit}
            step={step}
            onStepChange={setStep}
            hasFieldOwners={hasFieldOwners}
          />
          <div className="shrink-0 px-4 pt-4 empty:hidden">
            <SendProblems />
          </div>
          <div className="min-h-0 flex-1">
            {/* The full PDF editor: mounted only while shown, it's heavy and holds no draft state. */}
            {step === "document" && (
              <div className="h-full">
                {fileUrl ? (
                  <PrepareStep
                    // A new document after "Save and use": start over on it.
                    key={e.document.id}
                    envelopeId={e.id}
                    document={e.document}
                    src={fileUrl}
                    fieldCount={fields.length}
                    onNext={() => setStep("recipients")}
                  />
                ) : (
                  noFile
                )}
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
              {!fileUrl ? (
                noFile
              ) : hasFieldOwners ? (
                <FieldEditor
                  // Switching documents removes every field: start from the server's (empty) list.
                  key={e.document.id}
                  envelopeId={e.id}
                  documentId={e.document.id}
                  src={fileUrl}
                  fileName={e.document.name}
                  recipients={fieldOwners}
                  initialFields={e.fields}
                  pageRotations={pageRotations}
                  frameClassName="h-full"
                  onFieldsChange={onFieldsChange}
                />
              ) : null}
            </div>
            {/* Mounted only while shown: nothing to keep, and it saves loading the PDF twice. */}
            {step === "preview" && (
              <div className="h-full">
                {fileUrl ? (
                  <PreviewStep
                    src={fileUrl}
                    fileName={e.document.name}
                    fields={fields}
                    recipients={fieldOwners}
                    pageRotations={pageRotations}
                  />
                ) : (
                  noFile
                )}
              </div>
            )}
          </div>
        </div>
      </SendProvider>
    </DraftStateProvider>
  )
}
