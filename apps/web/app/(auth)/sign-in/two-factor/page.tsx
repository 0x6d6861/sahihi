"use client"

import { BackupCodeSchema, TotpCodeSchema } from "@sahihi/core"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { OtpInput } from "@/components/arc/otp-input/otp-input"
import { twoFactor } from "@/lib/auth-client"
import { HOME_HREF } from "@/lib/nav"

/** Only same-site paths, so `?next=` can't send anyone to another origin. */
const safeNext = (next: string | null) =>
  next?.startsWith("/") && !next.startsWith("//") ? next : HOME_HREF

/**
 * Second sign-in step for accounts with two-factor authentication (docs/auth.md → Account
 * settings). better-auth keeps the half-finished sign-in in a short-lived cookie; a code from the
 * authenticator app or one backup code completes it.
 */
function TwoFactorForm() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))
  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [backup, setBackup] = useState("")
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed =
      mode === "totp" ? TotpCodeSchema.safeParse(code) : BackupCodeSchema.safeParse(backup)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Enter a code")
    setError(null)
    setPending(true)
    const { error } =
      mode === "totp"
        ? await twoFactor.verifyTotp({ code: parsed.data, trustDevice })
        : await twoFactor.verifyBackupCode({ code: parsed.data, trustDevice })
    setPending(false)
    if (error) {
      // An expired attempt can't be finished here; start again with the password.
      if (error.status === 401) return router.push(`/sign-in?next=${encodeURIComponent(next)}`)
      return setError(error.message ?? "That code didn't work")
    }
    router.push(next)
    router.refresh()
  }

  function switchMode() {
    setMode((m) => (m === "totp" ? "backup" : "totp"))
    setError(null)
  }

  return (
    <Panel
      title="Two-factor authentication"
      description={
        mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of the backup codes you saved. Each works once."
      }
      headingLevel={1}
      className="w-full max-w-sm"
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {error && <Alert tone="danger" title={error} />}
        {mode === "totp" ? (
          <OtpInput label="Authentication code" value={code} onChange={setCode} autoFocus />
        ) : (
          <Input
            label="Backup code"
            value={backup}
            autoComplete="one-time-code"
            placeholder="xxxxx-xxxxx"
            onChange={(e) => setBackup(e.target.value)}
            autoFocus
          />
        )}
        <Checkbox
          label="Trust this device for 30 days"
          checked={trustDevice}
          onCheckedChange={(v) => setTrustDevice(v === true)}
        />
        <Button type="submit" className="mt-2 w-full" loading={pending}>
          Verify
        </Button>
      </form>
      <div className="flex flex-col items-center gap-2 text-sm">
        <Button variant="ghost" size="sm" onClick={switchMode}>
          {mode === "totp" ? "Use a backup code" : "Use your authenticator app"}
        </Button>
        <Link
          href="/sign-in"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </Panel>
  )
}

export default function TwoFactorPage() {
  return (
    <Suspense>
      <TwoFactorForm />
    </Suspense>
  )
}
