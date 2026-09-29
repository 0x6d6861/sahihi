"use client"

import { ClipboardCopyIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toastManager } from "@/components/ui/toast"

/**
 * Shows a secret the one time the API returns it: a webhook signing secret (create / rotate) or
 * an API key (create).
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
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      toastManager.add({ title: `${label} copied`, type: "success" })
    } catch {
      toastManager.add({ title: "Couldn't copy; select the text instead", type: "error" })
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="warning">
        <AlertTitle>Copy the {label.toLowerCase()} now</AlertTitle>
        <AlertDescription>It won't be shown again. {hint}</AlertDescription>
      </Alert>
      <div className="flex items-center gap-2">
        <Input readOnly value={secret} className="font-mono" aria-label={label} />
        <Button
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={copy}
        >
          <ClipboardCopyIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}
