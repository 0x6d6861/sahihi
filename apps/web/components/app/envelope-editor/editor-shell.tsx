"use client"

import { SidebarLeftIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useMemo, useState } from "react"
import type { AuditEventRow, ChainVerification } from "@/components/app/envelope/activity-list"
import { DraftStateProvider } from "@/components/app/envelope/draft-state"
import { FieldEditor } from "@/components/app/field-editor/field-editor"
import { useSearchParamState } from "@/components/app/use-search-param"
import { Badge } from "@/components/arc/badge/badge"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sidebar, SidebarProvider } from "@/components/ui/sidebar"
import { ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { type EditorStep, resolveStep } from "@/lib/envelope-editor"
import type { EditorField } from "@/lib/field-editor"
import { PrepareStep } from "./prepare-step"
import { PreviewStep } from "./preview-step"
import { RecipientsStep } from "./recipients-step"
import { SendButton, SendProblems, SendProvider } from "./send-context"
import { StepRail } from "./step-rail"

/**
 * Draft envelope editor frame (ADR 0021), inside the app shell: step rail on the left (a static
 * coss Sidebar column, an Arc drawer on phones), top bar with the title and Send, and the current
 * step in the rest. All steps stay mounted while hidden, so switching never drops the field
 * autosave or unsaved recipient edits.
 *
 * The app shell is a top bar (ADR 0026), so this is the page's only coss `SidebarProvider`; the
 * rail is a static (`collapsible="none"`) Sidebar column, never the `fixed` collapsible one.
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
  const badge = ENVELOPE_STATUS_BADGE[e.status]
  const [stepsOpen, setStepsOpen] = useState(false)
  const rail = (onNavigate?: () => void) => (
    <StepRail
      envelope={e}
      fileUrl={fileUrl}
      audit={audit}
      step={step}
      onStepChange={setStep}
      onNavigate={onNavigate}
      hasFieldOwners={hasFieldOwners}
    />
  )

  const noFile = (
    <p className="p-6 text-muted-foreground text-sm">The document could not be loaded.</p>
  )

  return (
    <DraftStateProvider>
      <SendProvider envelope={e} onFix={setStep}>
        <SidebarProvider className="h-full min-h-0">
          <Sidebar collapsible="none" className="border-r max-md:hidden">
            {rail()}
          </Sidebar>
          <Drawer open={stepsOpen} onOpenChange={setStepsOpen}>
            <DrawerContent side="left" title="Steps" description="Move between the editor's steps.">
              <div className="flex flex-col">{rail(() => setStepsOpen(false))}</div>
            </DrawerContent>
          </Drawer>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
              <Button
                size="icon-sm"
                variant="ghost"
                className="shrink-0 text-muted-foreground hover:text-foreground md:hidden"
                aria-label="Steps"
                title="Steps"
                onClick={() => setStepsOpen(true)}
              >
                <HugeiconsIcon icon={SidebarLeftIcon} size={16} strokeWidth={1.75} aria-hidden />
              </Button>
              <Separator orientation="vertical" className="h-5 md:hidden" />
              <h1 className="truncate font-medium">{e.title}</h1>
              <Badge tone={badge.tone} size="sm">
                {badge.label}
              </Badge>
              <span className="truncate text-muted-foreground text-sm max-md:hidden">
                {e.document.name}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <SendButton />
              </div>
            </header>
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
        </SidebarProvider>
      </SendProvider>
    </DraftStateProvider>
  )
}
