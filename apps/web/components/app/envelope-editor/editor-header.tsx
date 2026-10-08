"use client"

import {
  FileEditIcon,
  EyeIcon as HugeEyeIcon,
  Cursor01Icon as HugeMousePointerIcon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ActivityList,
  type AuditEventRow,
  type ChainVerification,
} from "@/components/app/envelope/activity-list"
import {
  ActivityIcon,
  ArrowLeftIcon,
  DownloadIcon,
  FileTextIcon,
  LayoutTemplateIcon,
} from "@/components/app/icons"
import { PillNav } from "@/components/app/pill-nav"
import { SaveTemplateDialog } from "@/components/app/templates/save-template-dialog"
import { Badge } from "@/components/arc/badge/badge"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { SplitButton, type SplitButtonAction } from "@/components/arc/split-button/split-button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button } from "@/components/ui/button"
import { ENVELOPE_STATUS_BADGE } from "@/lib/constants"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import {
  EDITOR_STEP_INFO,
  EDITOR_STEPS,
  type EditorStep,
  stepEnabled,
  stepHint,
} from "@/lib/envelope-editor"
import { SendButton } from "./send-context"

const STEP_ICONS: Record<EditorStep, IconSvgElement> = {
  document: FileEditIcon,
  recipients: UserGroupIcon,
  fields: HugeMousePointerIcon,
  preview: HugeEyeIcon,
}

/**
 * The draft editor's own top bar (ADR 0031; the app shell hides its bar on this page): the way
 * back, title and status on the left; the steps as the app's pill in the middle (its own row below
 * `md`, the buttons get their own row below `sm`); an Arc split button (Save as template, with the original PDF, the document and activity
 * behind its chevron) and Send on the right.
 */
export function EditorHeader({
  envelope: e,
  files,
  audit,
  step,
  onStepChange,
  hasFieldOwners,
}: {
  envelope: EnvelopeDetail
  /** Each document's original by envelope document id (ADR 0037). */
  files: Record<string, string | null>
  audit: { events: AuditEventRow[]; verification: ChainVerification } | null
  step: EditorStep
  onStepChange: (step: EditorStep) => void
  hasFieldOwners: boolean
}) {
  const router = useRouter()
  const badge = ENVELOPE_STATUS_BADGE[e.status]
  const [templateOpen, setTemplateOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const recipientNames = Object.fromEntries(e.recipients.map((r) => [r.id, r.name]))

  // The split button's menu: the other envelope actions (Save as template is its main half).
  const actions: SplitButtonAction[] = []
  // One envelope document: its original and library page. Several: they're in the Documents step.
  const only = e.documents.length === 1 ? e.documents[0] : undefined
  const onlyUrl = only ? files[only.id] : null
  if (only && onlyUrl) {
    actions.push({
      label: "Download original",
      icon: <DownloadIcon />,
      onSelect: () => downloadFile(onlyUrl, only.name),
    })
  }
  if (only) {
    actions.push({
      label: "Open document",
      icon: <FileTextIcon />,
      onSelect: () => router.push(`/documents/${only.documentId}`),
    })
  }
  if (audit) {
    actions.push({
      label: "Activity",
      icon: <ActivityIcon />,
      onSelect: () => setActivityOpen(true),
    })
  }

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:grid md:grid-cols-[1fr_auto_1fr] md:px-6">
      {/* Phones: title row, then the buttons (the split button doesn't shrink), then the steps. */}
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full sm:flex-1">
        <Tooltip content="Back to envelopes" side="bottom">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Back to envelopes"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            render={<Link href="/envelopes" />}
          >
            <ArrowLeftIcon aria-hidden />
          </Button>
        </Tooltip>
        <h1 className="truncate font-medium">{e.title}</h1>
        <span className="shrink-0">
          <Badge tone={badge.tone} size="sm">
            {badge.label}
          </Badge>
        </span>
      </div>

      <PillNav
        id="editor-steps"
        label="Steps"
        current="step"
        className="order-last flex w-full justify-center md:order-none md:w-auto"
        items={EDITOR_STEPS.map((s) => ({
          id: s,
          label: EDITOR_STEP_INFO[s].label,
          icon: STEP_ICONS[s],
          active: s === step,
          disabled: !stepEnabled(s, hasFieldOwners),
          hint: stepHint(s, hasFieldOwners),
          onSelect: () => onStepChange(s),
        }))}
      />

      <div className="ml-auto flex shrink-0 items-center gap-2 max-sm:w-full max-sm:justify-end md:ml-0 md:justify-self-end">
        <SplitButton
          variant="secondary"
          label="Save as template"
          icon={<LayoutTemplateIcon />}
          onClick={() => setTemplateOpen(true)}
          actions={actions}
        />
        <SendButton />
      </div>

      <SaveTemplateDialog
        envelopeId={e.id}
        envelopeTitle={e.title}
        recipients={e.recipients}
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onAddRecipients={() => {
          setTemplateOpen(false)
          onStepChange("recipients")
        }}
      />
      {audit && (
        <Drawer open={activityOpen} onOpenChange={setActivityOpen}>
          <DrawerContent
            side="right"
            title="Activity"
            description="The audit trail of this envelope."
          >
            {/* Rendered only while open, in the browser, so `now` can't mismatch. */}
            {activityOpen && (
              <ActivityList
                events={audit.events}
                verification={audit.verification}
                recipientNames={recipientNames}
                now={Date.now()}
              />
            )}
          </DrawerContent>
        </Drawer>
      )}
    </header>
  )
}

/** Saves the original PDF (presigned URL) under the document's name. */
function downloadFile(url: string, name: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.rel = "noopener"
  document.body.append(a)
  a.click()
  a.remove()
}
