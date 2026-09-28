"use client"

import type { FieldType, VerificationMethod } from "@sahihi/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { SigningSurface } from "@/components/app/signing/signing-surface"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card"
import { Form } from "@/components/ui/form"
import { OTPField, OTPFieldInput } from "@/components/ui/otp-field"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, api } from "@/lib/api"
import { formatCountdown } from "@/lib/countdown"

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
  document: { name: string; pageCount: number | null; pages: { rotation: number }[] | null }
  fields: {
    id: string
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
}

const MESSAGES: Record<Exclude<State, "ready">, { title: string; body: string }> = {
  waiting: { title: "Not your turn yet", body: "You'll get an email when it's your turn to sign." },
  signed: {
    title: "Thanks — you've signed",
    body: "We'll email you the final document once everyone has signed.",
  },
  completed: {
    title: "All parties have signed",
    body: "Download the signed document and certificate below.",
  },
  declined: {
    title: "Signing declined",
    body: "This envelope was declined and can no longer be signed.",
  },
  expired: { title: "This link has expired", body: "Ask the sender to send you a new link." },
  closed: {
    title: "This envelope is closed",
    body: "The sender cancelled or closed this request.",
  },
}

export function SigningExperience({ token }: { token: string }) {
  const [session, setSession] = useState<SigningSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const base = `/sign/${encodeURIComponent(token)}`

  const load = useCallback(async () => {
    try {
      setSession(await api<SigningSession>(base))
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "This signing link is invalid."
          : "Something went wrong.",
      )
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <Alert variant="error">
        <AlertTitle>Can't open this document</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!session) return <Spinner className="m-auto" />

  if (session.state !== "ready") {
    const m = MESSAGES[session.state]
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.body}</CardDescription>
        </CardHeader>
        {session.downloadsAvailable && (
          <CardFooter className="gap-2">
            <DownloadButtons base={base} />
          </CardFooter>
        )}
      </Card>
    )
  }

  if (session.requiresVerification)
    return <OtpStep base={base} session={session} onVerified={load} />

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
  const firstSlot = useRef<HTMLInputElement>(null)

  // After a wrong code the slots are cleared; put the cursor back in the first one.
  useEffect(() => {
    if (sentTo && error && !verifying) firstSlot.current?.focus()
  }, [sentTo, error, verifying])

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
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>Verify it's you</CardTitle>
        <CardDescription>
          {sentTo
            ? `Enter the 6-digit code sent to ${sentTo}.`
            : `We'll send a code to ${channel}.`}
        </CardDescription>
      </CardHeader>
      {sentTo ? (
        <Form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            void verify(code)
          }}
        >
          <CardPanel className="flex flex-col items-center gap-4">
            {error && (
              <Alert variant="error" className="w-full">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <OTPField
              length={CODE_LENGTH}
              value={code}
              onValueChange={setCode}
              onValueComplete={(v) => void verify(v)}
              validationType="numeric"
              autoComplete="one-time-code"
              disabled={verifying}
              aria-label="Verification code"
            >
              {Array.from({ length: CODE_LENGTH }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length code slots
                <OTPFieldInput key={i} autoFocus={i === 0} ref={i === 0 ? firstSlot : undefined} />
              ))}
            </OTPField>
          </CardPanel>
          <CardFooter className="flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={verifying || code.length !== CODE_LENGTH}
            >
              {verifying && <Spinner aria-hidden />}
              Verify
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={send}
              disabled={sending || resendIn > 0}
              aria-live="polite"
            >
              {resendIn > 0 ? `Resend code in ${formatCountdown(resendIn)}` : "Resend code"}
            </Button>
          </CardFooter>
        </Form>
      ) : (
        <CardFooter className="flex flex-col gap-2">
          {error && (
            <Alert variant="error" className="w-full">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button className="w-full" onClick={send} disabled={sending}>
            {sending && <Spinner aria-hidden />}
            Send code
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

function DownloadButtons({ base }: { base: string }) {
  const [links, setLinks] = useState<{ signed: string; certificate: string } | null>(null)
  useEffect(() => {
    api<{ signed: string; certificate: string }>(`${base}/downloads`).then(setLinks, () =>
      setLinks(null),
    )
  }, [base])
  if (!links) return null
  return (
    <>
      <Button render={<a href={links.signed} target="_blank" rel="noreferrer" />}>
        Signed document
      </Button>
      <Button
        variant="outline"
        render={<a href={links.certificate} target="_blank" rel="noreferrer" />}
      >
        Certificate
      </Button>
    </>
  )
}
