"use client"

import { AssistantChatTransport, useAISDKChat, useChatRuntime } from "@assistant-ui/ai-sdk"
import {
  ActionBarPrimitive,
  AssistantRuntimeProvider,
  AuiConfig,
  AuiIf,
  ComposerPrimitive,
  defineToolkit,
  MessagePrimitive,
  type TextMessagePartComponent,
  ThreadPrimitive,
  Tools,
  useAui,
  useAuiState,
} from "@assistant-ui/react"
import { lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpIcon, LoaderIcon, StopIcon, XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import {
  chatErrorMessage,
  draftOrigin,
  messageSectionId,
  proposalsToContinueAfter,
  replyParagraphs,
  sectionExcerpt,
  withoutEarlierImages,
} from "@/lib/generator"
import { cn } from "@/lib/utils"
import { AttachButton, PendingFiles, SentFiles, useChatAttachments } from "./chat-attachments"
import { useGenerator } from "./generator-context"
import { ProposalCard } from "./proposal-card"
import { AppliedNote, QuestionCard } from "./question-card"
import { sectionLabel } from "./section-label"

/**
 * The assistant conversation (docs/ai-documents.md → Web), on assistant-ui's headless primitives
 * styled with Arc. The server declares the tools; this registers how they render:
 * `ask_questions` as a question card that supplies its result (human in the loop),
 * `set_variables` as a one-line note, and the proposal tools as a diff to accept or reject. The
 * document text never travels from here: the server reads it, and a selected section travels as
 * its id in the message's metadata (`metadata.custom.selection`), so it shows again on reload.
 */
const toolkit = defineToolkit({
  ask_questions: { type: "backend", render: QuestionCard },
  set_variables: { type: "backend", render: AppliedNote },
  propose_section_edit: { type: "backend", render: ProposalCard },
  propose_sections: { type: "backend", render: ProposalCard },
  define_signers: { type: "backend", render: ProposalCard },
  propose_blanks: { type: "backend", render: ProposalCard },
  propose_title: { type: "backend", render: ProposalCard },
})
const config = AuiConfig({ tools: Tools({ toolkit }) })

export function ChatPanel() {
  const { detail } = useGenerator()
  const id = detail.document.id
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/generated-documents/${encodeURIComponent(id)}/chat`,
        // Images go once, with the message they're attached to (ADR 0050).
        prepareSendMessagesRequest: ({ body, messages, trigger, messageId, requestMetadata }) => ({
          body: {
            ...body,
            id,
            messages: withoutEarlierImages(messages),
            trigger,
            messageId,
            metadata: requestMetadata,
          },
        }),
      }),
    [id],
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
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 md:px-5">
          <ThreadPrimitive.Empty>
            <EmptyState />
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          {/* Sent, and no assistant message yet. */}
          <AuiIf condition={(s) => s.thread.isRunning && s.thread.messages.at(-1)?.role === "user"}>
            <Thinking />
          </AuiIf>
        </ThreadPrimitive.Viewport>
        <Composer />
        <ContinueAfterDecisions />
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

/**
 * Once the person has accepted or rejected every suggestion in the assistant's last reply, the
 * assistant replies on its own: the request carries no new message, so it continues that reply,
 * and the server tells it what was decided (docs/ai-documents.md → Proposals).
 */
function ContinueAfterDecisions() {
  const { detail, decided } = useGenerator()
  const chat = useAISDKChat()
  const running = useAuiState((s) => s.thread.isRunning)
  const last = useAuiState((s) => s.thread.messages.at(-1))
  const continued = useRef(new Set<string>())
  useEffect(() => {
    if (running || !chat) return
    const ids = proposalsToContinueAfter(last, detail.proposals, decided, continued.current)
    if (ids.length === 0) return
    for (const id of ids) continued.current.add(id)
    void chat.sendMessage().catch(() => {})
  }, [running, chat, last, detail.proposals, decided])
  return null
}

/**
 * Before the first message: what the assistant does, and one click to start. A blank document
 * asks for a description instead (the composer is the start); an imported one offers to find its
 * blanks and signers (ADR 0049).
 */
function EmptyState() {
  const { detail, editable } = useGenerator()
  const aui = useAui()
  const title = detail.version.data.title
  const origin = draftOrigin(detail.document.starter)
  if (origin === "blank") {
    return (
      <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-dashed p-5 text-sm">
        <p className="font-medium text-foreground">Describe the document you need</p>
        <p className="text-muted-foreground">
          Say what it's for and who it's between, below. The assistant asks what it still needs and
          suggests sections for you to accept. It only uses what you tell it.
        </p>
      </div>
    )
  }
  if (origin === "import") {
    const sections = detail.version.data.content.content.length
    return (
      <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed p-5">
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium text-foreground">
            Imported {sections} {sections === 1 ? "section" : "sections"} word for word
          </p>
          <p className="text-muted-foreground">
            Check the text against your original. The assistant can suggest which names, dates and
            amounts become blanks, and who signs. Nothing changes until you accept a suggestion.
          </p>
        </div>
        {editable && (
          <div>
            <Button
              size="sm"
              onClick={() =>
                aui.thread().append("Find the blanks and the signers in this document.")
              }
            >
              Find blanks and signers
            </Button>
          </div>
        )}
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed p-5">
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-medium text-foreground">Draft “{title}” with the assistant</p>
        <p className="text-muted-foreground">
          It asks for missing details as questions and fills the document as you answer. It only
          uses what you tell it, and leaves anything you skip visibly blank. Click any section of
          the document to ask about it.
        </p>
      </div>
      {editable && (
        <div>
          <Button size="sm" onClick={() => aui.thread().append(`Help me fill in “${title}”.`)}>
            Start drafting
          </Button>
        </div>
      )}
    </div>
  )
}

/** An assistant reply: paragraphs, with **bold** kept. */
const Text: TextMessagePartComponent = ({ text }) => (
  <div className="flex flex-col gap-2.5 text-sm leading-relaxed">
    {replyParagraphs(text).map((runs, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of one immutable reply
      <p key={i} className="whitespace-pre-wrap">
        {runs.map((run, j) =>
          run.bold ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: runs of one paragraph
            <strong key={j} className="font-semibold">
              {run.text}
            </strong>
          ) : (
            run.text
          ),
        )}
      </p>
    ))}
  </div>
)

const UserText: TextMessagePartComponent = ({ text }) => (
  <p className="whitespace-pre-wrap text-sm">{text}</p>
)

function UserMessage() {
  const { detail } = useGenerator()
  const sectionId = useAuiState((s) => messageSectionId(s.message.metadata))
  const attachments = useAuiState((s) => s.message.attachments ?? [])
  const section = sectionId
    ? detail.version.data.content.content.find((s) => s.attrs.id === sectionId)
    : undefined
  const excerpt = section ? sectionExcerpt(detail.version.data, section.attrs.id) : null
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1.5">
      {section && (
        <div className="max-w-[85%] rounded-lg border border-dashed border-info/30 bg-info/10 px-3 py-1.5 text-muted-foreground text-xs">
          <span className="font-medium text-foreground">
            {sectionLabel(detail.version.data.content, section)}
          </span>
          {excerpt ? ` · ${excerpt.slice(0, 90)}${excerpt.length > 90 ? "…" : ""}` : null}
        </div>
      )}
      <SentFiles attachments={attachments} />
      <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-foreground">
        <MessagePrimitive.Parts components={{ Text: UserText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  // Running with nothing new to show yet: before the first words, or after a tool finished and
  // the assistant carries on (a tool still being written shows its own placeholder).
  const thinking = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false
    const last = s.message.content.at(-1)
    if (!last) return true
    if (last.type === "text") return last.text.trim() === ""
    if (last.type === "tool-call") return last.result !== undefined
    return last.type === "reasoning"
  })
  return (
    <MessagePrimitive.Root className="flex flex-col gap-3 text-foreground">
      <MessagePrimitive.Parts components={{ Text }} />
      {thinking && <Thinking />}
      <MessagePrimitive.Error>
        <ReplyError />
      </MessagePrimitive.Error>
    </MessagePrimitive.Root>
  )
}

/** The assistant is working: shown at once, so a sent message never meets an empty pane. */
function Thinking() {
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-sm" role="status">
      <LoaderIcon aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
      Thinking…
    </p>
  )
}

/**
 * A failed reply: the API's reason (e.g. the plan's assistant replies used up), in place, and a
 * retry that asks for the reply again.
 */
function ReplyError() {
  const error = useAuiState((s) =>
    s.message.status?.type === "incomplete" && s.message.status.reason === "error"
      ? s.message.status.error
      : undefined,
  )
  return (
    <div className="flex flex-col items-start gap-2" role="alert">
      <p className="text-destructive-foreground text-sm">{chatErrorMessage(error)}</p>
      <ActionBarPrimitive.Reload asChild>
        <Button variant="secondary" size="sm">
          Try again
        </Button>
      </ActionBarPrimitive.Reload>
    </div>
  )
}

/**
 * One card: the selected section (if any) on top, the message below, a round send or stop button.
 * The section travels as the message's metadata, never pasted into the text. While a question
 * card waits, the composer stays closed: the card has its own answer field.
 */
function Composer() {
  const { detail, editable, pendingQuestion, selectedSectionId, setSelectedSectionId } =
    useGenerator()
  const aui = useAui()
  const running = useAuiState((s) => s.thread.isRunning)
  const empty = useAuiState((s) => s.composer.text.trim().length === 0)
  const files = useChatAttachments(detail.document.id)
  const [dragging, setDragging] = useState(false)
  if (!editable) {
    return (
      <p className="shrink-0 border-t px-4 py-3 text-muted-foreground text-sm md:px-5">
        {detail.document.status === "FINALIZED"
          ? "This document is finalised. The conversation is kept for reference."
          : "Only its creator, an admin or the owner can change this document."}
      </p>
    )
  }
  if (pendingQuestion) {
    return (
      <p className="shrink-0 border-t px-4 py-3 text-muted-foreground text-sm md:px-5">
        Answer or dismiss the questions above to keep chatting.
      </p>
    )
  }
  const section = detail.version.data.content.content.find((s) => s.attrs.id === selectedSectionId)
  const excerpt = section ? sectionExcerpt(detail.version.data, section.attrs.id) : null

  // Files still being read hold the message back; a message can be just files.
  const canSend = (!empty || files.ready.length > 0) && !files.reading
  const send = () => {
    const text = aui.composer().getState().text.trim()
    if (!canSend || running) return
    aui.thread().append({
      role: "user",
      content: [
        {
          type: "text",
          text: text || (files.ready.length === 1 ? "Here's a file." : "Here are some files."),
        },
      ],
      attachments: files.ready,
      metadata: { custom: section ? { selection: { sectionId: section.attrs.id } } : {} },
    })
    aui.composer().setText("")
    files.clear()
    setSelectedSectionId(null)
  }

  return (
    <div className="shrink-0 border-t p-3">
      {/* Files can also be dropped on the card or pasted into the message. */}
      <fieldset
        aria-label="New message"
        className={cn(
          "min-w-0 overflow-hidden rounded-2xl border bg-card transition-colors focus-within:border-foreground/30",
          dragging && "border-info bg-info/5",
        )}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          setDragging(false)
          files.add(e.dataTransfer.files)
        }}
      >
        <PendingFiles files={files.files} onRemove={files.remove} />
        {section && (
          <div className="flex items-start gap-2 border-b bg-info/10 py-2.5 pr-2 pl-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-wider">
                Selected section · {sectionLabel(detail.version.data.content, section)}
              </p>
              {excerpt && (
                <p className="mt-0.5 line-clamp-2 text-foreground/80 text-xs">{excerpt}</p>
              )}
            </div>
            <Tooltip content="Remove section">
              <IconButton
                variant="ghost"
                size="icon-sm"
                aria-label="Remove selected section"
                onClick={() => setSelectedSectionId(null)}
              >
                <XIcon aria-hidden />
              </IconButton>
            </Tooltip>
          </div>
        )}
        <ComposerPrimitive.Input
          submitMode="none"
          rows={2}
          // A blank document starts with the person's description.
          autoFocus={draftOrigin(detail.document.starter) === "blank"}
          aria-label="Message the assistant"
          placeholder={section ? "Ask about this section…" : "Message the assistant…"}
          className="block w-full resize-none bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-muted-foreground"
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault()
              files.add(e.clipboardData.files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex items-center justify-between px-2.5 pb-2.5">
          <AttachButton disabled={files.full} onFiles={files.add} />
          {running ? (
            <Tooltip content="Stop">
              <IconButton
                size="icon-sm"
                className="rounded-full"
                aria-label="Stop"
                onClick={() => aui.thread().cancelRun()}
              >
                <StopIcon aria-hidden />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip content="Send">
              <IconButton
                size="icon-sm"
                className="rounded-full"
                aria-label="Send"
                disabled={!canSend}
                onClick={send}
              >
                <ArrowUpIcon aria-hidden />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </fieldset>
    </div>
  )
}
