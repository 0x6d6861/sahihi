"use client"

import type { ToolCallMessagePartComponent } from "@assistant-ui/react"
import { type DiffPart, diffLines, diffWords, numberSections } from "@sahihi/core"
import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/app/badge"
import { Button } from "@/components/app/button"
import { LocateIcon } from "@/components/app/icons"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { PROPOSAL_STATUS_LABEL, type ProposalView, proposalTitle } from "@/lib/generator"
import { useGenerator } from "./generator-context"

interface ProposeResult {
  ok: boolean
  proposalId?: string
  error?: string
}

/**
 * `propose_section_edit` / `propose_sections` (docs/ai-documents.md → Proposals): the suggested
 * change as a word diff with the assistant's reason, and Accept / Reject. Nothing changes until the
 * person accepts; accepting makes a version, and the editor scrolls to it and highlights it (side
 * by side only: on phones the chat stays). "Show in document" goes to the section it's about.
 */
export const ProposalCard: ToolCallMessagePartComponent<unknown, ProposeResult> = ({ result }) => {
  const { detail, refresh } = useGenerator()
  const view = detail.proposals.find((p) => p.id === result?.proposalId)
  // A proposal made during this visit isn't in the loaded detail yet: fetch it once.
  const fetched = useRef(false)
  useEffect(() => {
    if (result?.ok && !view && !fetched.current) {
      fetched.current = true
      void refresh().catch(() => {})
    }
  }, [result, view, refresh])

  if (!result)
    return <Skeleton className="h-24 w-full rounded-2xl" aria-label="Preparing a suggestion" />
  if (!result.ok) {
    return <p className="text-muted-foreground text-sm">Suggestion held back: {result.error}</p>
  }
  if (!view)
    return <Skeleton className="h-24 w-full rounded-2xl" aria-label="Loading the suggestion" />
  return <Proposal view={view} />
}

function Proposal({ view }: { view: ProposalView }) {
  const { detail, editable, decideProposal, navigate } = useGenerator()
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const content = detail.version.data.content
  const title = proposalTitle(view, content, numberSections(content))
  const pending = view.status === "PENDING"
  const sectionId =
    view.kind !== "set_signers" &&
    view.kind !== "delete_section" &&
    view.sectionId &&
    content.content.some((s) => s.attrs.id === view.sectionId)
      ? view.sectionId
      : null

  const decide = async (action: "accept" | "reject") => {
    setBusy(action)
    setError(null)
    try {
      await decideProposal(view.id, action)
      if (
        action === "accept" &&
        view.kind === "replace_section" &&
        view.sectionId &&
        window.matchMedia("(min-width: 768px)").matches
      ) {
        navigate({ kind: "section", id: view.sectionId, flash: true })
      }
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? (err.message ?? "This suggestion is out of date.")
          : "That didn't work. Try again.",
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-(--radius-panel) border bg-card p-4 leading-[1.45]"
    >
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-sm">{title}</h3>
        <span className="shrink-0">
          <Badge
            size="sm"
            tone={
              view.status === "ACCEPTED"
                ? "success"
                : view.status === "PENDING"
                  ? "info"
                  : "neutral"
            }
          >
            {PROPOSAL_STATUS_LABEL[view.status]}
          </Badge>
        </span>
      </header>
      <p className="text-muted-foreground text-sm">{view.rationale}</p>
      <Diff
        parts={
          // One line per signer or blank: compare whole lines, or the diff reads as noise.
          view.kind === "set_signers" || view.kind === "make_blanks"
            ? diffLines(view.before, view.after)
            : diffWords(view.before, view.after)
        }
      />
      {error && (
        <p className="text-destructive-foreground text-sm" role="alert">
          {error}
        </p>
      )}
      {((pending && editable) || sectionId) && (
        <div className="flex items-center justify-between gap-2">
          {sectionId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ kind: "section", id: sectionId })}
            >
              <LocateIcon aria-hidden />
              Show in document
            </Button>
          ) : (
            <span />
          )}
          {pending && editable && (
            <span className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                loading={busy === "reject"}
                disabled={busy !== null}
                onClick={() => decide("reject")}
              >
                Reject
              </Button>
              <Button
                size="sm"
                loading={busy === "accept"}
                disabled={busy !== null}
                onClick={() => decide("accept")}
              >
                Accept
              </Button>
            </span>
          )}
        </div>
      )}
    </section>
  )
}

/** Removed words struck through, added words highlighted; long unchanged runs stay readable. */
function Diff({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="app-canvas max-h-72 overflow-y-auto whitespace-pre-wrap rounded-2xl px-3 py-2.5 text-sm leading-[1.45]">
      {parts.map((part, i) =>
        part.kind === "same" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff parts have no ids; order is stable
          <span key={i}>{part.text}</span>
        ) : part.kind === "removed" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above
          <del key={i} className="text-destructive-foreground line-through decoration-1">
            {part.text}
          </del>
        ) : (
          <ins
            // biome-ignore lint/suspicious/noArrayIndexKey: as above
            key={i}
            className="rounded-[3px] bg-success/12 px-0.5 text-success-foreground no-underline"
          >
            {part.text}
          </ins>
        ),
      )}
    </p>
  )
}
