"use client"

import { Alert } from "@/components/arc/alert/alert"
import { CopyButton } from "@/components/arc/copy-button/copy-button"
import { Input } from "@/components/arc/input/input"

/** Arc inputs reset `font`, so a utility class can't switch them to mono; the token can. */
const MONO = { fontFamily: "var(--font-mono)" }

/**
 * Shows a secret the one time the API returns it: a webhook signing secret (create / rotate) or
 * an API key (create). The copy button confirms in place.
 */
export function SecretReveal({
  secret,
  label = "Signing secret",
  hint = "Use it to verify the Sahihi-Signature header on every request.",
}: {
  secret: string
  label?: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" title={`Copy the ${label.toLowerCase()} now`}>
        It won't be shown again. {hint}
      </Alert>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input label={label} readOnly value={secret} style={MONO} />
        </div>
        <CopyButton value={secret} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  )
}
