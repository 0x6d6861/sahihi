"use client"

import { EmbedSettingsSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"

/** Origins allowed to show embedded signing in an iframe (docs/embedded-signing.md). */
export function EmbedOriginsForm({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [text, setText] = useState(initial.join("\n"))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const origins = text
      .split(/[\n,]/)
      .map((o) => o.trim())
      .filter(Boolean)
    const parsed = EmbedSettingsSchema.safeParse({ origins })
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const at = typeof issue?.path[1] === "number" ? ` (${origins[issue.path[1]]})` : ""
      return setError(`${issue?.message ?? "Invalid origin"}${at}`)
    }
    setError(null)
    setBusy(true)
    try {
      const res = await api<{ origins: string[] }>("/embedding", {
        method: "PUT",
        json: parsed.data,
      })
      setText(res.origins.join("\n"))
      toastManager.add({ title: "Embedding origins saved", type: "success" })
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form
      onSubmit={onSubmit}
      errors={error ? { origins: error } : {}}
      className="flex flex-col gap-4"
    >
      <Field name="origins">
        <FieldLabel>Allowed origins</FieldLabel>
        <Textarea
          value={text}
          rows={3}
          onChange={(e) => {
            setText(e.target.value)
            // Base UI keeps a field with an external error invalid (and blocks submit) until cleared.
            setError(null)
          }}
          placeholder={"https://portal.example.co.ke"}
          className="font-mono"
        />
        <FieldDescription>
          One per line. Only these sites may show signing in an iframe, and only for recipients
          created with <span className="font-mono">delivery: "EMBEDDED"</span>. https, no path;
          http://localhost is allowed for development.
        </FieldDescription>
        <FieldError />
      </Field>
      <div>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner aria-hidden />}
          Save origins
        </Button>
      </div>
    </Form>
  )
}
