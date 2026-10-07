"use client"

import { TotpCodeSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { DownloadIcon, ShieldCheckIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { OtpInput } from "@/components/arc/otp-input/otp-input"
import { PasswordField } from "@/components/arc/password-field/password-field"
import { backupCodesText, totpSecretFromUri } from "@/lib/account"
import { twoFactor } from "@/lib/auth-client"

type Flow =
  | { kind: "enable"; step: "password" }
  | { kind: "enable"; step: "scan"; totpURI: string; backupCodes: string[] }
  | { kind: "enable"; step: "codes"; backupCodes: string[] }
  | { kind: "disable" }
  | { kind: "regenerate"; step: "password" }
  | { kind: "regenerate"; step: "codes"; backupCodes: string[] }

/**
 * Two-factor authentication (better-auth `twoFactor` plugin): an authenticator app (TOTP) plus ten
 * one-time backup codes. Turning it on takes three steps: password, scan and confirm a code, then
 * save the backup codes. Sign-in then continues on /sign-in/two-factor.
 */
export function TwoFactorSettings({ enabled, email }: { enabled: boolean; email: string }) {
  const router = useRouter()
  const [flow, setFlow] = useState<Flow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [code, setCode] = useState("")

  function open(next: Flow) {
    setError(null)
    setCode("")
    setFlow(next)
  }

  function close() {
    // Finishing (or abandoning) after the codes were shown: the page now reflects the new state.
    if (flow && "step" in flow && flow.step === "codes") router.refresh()
    setFlow(null)
  }

  async function run<T>(
    call: () => Promise<{ data: T | null; error: { message?: string } | null }>,
  ) {
    setError(null)
    setPending(true)
    const { data, error } = await call()
    setPending(false)
    if (error || !data) {
      setError(error?.message ?? "Something went wrong")
      return null
    }
    return data
  }

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get("password") ?? "")
    if (!flow) return
    if (flow.kind === "enable") {
      const data = await run(() => twoFactor.enable({ password, issuer: "Sahihi" }))
      // Without TOTP configured better-auth answers `{ method: "otp" }`; ours always has TOTP.
      if (data && "totpURI" in data) {
        open({
          kind: "enable",
          step: "scan",
          totpURI: data.totpURI,
          backupCodes: data.backupCodes,
        })
      }
    } else if (flow.kind === "regenerate") {
      const data = await run(() => twoFactor.generateBackupCodes({ password }))
      if (data) open({ kind: "regenerate", step: "codes", backupCodes: data.backupCodes })
    } else {
      const data = await run(() => twoFactor.disable({ password }))
      if (data) {
        setFlow(null)
        toastManager.add({ title: "Two-factor authentication is off", type: "success" })
        router.refresh()
      }
    }
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (flow?.kind !== "enable" || flow.step !== "scan") return
    const parsed = TotpCodeSchema.safeParse(code)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter the code")
    const data = await run(() => twoFactor.verifyTotp({ code: parsed.data }))
    if (data) open({ kind: "enable", step: "codes", backupCodes: flow.backupCodes })
  }

  const title =
    flow?.kind === "disable"
      ? "Turn off two-factor authentication"
      : flow?.kind === "regenerate"
        ? "New backup codes"
        : "Turn on two-factor authentication"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={enabled ? "success" : "neutral"} size="sm">
          {enabled ? "On" : "Off"}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {enabled
            ? "Signing in asks for a code from your authenticator app."
            : "Add a code from an authenticator app (Google Authenticator, 1Password, Authy…) to every sign-in."}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {enabled ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => open({ kind: "regenerate", step: "password" })}
            >
              New backup codes
            </Button>
            <Button variant="ghost" size="sm" onClick={() => open({ kind: "disable" })}>
              Turn off
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => open({ kind: "enable", step: "password" })}
          >
            <ShieldCheckIcon aria-hidden />
            Turn on
          </Button>
        )}
      </div>

      <Dialog open={flow !== null} onOpenChange={(o) => !o && !pending && close()}>
        <DialogContent title={title}>
          <div className="flex flex-col gap-4">
            {error && <Alert tone="danger" title={error} />}

            {flow && (!("step" in flow) || flow.step === "password") && (
              <form className="flex flex-col gap-4" onSubmit={onPassword}>
                <p className="text-muted-foreground text-sm">
                  {flow.kind === "regenerate"
                    ? "Your current backup codes stop working once new ones are created."
                    : flow.kind === "disable"
                      ? "Sign-in will only ask for your password."
                      : "Confirm it's you to continue."}
                </p>
                <PasswordField
                  label="Password"
                  name="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                />
                <DialogActions>
                  <Button variant="ghost" type="button" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant={flow.kind === "disable" ? "danger" : "primary"}
                    loading={pending}
                  >
                    {flow.kind === "disable" ? "Turn off" : "Continue"}
                  </Button>
                </DialogActions>
              </form>
            )}

            {flow?.kind === "enable" && flow.step === "scan" && (
              <form className="flex flex-col gap-4" onSubmit={onVerify}>
                <p className="text-muted-foreground text-sm">
                  Scan the code with your authenticator app, then enter the 6-digit code it shows.
                </p>
                <TotpQr uri={flow.totpURI} />
                <OtpInput label="Code from your app" value={code} onChange={setCode} autoFocus />
                <DialogActions>
                  <Button variant="ghost" type="button" onClick={close}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={pending} disabled={code.length !== 6}>
                    Verify
                  </Button>
                </DialogActions>
              </form>
            )}

            {flow && "step" in flow && flow.step === "codes" && (
              <div className="flex flex-col gap-4">
                <p className="text-muted-foreground text-sm">
                  {flow.kind === "enable"
                    ? "Two-factor authentication is on. "
                    : "Your old backup codes no longer work. "}
                  Keep these codes somewhere safe. Each one signs you in once if you lose your
                  phone. They won't be shown again.
                </p>
                <BackupCodes codes={flow.backupCodes} email={email} />
                <DialogActions>
                  <Button onClick={close}>Done</Button>
                </DialogActions>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TotpQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(uri, { margin: 1, width: 176 }).then(
      (url) => !cancelled && setSrc(url),
      () => !cancelled && setSrc(null),
    )
    return () => {
      cancelled = true
    }
  }, [uri])
  const secret = totpSecretFromUri(uri)

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR codes need dark modules on white in either theme. */}
      <div className="on-paper rounded-2xl border bg-background p-3">
        {src ? (
          // biome-ignore lint/performance/noImgElement: generated data URL
          <img src={src} alt="QR code for your authenticator app" width={176} height={176} />
        ) : (
          <div className="size-44" />
        )}
      </div>
      {secret && (
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-muted-foreground text-xs">Can't scan? Enter this key instead</span>
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm">{secret}</code>
            <CopyButton value={secret.replaceAll(" ", "")} label="Copy key" iconOnly />
          </div>
        </div>
      )}
    </div>
  )
}

function BackupCodes({ codes, email }: { codes: string[]; email: string }) {
  function download() {
    const blob = new Blob([backupCodesText(codes, email)], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "sahihi-backup-codes.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-2 rounded-2xl border bg-muted/40 p-4 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={codes.join("\n")} label="Copy codes" />
        <Button variant="secondary" size="sm" onClick={download}>
          <DownloadIcon aria-hidden />
          Download
        </Button>
      </div>
    </div>
  )
}
