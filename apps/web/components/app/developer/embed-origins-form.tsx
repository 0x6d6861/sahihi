"use client"

import { EmbedSettingsSchema } from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ApiError, api } from "@/lib/api"

/** Origins allowed to show embedded signing in an iframe (docs/embedded-signing.md). */
export function EmbedOriginsForm({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [text, setText] = useState(initial.join("\n"))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

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
      setSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Textarea
        label="Allowed origins"
        name="origins"
        value={text}
        rows={3}
        error={error ?? undefined}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
          setSaved(false)
        }}
        placeholder="https://portal.example.co.ke"
        style={{ fontFamily: "var(--font-mono)" }}
        description='One per line. Only these sites may show signing in an iframe, and only for recipients created with delivery: "EMBEDDED". https, no path; http://localhost is allowed for development.'
      />
      <div>
        {/* Confirms in place: the label morphs to "Saved" until the next edit. */}
        <Button type="submit" variant="secondary" loading={busy}>
          {saved ? "Saved" : "Save origins"}
        </Button>
      </div>
    </form>
  )
}
