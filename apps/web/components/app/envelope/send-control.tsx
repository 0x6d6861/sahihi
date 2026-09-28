"use client"

import type { PreflightIssue } from "@sahihi/core"
import { SendIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { useDraftState } from "./draft-state"
import { type EnvelopeTab, useEnvelopeTab } from "./envelope-tabs"

type Problem = { message: string; tab?: EnvelopeTab }

/** Which tab fixes an issue. */
const FIX_TAB: Record<PreflightIssue["code"], EnvelopeTab | undefined> = {
  no_signers: "recipients",
  missing_signature_field: "document",
  missing_phone: "recipients",
  expiry_in_past: undefined,
}

const toProblems = (issues: PreflightIssue[]): Problem[] =>
  issues.map((i) => ({ message: i.message, tab: FIX_TAB[i.code] }))

/**
 * Header row with the Send button for DRAFT envelopes. Clicking Send settles the editors (flushes
 * the field autosave), asks the API for preflight issues and lists them inline. Only a clean
 * preflight opens the confirmation.
 */
export function SendControl({
  envelopeId,
  recipientCount,
  defaultTab,
  children,
}: {
  envelopeId: string
  /** Recipients who will be emailed (everyone, including viewers). */
  recipientCount: number
  defaultTab: EnvelopeTab
  children: React.ReactNode
}) {
  const router = useRouter()
  const draft = useDraftState()
  const [, setTab] = useEnvelopeTab(defaultTab)
  const [problems, setProblems] = useState<Problem[]>([])
  const [checking, setChecking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)

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
      setProblems(toProblems(issues))
      if (issues.length === 0) setConfirmOpen(true)
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

  async function send() {
    setSending(true)
    try {
      const { notified } = await api<{ notified: number }>(`/envelopes/${envelopeId}/send`, {
        method: "POST",
      })
      setConfirmOpen(false)
      toastManager.add({
        title: "Envelope sent",
        description: `${notified} ${notified === 1 ? "invitation" : "invitations"} on the way.`,
        type: "success",
      })
      router.refresh()
    } catch (err) {
      setConfirmOpen(false)
      const issues =
        (err instanceof ApiError && (err.body as { issues?: PreflightIssue[] })?.issues) || []
      if (issues.length > 0) setProblems(toProblems(issues))
      else
        toastManager.add({
          title: "Could not send",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {children}
        <Button onClick={check} disabled={checking || sending}>
          {checking ? <Spinner aria-hidden /> : <SendIcon aria-hidden />}
          Send
        </Button>
      </div>

      {problems.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Before you can send</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {problems.map((p) => (
                <li key={p.message} className="flex flex-wrap items-center gap-2">
                  <span>{p.message}</span>
                  {p.tab && (
                    <Button
                      variant="link"
                      size="xs"
                      className="h-auto p-0"
                      onClick={() => setTab(p.tab as EnvelopeTab)}
                    >
                      Fix
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !sending && setConfirmOpen(o)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Send for signature?</AlertDialogTitle>
            <AlertDialogDescription>
              {recipientCount} {recipientCount === 1 ? "recipient" : "recipients"} will be emailed
              as their turn comes. After sending, recipients and fields can't be changed; you can
              still remind or void.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" disabled={sending} />}>
              Cancel
            </AlertDialogClose>
            <Button onClick={send} disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
