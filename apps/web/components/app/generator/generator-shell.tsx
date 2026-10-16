"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/app/badge"
import { Button } from "@/components/app/button"
import { DocumentViewer } from "@/components/app/document-viewer"
import { ArrowLeftIcon, CircleCheckIcon, CircleDashedIcon } from "@/components/app/icons"
import { SplitButton } from "@/components/app/split-button"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { blanksStatus, type GeneratorDetail, nextOpenBlank } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { ChatPanel } from "./chat-panel"
import { DocumentEditor } from "./editor/document-editor"
import { FinalizeDialog } from "./finalize-dialog"
import { type DocumentTab, GeneratorProvider, type Pane, useGenerator } from "./generator-context"
import { NewVersionAction } from "./new-version"
import { SaveTemplateDialog } from "./save-template-dialog"
import { sectionLabel } from "./section-label"
import { SignersPanel } from "./signers-panel"

/**
 * The AI document generator (docs/ai-documents.md → Web): a full page with its own top bar, the
 * assistant on the left and the document on the right. Preview: the document on paper, read-only,
 * a click on a section attaches it to the next message; Editing: the same document in the
 * rich-text editor; Signers: who signs; PDF: the file as it will be signed. On phones one pane
 * shows at a time; both stay mounted, so switching never drops the conversation.
 */
export function GeneratorShell({ initial }: { initial: GeneratorDetail }) {
  return (
    <GeneratorProvider initial={initial}>
      <Frame />
    </GeneratorProvider>
  )
}

