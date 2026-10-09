"use client"

import type { SignerRole } from "@sahihi/core"
import { useState } from "react"
import { Panel } from "@/components/app/panel"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { ApiError } from "@/lib/api"
import { roleIssues } from "@/lib/generator"
import { useGenerator } from "./generator-context"

/**
 * Signer roles and their contacts (docs/ai-documents.md → Signers). Who signs is data: the names
 * and emails here become the envelope's recipients, and the document text never holds an email,
 * so the two can't disagree. Finalising checks every signer has a name and a distinct, valid email.
 */
export function SignersPanel() {
  const { detail, editable, saveRoles } = useGenerator()
  const roles = detail.version.data.roles
  const [draft, setDraft] = useState(() => contactsOf(roles))
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "stale">("idle")

  const dirty = roles.some(
    (r) =>
      (draft[r.key]?.name ?? "") !== (r.name ?? "") ||
      (draft[r.key]?.email ?? "") !== (r.email ?? ""),
  )

  const save = async () => {
    setSaving(true)
    setStatus("idle")
    // Saved as the server stores them (trimmed, email lowercased), so the form reads unchanged.
    const contacts = roles.map((r) => ({
      key: r.key,
      name: draft[r.key]?.name.trim() || null,
      email: draft[r.key]?.email.trim().toLowerCase() || null,
    }))
    try {
      await saveRoles(contacts)
      setDraft(
        Object.fromEntries(
          contacts.map((c) => [c.key, { name: c.name ?? "", email: c.email ?? "" }]),
        ),
      )
      setStatus("saved")
    } catch (err) {
      setStatus(err instanceof ApiError && err.status === 409 ? "stale" : "error")
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6 md:px-8"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {roles.map((role) => {
        const issues = roleIssues(detail.issues, role.key)
        const issue = (code: string) => issues.find((i) => i.code === code)?.message
        return (
          <Panel
            key={role.key}
            title={role.label}
            description={role.recipientRole === "SIGNER" ? "Signs this document" : "Gets a copy"}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                autoComplete="off"
                value={draft[role.key]?.name ?? ""}
                disabled={!editable || saving}
                error={dirty ? undefined : issue("missing_name")}
                onChange={(e) => {
                  setStatus("idle")
                  setDraft((d) => ({
                    ...d,
                    [role.key]: { email: d[role.key]?.email ?? "", name: e.target.value },
                  }))
                }}
              />
              <Input
                label="Email"
                type="email"
                autoComplete="off"
                value={draft[role.key]?.email ?? ""}
                disabled={!editable || saving}
                error={dirty ? undefined : (issue("invalid_email") ?? issue("duplicate_email"))}
                onChange={(e) => {
                  setStatus("idle")
                  setDraft((d) => ({
                    ...d,
                    [role.key]: { name: d[role.key]?.name ?? "", email: e.target.value },
                  }))
                }}
              />
            </div>
            {issue("missing_signature_field") && (
              <p className="text-destructive-foreground text-sm">
                {issue("missing_signature_field")}
              </p>
            )}
          </Panel>
        )
      })}
      {editable && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-sm" role="status">
            {status === "saved" && !dirty && "Saved"}
            {status === "error" && "Not saved. Try again."}
            {status === "stale" && "The document changed meanwhile. Reload and try again."}
          </span>
          <Button type="submit" loading={saving} disabled={!dirty || saving}>
            Save signers
          </Button>
        </div>
      )}
    </form>
  )
}

function contactsOf(roles: SignerRole[]): Record<string, { name: string; email: string }> {
  return Object.fromEntries(roles.map((r) => [r.key, { name: r.name ?? "", email: r.email ?? "" }]))
}
