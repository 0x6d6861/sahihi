"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/app/badge"
import {
  ActivityList,
  type AuditEventRow,
  type ChainVerification,
} from "@/components/app/envelope/activity-list"
import {
  ActivityIcon,
  ArrowLeftIcon,
  CheckIcon,
  DownloadIcon,
  EllipsisIcon,
  FileTextIcon,
  LayoutTemplateIcon,
} from "@/components/app/icons"
import { SaveTemplateDialog } from "@/components/app/templates/save-template-dialog"
import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
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
  stepNumber,
} from "@/lib/envelope-editor"
import { cn } from "@/lib/utils"
import { SendButton } from "./send-context"

/**
 * The draft editor's own top bar (ADR 0031; the app shell hides its bar on this page): the way
 * back, title and status on the left; the numbered steps in the middle (a check on the ones
 * behind; their own row below `md`); More (save as template, the original PDF, the document,
 * activity) and Send on the right.
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

  // More: the envelope actions besides sending.
  const actions: DropdownItem[] = [
    {
      label: "Save as template",
      icon: <LayoutTemplateIcon />,
      onSelect: () => setTemplateOpen(true),
    },
  ]
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
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:grid md:min-h-[60px] md:grid-cols-[1fr_auto_1fr] md:py-0">
      {/* Phones: title row, then the buttons, then the steps. */}
      <div className="flex min-w-0 items-center gap-3 max-sm:w-full sm:flex-1">
        <Tooltip content="Back to all files" side="bottom">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Back to all files"
            className="shrink-0 rounded-2xl border-border shadow-none before:rounded-[calc(var(--radius-2xl)-1px)]"
            render={<Link href="/files" />}
          >
            <ArrowLeftIcon aria-hidden />
          </Button>
        </Tooltip>
        <h1 className="truncate font-medium text-base tracking-tight">{e.title}</h1>
        <span className="shrink-0">
          <Badge tone={badge.tone} size="sm">
            {badge.label}
          </Badge>
        </span>
      </div>

      <StepNav
        className="order-last w-full md:order-none md:w-auto"
        step={step}
        hasFieldOwners={hasFieldOwners}
        onStepChange={onStepChange}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-end md:ml-0 md:justify-self-end">
        <DropdownMenu label="More" iconOnly icon={<EllipsisIcon />} items={actions} />
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

/**
 * The four steps, numbered and joined by a line. The current one sits on an emerald tint; the
 * ones behind it show a check. A step that needs a signer first is disabled, its hint saying so.
 */
function StepNav({
  step,
  hasFieldOwners,
  onStepChange,
  className,
}: {
  step: EditorStep
  hasFieldOwners: boolean
  onStepChange: (step: EditorStep) => void
  className?: string
}) {
  const current = stepNumber(step)
  return (
    <nav aria-label="Steps" className={cn("overflow-x-auto [scrollbar-width:none]", className)}>
      <ol className="flex items-center justify-center gap-2.5">
        {EDITOR_STEPS.map((s, i) => {
          const n = i + 1
          const active = s === step
          const done = n < current
          const enabled = stepEnabled(s, hasFieldOwners)
          return (
            <li key={s} className="flex shrink-0 items-center gap-2.5">
              {i > 0 && <span aria-hidden className="h-px w-7 bg-border max-lg:w-3" />}
              <Tooltip content={stepHint(s, hasFieldOwners)} side="bottom">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  aria-disabled={!enabled || undefined}
                  onClick={() => enabled && onStepChange(s)}
                  className={cn(
                    "press flex h-[34px] items-center gap-2 rounded-2xl px-2.5 font-medium text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/12 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                    !enabled && "cursor-not-allowed opacity-50 hover:text-muted-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[22px] shrink-0 items-center justify-center rounded-full text-xs",
                      done
                        ? "bg-primary text-primary-foreground"
                        : active
                          ? "border-2 border-primary text-primary"
                          : "border border-input",
                    )}
                  >
                    {done ? <CheckIcon className="size-3.5" strokeWidth={2.5} /> : n}
                  </span>
                  <span className="max-sm:sr-only">{EDITOR_STEP_INFO[s].label}</span>
                </button>
              </Tooltip>
            </li>
          )
        })}
      </ol>
    </nav>
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
