"use client"

import type { FieldType, VerificationMethod } from "@sahihi/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/app/button"
import { DownloadRows } from "@/components/app/downloads/download-buttons"
import {
  BadgeCheckIcon,
  BanIcon,
  CheckIcon,
  CircleXIcon,
  ClockAlertIcon,
  ClockIcon,
  UnlinkIcon,
} from "@/components/app/icons"
import { AccountInvite } from "@/components/app/signing/account-invite"
import { SignHeader, StatusCard, type StatusTone } from "@/components/app/signing/sign-shell"
import { SigningSurface } from "@/components/app/signing/signing-surface"
import { Alert } from "@/components/arc/alert/alert"
import { OtpInput } from "@/components/arc/otp-input/otp-input"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { ApiError, api } from "@/lib/api"
import { formatCountdown } from "@/lib/countdown"
import { embedEventFor, postEmbedEvent } from "@/lib/embed"

type State = "ready" | "waiting" | "signed" | "completed" | "declined" | "expired" | "closed"

interface SigningSession {
  state: State
  requiresVerification: boolean
  envelope: {
    title: string
    message: string | null
    organization: { name: string }
    sender: { name: string }
  }
  recipient: {
    name: string
    /** Only present once verified. */
    email: string | null
    verification: VerificationMethod
    maskedEmail: string
    maskedPhone: string | null
  }
  /** In signing order (ADR 0037). */
  documents: {
    id: string
    name: string
    pageCount: number | null
    pages: { rotation: number }[] | null
  }[]
  /** Supporting files, once the signer is verified (ADR 0037). */
  attachments: { id: string; name: string; contentType: string; sizeBytes: number }[]
  fields: {
    id: string
    envelopeDocumentId: string
    type: FieldType
    page: number
    x: number
    y: number
    width: number
    height: number
    required: boolean
    label: string | null
  }[]
  downloadsAvailable: boolean
  certificateCode: string | null
  /** Embedded recipients (docs/embedded-signing.md): the origins to post events to. */
  embed: { origins: string[] } | null
}

const MESSAGES: Record<
  Exclude<State, "ready">,
  { title: string; body: string; icon: StatusIcon; tone: StatusTone }
> = {
  waiting: {
    title: "Not your turn yet",
    body: "You'll get an email when it's your turn to sign.",
    icon: ClockIcon,
    tone: "primary",
  },
  signed: {
    title: "Thanks, you've signed",
    body: "We'll email you the final document once everyone has signed.",
    icon: CheckIcon,
    tone: "success",
  },
  completed: {
    title: "All parties have signed",
    body: "Download the signed document and certificate below.",
    icon: BadgeCheckIcon,
    tone: "success",
  },
  declined: {
    title: "Signing declined",
    body: "This envelope was declined and can no longer be signed.",
    icon: CircleXIcon,
    tone: "danger",
  },
  expired: {
    title: "This link has expired",
    body: "Ask the sender to send you a new link.",
    icon: ClockAlertIcon,
    tone: "warning",
  },
  closed: {
    title: "This envelope is closed",
    body: "The sender cancelled or closed this request.",
    icon: BanIcon,
    tone: "muted",
  },
}

type StatusIcon = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>

