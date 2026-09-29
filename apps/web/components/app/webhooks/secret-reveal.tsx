"use client"

import { ClipboardCopyIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toastManager } from "@/components/ui/toast"

/** Shows a signing secret the one time the API returns it (create / rotate). */
export function SecretReveal({ secret }: { secret: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret)
      toastManager.add({ title: "Signing secret copied", type: "success" })
    } catch {
      toastManager.add({ title: "Couldn't copy; select the text instead", type: "error" })
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="warning">
        <AlertTitle>Copy the signing secret now</AlertTitle>
        <AlertDescription>
          It won't be shown again. Use it to verify the Sahihi-Signature header on every request.
        </AlertDescription>
      </Alert>
      <div className="flex items-center gap-2">
        <Input readOnly value={secret} className="font-mono" aria-label="Signing secret" />
        <Button variant="outline" size="icon" aria-label="Copy signing secret" onClick={copy}>
          <ClipboardCopyIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}