function Frame() {
  const router = useRouter()
  const { detail, tab, setTab, pane, setPane, nav, navigate, flushAll } = useGenerator()
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const finalized = detail.document.status === "FINALIZED"
  const blanks = blanksStatus(detail.issues)
  // The pill steps through the open blanks, starting after the last one it (or a list) jumped to.
  const lastBlank = nav?.target.kind === "blank" ? nav.target.key : undefined
  const nextBlank = nextOpenBlank(detail.version.data, lastBlank)

  // Pending edits first, so the checks (and the PDF) are about what's on screen.
  const openFinalize = async () => {
    setPreparing(true)
    try {
      setSaveFailed(!(await flushAll()))
      setFinalizeOpen(true)
    } finally {
      setPreparing(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:py-0">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Tooltip content="Back to Drafting" side="bottom">
            <IconButton
              variant="outline"
              size="icon-lg"
              aria-label="Back to Drafting"
              className="shrink-0 rounded-2xl border-border shadow-none before:rounded-[calc(var(--radius-2xl)-1px)]"
              render={<Link href="/generate" />}
            >
              <ArrowLeftIcon aria-hidden />
            </IconButton>
          </Tooltip>
          <h1 className="truncate font-medium text-base tracking-tight">
            {detail.version.data.title}
          </h1>
          {finalized ? (
            <span className="shrink-0">
              <Badge tone="success" size="sm">
                Finalised
              </Badge>
            </span>
          ) : (
            <span className="shrink-0 text-muted-foreground text-sm">
              Version {detail.version.number}
            </span>
          )}
          {detail.document.previousId && (
            <Link
              href={`/generate/${encodeURIComponent(detail.document.previousId)}`}
              className="shrink-0 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline max-sm:hidden"
            >
              Replaces a finalised version
            </Link>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {finalized && <NewVersionAction />}
          {/* The page's main action, with Save as template beside it in the split menu. */}
          {finalized && detail.document.envelopeId ? (
            <SplitButton
              label="Open envelope"
              onClick={() => router.push(`/envelopes/${detail.document.envelopeId}`)}
              actions={[{ label: "Save as template", onSelect: () => setTemplateOpen(true) }]}
            />
          ) : detail.document.canEdit && !finalized ? (
            // Never disabled for problems: the dialog lists them with links to fix each. While
            // pending edits save first, the label says so.
            <SplitButton
              label={preparing ? "Saving…" : "Finalise"}
              disabled={preparing}
              onClick={() => void openFinalize()}
              actions={[{ label: "Save as template", onSelect: () => setTemplateOpen(true) }]}
            />
          ) : (
            <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
              Save as template
            </Button>
          )}
        </div>
      </header>

      <div className="shrink-0 border-b px-4 py-2 md:hidden">
        <SegmentedControl
          label="Show"
          value={pane}
          onValueChange={(v) => setPane(v as Pane)}
          options={[
            { value: "chat", label: "Assistant" },
            { value: "document", label: "Document" },
          ]}
        />
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(20rem,2fr)_3fr] xl:grid-cols-[440px_1fr]">
        <div
          className={cn(
            "min-h-0 bg-background md:flex md:flex-col md:border-r",
            pane === "chat" ? "flex flex-col" : "hidden",
          )}
        >
          <ChatPanel />
        </div>
        <div
          className={cn(
            "min-h-0 flex-col bg-muted md:flex",
            pane === "document" ? "flex" : "hidden",
          )}
        >
          <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 px-4 py-2.5 md:px-5">
            <SegmentedControl
              label="Document view"
              value={tab}
              onValueChange={(v) => setTab(v as DocumentTab)}
              options={[
                { value: "preview", label: "Preview" },
                { value: "editing", label: "Editing" },
                { value: "signers", label: "Signers" },
                { value: "pdf", label: "PDF" },
              ]}
            />
            <span className="ml-auto">
              {nextBlank ? (
                <Tooltip content="Go to the next open blank" side="bottom">
                  <button
                    type="button"
                    className="press rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => navigate({ kind: "blank", key: nextBlank })}
                  >
                    <BlanksPill open={blanks.open} label={blanks.label} />
                  </button>
                </Tooltip>
              ) : (
                <BlanksPill open={blanks.open} label={blanks.label} />
              )}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "pdf" && (
              <div className="h-full p-4 md:px-8">
                <DocumentViewer
                  // A new version is a new URL, so the viewer reloads it.
                  src={`/api/generated-documents/${encodeURIComponent(detail.document.id)}/preview?v=${detail.version.id}`}
                  fileName={`${detail.version.data.title}.pdf`}
                  className="h-full min-h-[60dvh]"
                />
              </div>
            )}
            {/* One editor for Preview and Editing, kept mounted: switching keeps unsaved edits. */}
            <div hidden={tab !== "preview" && tab !== "editing"}>
              <DocumentEditor mode={tab === "editing" ? "editing" : "preview"} />
            </div>
            {/* Kept mounted while hidden: unsaved signer edits survive a tab switch. */}
            <div hidden={tab !== "signers"}>
              <SignersPanel />
            </div>
          </div>
          <AskAboutSelection />
        </div>
      </div>

      <FinalizeDialog open={finalizeOpen} onOpenChange={setFinalizeOpen} saveFailed={saveFailed} />
      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </div>
  )
}

/** How many blanks are open: amber with a dashed ring while any are, green once all are filled. */
function BlanksPill({ open, label }: { open: number; label: string }) {
  const Icon = open > 0 ? CircleDashedIcon : CircleCheckIcon
  return (
    <span
      className={cn(
        "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-2.5 font-medium text-xs",
        open > 0
          ? "border-warning/40 bg-warning/8 text-warning-foreground"
          : "border-success/40 bg-success/8 text-success-foreground",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}

/**
 * Phones show one pane at a time, so a section picked in the document would wait out of sight:
 * this bar names it and switches to the assistant.
 */
function AskAboutSelection() {
  const { detail, selectedSectionId, setPane, tab } = useGenerator()
  const content = detail.version.data.content
  const section = content.content.find((s) => s.attrs.id === selectedSectionId)
  if (!section || tab !== "preview") return null
  return (
    <div className="flex shrink-0 items-center gap-3 border-t bg-background px-4 py-2.5 md:hidden">
      <span className="min-w-0 flex-1 truncate text-sm">{sectionLabel(content, section)}</span>
      <Button size="sm" onClick={() => setPane("chat")}>
        Ask about it
      </Button>
    </div>
  )
}
