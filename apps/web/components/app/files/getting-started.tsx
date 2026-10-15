"use client"

import type { GettingStartedStep } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { UploadDocument } from "@/app/(app)/documents/upload-document"
import { Button } from "@/components/app/button"
import { ButtonLink } from "@/components/app/button-link"
import { CheckIcon, PlusIcon, SparklesIcon, UserPlusIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Progress } from "@/components/arc/progress/progress"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface GettingStartedData {
  steps: { step: GettingStartedStep; done: boolean }[]
  done: number
  total: number
  complete: boolean
  dismissed: boolean
  workspaceName: string
  canInvite: boolean
}

const COPY: Record<GettingStartedStep, { title: string; detail: string }> = {
  workspace: { title: "Set up your workspace", detail: "" },
  team: { title: "Invite your team", detail: "Send and sign together. Pending invitations count." },
  upload: { title: "Upload a document", detail: "A PDF, or a Word file that's converted to PDF." },
  send: {
    title: "Send your first envelope",
    detail: "Add recipients, place their fields, send. Signers don't need an account.",
  },
  draft: {
    title: "Draft from a starter",
    detail:
      "Mutual NDA, offer letter, IT acceptable use policy, board resolution or invoice cover letter.",
  },
}

/**
 * The Get started checklist at the top of All files (ADR 0061): the workspace's first steps, each
 * ticked by what exists (GET /api/getting-started), with the action for the ones left. "Hide"
 * stores the choice for this member; finishing every step hides it for good.
 */
export function GettingStarted({ data }: { data: GettingStartedData }) {
  const { workspaceName, canInvite } = data
  const router = useRouter()
  const [hiding, setHiding] = useState(false)

  async function hide() {
    setHiding(true)
    try {
      await api("/getting-started", { method: "PUT", json: { dismissed: true } })
      router.refresh()
    } catch {
      setHiding(false)
      toastManager.add({ title: "Couldn't hide the checklist", type: "error" })
    }
  }

  const action: Partial<Record<GettingStartedStep, React.ReactNode>> = {
    team: canInvite ? (
      <ButtonLink href="/settings/members" size="sm">
        <UserPlusIcon aria-hidden />
        Invite
      </ButtonLink>
    ) : null,
    upload: <UploadDocument variant="secondary" />,
    send: (
      <ButtonLink href="/envelopes/new" size="sm">
        <PlusIcon aria-hidden />
        New envelope
      </ButtonLink>
    ),
    draft: (
      <ButtonLink href="/generate" size="sm">
        <SparklesIcon aria-hidden />
        Open Drafting
      </ButtonLink>
    ),
  }

  return (
    <section aria-labelledby="getting-started" className="rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="getting-started" className="font-medium">
            Get started
          </h2>
          <span className="text-muted-foreground text-sm tabular-nums">
            {data.done} of {data.total} done
          </span>
        </div>
        <div className="w-32">
          <Progress value={data.done} max={data.total} aria-label="Setup progress" />
        </div>
        <Button variant="ghost" size="sm" loading={hiding} onClick={hide}>
          Hide
        </Button>
      </header>
      <ol className="divide-y">
        {data.steps.map(({ step, done }) => (
          <li key={step} className="flex items-center gap-3.5 px-5 py-3.5">
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border",
                done ? "border-primary bg-primary text-primary-foreground" : "border-input",
              )}
            >
              {done && <CheckIcon aria-label="Done" className="size-3" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className={cn("text-sm", done ? "text-muted-foreground" : "font-medium")}>
                {COPY[step].title}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {step === "workspace" ? workspaceName : COPY[step].detail}
              </span>
            </div>
            {!done && <div className="shrink-0">{action[step]}</div>}
          </li>
        ))}
      </ol>
    </section>
  )
}