export function SigningExperience({ token }: { token: string }) {
  const [session, setSession] = useState<SigningSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/sign/${encodeURIComponent(token)}`
  // Embedded signing: tell the host app about state changes (ready, signed, declined).
  const lastState = useRef<State | null>(null)
  useEffect(() => {
    if (!session?.embed) return
    const event = embedEventFor(lastState.current, session.state)
    lastState.current = session.state
    if (event) {
      postEmbedEvent(
        event,
        session.state,
        session.embed.origins,
        window.parent === window ? null : window.parent,
      )
    }
  }, [session])

  const load = useCallback(async () => {
    try {
      setSession(await api<SigningSession>(base))
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "invalid" : "failed")
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <>
        <SignHeader />
        <StatusCard
          icon={UnlinkIcon}
          tone="danger"
          title="Can't open this document"
          description={
            error === "invalid"
              ? "This signing link is invalid. Ask the sender to send you a new link."
              : "Something went wrong. Refresh to try again."
          }
        />
      </>
    )
  }
  if (!session) {
    return (
      <>
        <SignHeader />
        <div className="flex flex-1 items-center justify-center px-4 py-10 md:pb-26">
          <div className="w-full max-w-[440px] rounded-(--radius-panel) border bg-card p-7">
            <Skeleton label="Opening the document" lines={4} />
          </div>
        </div>
      </>
    )
  }

  if (session.state !== "ready") {
    const m = MESSAGES[session.state]
    return (
      <>
        <SignHeader envelope={session.envelope} />
        <StatusCard icon={m.icon} tone={m.tone} title={m.title} description={m.body}>
          {session.downloadsAvailable && (
            <DownloadRows
              endpoint={`${base}/downloads`}
              documents={session.documents}
              attachments={session.attachments}
              certificateCode={session.certificateCode}
            />
          )}
          {/* Optional account (ADR 0062); not inside a host app's iframe. */}
          {(session.state === "signed" || session.state === "completed") && !session.embed && (
            <div className="border-t pt-4">
              <AccountInvite email={session.recipient.email} />
            </div>
          )}
        </StatusCard>
      </>
    )
  }

  if (session.requiresVerification)
    return (
      <>
        <SignHeader envelope={session.envelope} />
        <OtpStep base={base} session={session} onVerified={load} />
      </>
    )

  return <SigningSurface base={base} session={session} onDone={load} />
}

const CODE_LENGTH = 6

/** Server error body for the OTP endpoints (`otp_cooldown` carries `retryAfterSec`). */
function otpError(err: unknown): { code?: string; retryAfterSec?: number; message: string } {
  if (err instanceof ApiError) {
    const body = (err.body ?? {}) as { error?: string; retryAfterSec?: number }
    return { code: body.error, retryAfterSec: body.retryAfterSec, message: err.message }
  }
  return { message: err instanceof Error ? err.message : "Something went wrong" }
}

/** Ticks a seconds counter down to 0. */
function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

function OtpStep({
  base,
  session,
  onVerified,
}: {
  base: string
  session: SigningSession
  onVerified: () => void
}) {
  const channel =
    session.recipient.verification === "SMS_OTP"
      ? session.recipient.maskedPhone
      : session.recipient.maskedEmail
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resendIn, setResendIn] = useCountdown()

  async function send() {
    setError(null)
    setSending(true)
    try {
      const res = await api<{ sentTo: string; resendAfterSec: number }>(`${base}/otp`, {
        method: "POST",
      })
      setSentTo(res.sentTo)
      setCode("")
      setResendIn(res.resendAfterSec)
    } catch (err) {
      const e = otpError(err)
      if (e.code === "otp_cooldown") {
        // A code was sent moments ago (e.g. before a reload): let them enter it.
        setSentTo((cur) => cur ?? channel)
        setResendIn(e.retryAfterSec ?? 30)
      } else if (e.code === "rate_limited") {
        setError("Too many codes requested. Please try again in 15 minutes.")
      } else {
        setError(e.message)
      }
    } finally {
      setSending(false)
    }
  }

  async function verify(value: string) {
    if (value.length !== CODE_LENGTH || verifying) return
    setError(null)
    setVerifying(true)
    try {
      await api(`${base}/otp/verify`, { method: "POST", json: { code: value } })
      onVerified()
    } catch (err) {
      const e = otpError(err)
      setCode("")
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Request a new code."
          : e.message,
      )
    } finally {
      setVerifying(false)
    }
  }

  return (
    <StatusCard
      title="Verify it's you"
      description={
        sentTo ? `Enter the 6-digit code sent to ${sentTo}.` : `We'll send a code to ${channel}.`
      }
      className="gap-5"
    >
      {sentTo ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void verify(code)
          }}
        >
          {/* A wrong code clears the slots; the error sits on the field itself. Six digits
              verify on their own; Enter does too. */}
          <OtpInput
            label="Verification code"
            length={CODE_LENGTH}
            value={code}
            onChange={(value) => {
              setCode(value)
              if (value.length === CODE_LENGTH) void verify(value)
            }}
            error={error ?? undefined}
            disabled={verifying}
            autoFocus
          />
          <div className="flex items-center justify-between gap-3" aria-live="polite">
            {resendIn > 0 ? (
              <span className="text-muted-foreground text-xs">
                Resend code in {formatCountdown(resendIn)}
              </span>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={send} loading={sending}>
                Resend code
              </Button>
            )}
            {verifying && <span className="text-muted-foreground text-xs">Checking…</span>}
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <Alert tone="danger" title={error} />}
          <Button className="w-full" onClick={send} loading={sending}>
            Send code
          </Button>
        </div>
      )}
    </StatusCard>
  )
}
