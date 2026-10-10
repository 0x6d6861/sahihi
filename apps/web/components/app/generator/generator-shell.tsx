"use client"

import Link from "next/link"
import { useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentViewer } from "@/components/app/document-viewer"
import { ArrowLeftIcon } from "@/components/app/icons"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import type { GeneratorDetail } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { ChatPanel } from "./chat-panel"
import { DocumentEditor } from "./editor/document-editor"
import { FinalizeDialog } from "./finalize-dialog"
import { GeneratorProvider, useGenerator } from "./generator-context"
import { NewVersionAction } from "./new-version"
import { SaveTemplateDialog } from "./save-template-dialog"
import { SignersPanel } from "./signers-panel"

type DocumentTab = "preview" | "editing" | "signers"

/**
 * The AI document generator (docs/ai-documents.md → Web): a full page with its own top bar, the
 * assistant on the left and the document on the right (Preview: the PDF as it will be signed;
 * Editing: the text in a rich-text editor; Signers: who signs). On phones one pane shows at a time; both
 * stay mounted, so switching never drops the conversation.
 */
export function GeneratorShell({ initial }: { initial: GeneratorDetail }) {
  return (
    <GeneratorProvider initial={initial}>
      <Frame />
    </GeneratorProvider>
  )
}

function Frame() {
  const { detail } = useGenerator()
  const [pane, setPane] = useState<"chat" | "document">("chat")
  const [tab, setTab] = useState<DocumentTab>("editing")
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const finalized = detail.document.status === "FINALIZED"
  const blocking = detail.issues.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-2.5 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Tooltip content="Back to AI drafts" side="bottom">
            <IconButton
              variant="ghost"
              size="icon-sm"
              aria-label="Back to AI drafts"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              render={<Link href="/generate" />}
            >
              <ArrowLeftIcon aria-hidden />
            </IconButton>
          </Tooltip>
          <h1 className="truncate font-medium">{detail.version.data.title}</h1>
          <span className="shrink-0">
            <Badge tone={finalized ? "success" : "neutral"} size="sm">
              {finalized ? "Finalised" : `Draft · version ${detail.version.number}`}
            </Badge>
          </span>
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
          <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
            Save as template
          </Button>
          {finalized && <NewVersionAction />}
          {finalized && detail.document.envelopeId ? (
            <ButtonLink variant="primary" href={`/envelopes/${detail.document.envelopeId}`}>
              Open envelope
            </ButtonLink>
          ) : detail.document.canEdit ? (
            <Tooltip
              content={
                blocking
                  ? `${blocking} ${blocking === 1 ? "thing" : "things"} to fix first`
                  : "Create the PDF and a draft envelope"
              }
              side="bottom"
            >
              {/* A disabled button gets no pointer events; the span keeps the tooltip working. */}
              <span>
                <Button disabled={blocking > 0} onClick={() => setFinalizeOpen(true)}>
                  Finalise
                </Button>
              </span>
            </Tooltip>
          ) : null}
        </div>
      </header>

      <div className="shrink-0 border-b px-4 py-2 md:hidden">
        <SegmentedControl
          label="Show"
          value={pane}
          onValueChange={(v) => setPane(v as "chat" | "document")}
          options={[
            { value: "chat", label: "Assistant" },
            { value: "document", label: "Document" },
          ]}
        />
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(20rem,2fr)_3fr]">
        <div
          className={cn(
            "min-h-0 md:flex md:flex-col md:border-r",
            pane === "chat" ? "flex flex-col" : "hidden",
          )}
        >
          <ChatPanel />
        </div>
        <div className={cn("min-h-0 flex-col md:flex", pane === "document" ? "flex" : "hidden")}>
          <div className="shrink-0 px-4 pt-3 md:px-8">
            <SegmentedControl
              label="Document view"
              value={tab}
              onValueChange={(v) => setTab(v as DocumentTab)}
              options={[
                { value: "preview", label: "Preview" },
                { value: "editing", label: "Editing" },
                { value: "signers", label: "Signers" },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "preview" && (
              <div className="h-full p-4 md:px-8">
                <DocumentViewer
                  // A new version is a new URL, so the viewer reloads it.
                  src={`/api/generated-documents/${encodeURIComponent(detail.document.id)}/preview?v=${detail.version.id}`}
                  fileName={`${detail.version.data.title}.pdf`}
                  className="h-full min-h-[60dvh]"
                />
              </div>
            )}
            {/* Kept mounted while hidden: unsaved signer edits survive a tab switch. */}
            <div hidden={tab !== "editing"}>
              <DocumentEditor />
            </div>
            <div hidden={tab !== "signers"}>
              <SignersPanel />
            </div>
          </div>
        </div>
      </div>

      <FinalizeDialog open={finalizeOpen} onOpenChange={setFinalizeOpen} />
      <SaveTemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
    </div>
  )
}
