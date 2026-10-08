"use client"

import type { PreflightIssue } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { createContext, useContext, useState } from "react"
import { useDraftState } from "@/components/app/envelope/draft-state"
import { ReviewSendDialog } from "@/components/app/envelope/review-send-dialog"
import { SendIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { ApiError, api } from "@/lib/api"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { type EditorStep, FIX_STEP, splitPreflight } from "@/lib/envelope-editor"
import {
  buildEnvelopeDetailsInput,
  detailsFromEnvelope,
  type EnvelopeDetails,
  type FormErrors,
  issuesToFormErrors,
} from "@/lib/envelope-form"

type Problem = { message: string; step?: EditorStep }

const toProblems = (issues: PreflightIssue[]): Problem[] =>
  issues.map((i) => ({ message: i.message, step: FIX_STEP[i.code] }))

interface SendState {
  /** Settle the editors, run preflight; a clean result opens "Review & send". */
  check: () => Promise<void>
  busy: boolean
  problems: Problem[]
  onFix: (step: EditorStep) => void
}

const SendContext = createContext<SendState | null>(null)

function useSend(): SendState {
  const ctx = useContext(SendContext)
  if (!ctx) throw new Error("useSend must be used inside <SendProvider>")
  return ctx
}

/**
 * Sending a DRAFT from the draft editor. Send (top bar or quick action) first settles the editors
 * (flushes the field autosave), asks the API for preflight issues and lists them in
 * `SendProblems`, each with a Fix that opens the step that fixes it. Only a clean preflight opens
 * "Review & send": title, message, signing order and expiry, saved with
 * `PUT …/details` before sending, or on their own with "Save changes". After sending, the sender
 * lands on the read-only envelope page.
 */
export function SendProvider({
  envelope,
  onFix,
  children,
}: {
  envelope: Pick<EnvelopeDetail, "id" | "title" | "message" | "signingOrder" | "expiresAt">
  onFix: (step: EditorStep) => void
  children: React.ReactNode
}) {
  const envelopeId = envelope.id
  const router = useRouter()
  const draft = useDraftState()
  const [problems, setProblems] = useState<Problem[]>([])
  const [checking, setChecking] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [details, setDetails] = useState<EnvelopeDetails>(() => detailsFromEnvelope(envelope))
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState<"send" | "draft" | null>(null)

  async function check() {
    setChecking(true)
    try {
      const blocking = (await draft?.settle()) ?? []
      if (blocking.length > 0) {
        setProblems(blocking.map((message) => ({ message })))
        return
      }
      const { issues } = await api<{ issues: PreflightIssue[] }>(
        `/envelopes/${envelopeId}/preflight`,
      )
      const { inDialog, blocking: editorIssues } = splitPreflight(issues)
      setProblems(toProblems(editorIssues))
      if (editorIssues.length === 0) {
        // Start from what's saved; edits abandoned with Back last time are dropped. Issues fixed
        // in the dialog itself (a past expiry) show on their field.
        setDetails(detailsFromEnvelope(envelope))
        setErrors(inDialog)
        setReviewOpen(true)
      }
    } catch (err) {
      toastManager.add({
        title: "Could not check the envelope",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setChecking(false)
    }
  }

  /** Validate and save the dialog's details; false leaves the errors on the dialog. */
  async function saveDetails(): Promise<boolean> {
    const built = buildEnvelopeDetailsInput(details)
    if (!built.ok) {
      setErrors(built.errors)
      return false
    }
    setErrors({})
    try {
      await api(`/envelopes/${envelopeId}/details`, { method: "PUT", json: built.input })
      return true
    } catch (err) {
      if (err instanceof ApiError && err.body?.issues?.length) {
        setErrors(issuesToFormErrors(err.body.issues))
      } else {
        toastManager.add({
          title: "Could not save the envelope details",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
      }
      return false
    }
  }

  async function save() {
    setPending("draft")
    const ok = await saveDetails()
    setPending(null)
    if (!ok) return
    setReviewOpen(false)
    toastManager.add({ title: "Changes saved", description: details.title, type: "success" })
    router.refresh()
  }

  async function send() {
    setPending("send")
    if (!(await saveDetails())) {
      setPending(null)
      return
    }
    try {
      const { notified } = await api<{ notified: number }>(`/envelopes/${envelopeId}/send`, {
        method: "POST",
      })
      setReviewOpen(false)
      toastManager.add({
        title: "Envelope sent",
        description: `${notified} ${notified === 1 ? "invitation" : "invitations"} on the way.`,
        type: "success",
      })
      router.replace(`/envelopes/${envelopeId}`)
    } catch (err) {
      setReviewOpen(false)
      setPending(null)
      // The details are saved; show them on the page.
      router.refresh()
      const issues =
        (err instanceof ApiError && (err.body as { issues?: PreflightIssue[] })?.issues) || []
      const { inDialog, blocking: editorIssues } = splitPreflight(issues)
      if (Object.keys(inDialog).length > 0 && editorIssues.length === 0) {
        // Still fixable in the dialog: reopen it with the error on the field.
        setErrors(inDialog)
        setReviewOpen(true)
      } else if (issues.length > 0) setProblems(toProblems(issues))
      // Plan limit reached (docs/billing.md): keep the explanation on screen, not in a toast.
      else if (err instanceof ApiError && err.status === 402)
        setProblems([{ message: err.message }])
      else
        toastManager.add({
          title: "Could not send",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
    }
  }

  const value = { check, busy: checking || pending !== null, problems, onFix }

  return (
    <SendContext.Provider value={value}>
      {children}
      <ReviewSendDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        details={details}
        onDetailsChange={(patch) => setDetails((d) => ({ ...d, ...patch }))}
        errors={errors}
        issues={[]}
        pending={pending}
        onSend={() => void send()}
        onSaveDraft={() => void save()}
        description="Each recipient gets an email with this message and their own signing link. After sending, recipients and fields can't be changed; you can still remind or void."
      />
    </SendContext.Provider>
  )
}

/** The top bar's Send button. */
export function SendButton() {
  const { check, busy } = useSend()
  return (
    <Button size="sm" onClick={() => void check()} loading={busy}>
      <SendIcon aria-hidden />
      Send
    </Button>
  )
}

/** Preflight problems, each with a Fix that opens the step that fixes it. */
export function SendProblems() {
  const { problems, onFix } = useSend()
  if (problems.length === 0) return null
  return (
    <Alert tone="warning" title="Before you can send">
      <ul className="flex flex-col gap-1">
        {problems.map((p) => (
          <li key={p.message} className="flex flex-wrap items-center gap-2">
            <span>{p.message}</span>
            {p.step && (
              <Button variant="ghost" size="sm" onClick={() => onFix(p.step as EditorStep)}>
                Fix
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Alert>
  )
}
