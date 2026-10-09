"use client"

import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk"
import {
  AssistantRuntimeProvider,
  AuiConfig,
  ComposerPrimitive,
  defineToolkit,
  MessagePrimitive,
  type TextMessagePartComponent,
  ThreadPrimitive,
  Tools,
} from "@assistant-ui/react"
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"
import { useMemo } from "react"
import { SendIcon, XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { useGenerator } from "./generator-context"
import { ProposalCard } from "./proposal-card"
import { AppliedNote, QuestionCard } from "./question-card"
import { sectionLabel } from "./section-label"

/**
 * The assistant conversation (docs/ai-documents.md → Web), on assistant-ui's headless primitives
 * styled with Arc. The server declares the tools; this registers how they render:
 * `ask_questions` as a question card that supplies its result (human in the loop),
 * `set_variables` as a one-line note, and the two proposal tools as a diff to accept or reject. The document text never travels from here: the server reads
 * it, and a selected section is sent as its id.
 */
const toolkit = defineToolkit({
  ask_questions: { type: "backend", render: QuestionCard },
  set_variables: { type: "backend", render: AppliedNote },
  propose_section_edit: { type: "backend", render: ProposalCard },
  propose_sections: { type: "backend", render: ProposalCard },
})
const config = AuiConfig({ tools: Tools({ toolkit }) })

export function ChatPanel() {
  const { detail, takeSelection } = useGenerator()
  const id = detail.document.id
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/generated-documents/${encodeURIComponent(id)}/chat`,
        // The chip travels with one request, then clears.
        body: () => {
          const sectionId = takeSelection()
          return { selection: sectionId ? { sectionId } : null }
        },
      }),
    [id, takeSelection],
  )
  const runtime = useChatRuntime({
    id,
    messages: detail.messages as UIMessage[],
    transport,
    // After a question card supplies its answers, the assistant continues on its own.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  })

  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 md:px-6">
          <ThreadPrimitive.Empty>
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium text-foreground">Fill in “{detail.version.data.title}”</p>
              <p className="text-muted-foreground">
                Say what the agreement is about, or ask the assistant to start asking questions. It
                only uses what you tell it, and leaves anything you skip visibly blank.
              </p>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <Composer />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

const Text: TextMessagePartComponent = ({ text }) => (
  <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
)

function UserMessage() {
  return (
    <MessagePrimitive.Root className="ml-auto max-w-[85%] rounded-2xl bg-muted px-3.5 py-2.5 text-foreground">
      <MessagePrimitive.Parts components={{ Text }} />
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-3 text-foreground">
      <MessagePrimitive.Parts components={{ Text }} />
    </MessagePrimitive.Root>
  )
}

function Composer() {
  const { detail, editable, pendingQuestion, selectedSectionId, setSelectedSectionId } =
    useGenerator()
  if (!editable) {
    return (
      <p className="shrink-0 border-t px-4 py-3 text-muted-foreground text-sm md:px-6">
        {detail.document.status === "FINALIZED"
          ? "This document is finalised. The conversation is kept for reference."
          : "Only its creator, an admin or the owner can change this document."}
      </p>
    )
  }
  // One input at a time: a pending question card has its own answer field.
  if (pendingQuestion) {
    return (
      <p className="shrink-0 border-t px-4 py-3 text-muted-foreground text-sm md:px-6">
        Answer or dismiss the questions above to keep chatting.
      </p>
    )
  }
  const section = detail.version.data.content.content.find((s) => s.attrs.id === selectedSectionId)
  return (
    <ComposerPrimitive.Root className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 md:px-6">
      {section && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/50 py-1 pr-1 pl-3 text-sm">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">Selected section: </span>
            {sectionLabel(detail.version.data.content, section)}
          </span>
          <Tooltip content="Remove section">
            <IconButton
              variant="ghost"
              size="icon-sm"
              aria-label="Remove section"
              onClick={() => setSelectedSectionId(null)}
            >
              <XIcon aria-hidden />
            </IconButton>
          </Tooltip>
        </div>
      )}
      <ComposerPrimitive.Input asChild submitMode="enter">
        <Textarea label="Message the assistant" rows={2} />
      </ComposerPrimitive.Input>
      <div className="flex justify-end">
        <ComposerPrimitive.Send asChild>
          <Button size="sm">
            <SendIcon aria-hidden />
            Send
          </Button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  )
}
