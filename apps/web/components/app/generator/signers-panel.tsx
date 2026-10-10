"use client"

import {
  currentSigners,
  type DocumentParty,
  documentParties,
  type GeneratedFieldType,
  type SignerField,
  type SignersDefinition,
} from "@sahihi/core"
import { useState } from "react"
import { XIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Input } from "@/components/arc/input/input"
import { Select } from "@/components/arc/select/select"
import { Switch } from "@/components/arc/switch/switch"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { partyForRole, roleIssues, unsignedParties } from "@/lib/generator"
import { blankKey } from "@/lib/generator-editor"
import { useGenerator } from "./generator-context"

const FIELD_NAMES: Record<GeneratedFieldType, string> = {
  SIGNATURE: "Signature",
  INITIALS: "Initials",
  NAME: "Full name",
  DATE_SIGNED: "Date signed",
  TEXT: "Text",
  CHECKBOX: "Checkbox",
}
const FIELD_TYPES = Object.keys(FIELD_NAMES) as GeneratedFieldType[]

/**
 * Who signs and where (docs/ai-documents.md → Signers). Signer identity is data: the roles and
 * contacts here become the envelope's recipients, each signer's fields become their signature block
 * in the document, and the text never holds an email. Saved as one definition
 * (`PUT …/signers`, `applySigners`); finalising checks names and distinct, valid emails.
 *
 * Signers know the parties of the document (ADR 0048): each card says who it signs for, offers the
 * party's name as the signer's, and parties nobody signs for get an "Add signer for …" button.
 */
export function SignersPanel() {
  const { detail, editable, saveSigners } = useGenerator()
  const saved = currentSigners(detail.version.data)
  const savedJson = JSON.stringify(saved)
  const parties = documentParties(detail.version.data)
  const [draft, setDraft] = useState<SignersDefinition>(saved)
  // The server state the form last loaded: unsaved edits are differences from it, not from the
  // latest server state (which can change underneath, e.g. an accepted suggestion).
  const [baseline, setBaseline] = useState(savedJson)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "stale" | "invalid">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== baseline
  // After a save, take the server's version (new fields get their ids there).
  const [resync, setResync] = useState(false)

  // Pick up changes made elsewhere (an accepted suggestion, the editor) unless mid-edit.
  if (savedJson !== baseline && (!dirty || resync)) {
    setResync(false)
    setBaseline(savedJson)
    setDraft(JSON.parse(savedJson) as SignersDefinition)
  }

  const update = (change: (d: SignersDefinition) => void) => {
    setStatus("idle")
    setDraft((d) => {
      const next = structuredClone(d)
      change(next)
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setStatus("idle")
    try {
      setResync(true)
      await saveSigners(draft)
      setStatus("saved")
    } catch (err) {
      setResync(false)
      if (err instanceof ApiError && err.status === 409) setStatus("stale")
      else if (err instanceof ApiError && err.status === 400) {
        setStatus("invalid")
        setMessage(err.message)
      } else setStatus("error")
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
      {draft.roles.map((role, i) => {
        const issues = roleIssues(detail.issues, role.key)
        const issue = (code: string) =>
          dirty ? undefined : issues.find((x) => x.code === code)?.message
        const signer = role.recipientRole === "SIGNER"
        const fields = draft.fields[role.key] ?? []
        const party = partyForRole(parties, draft, role.key)
        return (
          <Panel
            key={role.key}
            title={role.label || "Untitled signer"}
            description={roleDescription(signer, party)}
            actions={
              editable && draft.roles.length > 1 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() =>
                    update((d) => {
                      d.roles.splice(i, 1)
                      delete d.fields[role.key]
                      delete d.parties[role.key]
                    })
                  }
                >
                  Remove
                </Button>
              ) : null
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Role"
                value={role.label}
                disabled={!editable || saving}
                onChange={(e) => update((d) => setRole(d, i, { label: e.target.value }))}
              />
              <Select
                label="Takes part as"
                value={role.recipientRole}
                disabled={!editable || saving}
                options={[
                  { value: "SIGNER", label: "Signer" },
                  { value: "VIEWER", label: "Gets a copy" },
                ]}
                onValueChange={(v) =>
                  update((d) => {
                    setRole(d, i, {
                      recipientRole: v as "SIGNER" | "VIEWER",
                      ...(v === "VIEWER" ? { initialsOnEveryPage: false } : {}),
                    })
                    if (v === "VIEWER") d.fields[role.key] = []
                  })
                }
              />
              <Input
                label="Full name"
                autoComplete="off"
                value={role.name ?? ""}
                disabled={!editable || saving}
                error={issue("missing_name")}
                onChange={(e) => update((d) => setRole(d, i, { name: e.target.value || null }))}
              />
              <Input
                label="Email"
                type="email"
                autoComplete="off"
                value={role.email ?? ""}
                disabled={!editable || saving}
                error={issue("invalid_email") ?? issue("duplicate_email")}
                onChange={(e) => update((d) => setRole(d, i, { email: e.target.value || null }))}
              />
            </div>
            {editable && party?.value && !role.name && (
              <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-sm">
                Signing in person?
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => update((d) => setRole(d, i, { name: party.value }))}
                >
                  Use “{party.value}”
                </Button>
                For a company, enter who signs on its behalf.
              </p>
            )}
            {signer && (
              <>
                <Switch
                  label="Initials on every page"
                  checked={role.initialsOnEveryPage}
                  disabled={!editable || saving}
                  onCheckedChange={(checked) =>
                    update((d) => setRole(d, i, { initialsOnEveryPage: checked }))
                  }
                />
                <FieldList
                  fields={fields}
                  disabled={!editable || saving}
                  onChange={(next) =>
                    update((d) => {
                      d.fields[role.key] = next
                    })
                  }
                />
                {issue("missing_signature_field") && (
                  <p className="text-destructive-foreground text-sm">
                    {issue("missing_signature_field")}
                  </p>
                )}
              </>
            )}
          </Panel>
        )
      })}
      {editable && unsignedParties(parties, draft).length > 0 && (
        <Alert tone="info" title="Nobody signs for these parties yet">
          <span className="flex flex-wrap gap-2 pt-1">
            {unsignedParties(parties, draft).map((p) => (
              <Button
                key={p.variableKey}
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() =>
                  update((d) => {
                    const key = blankKey(
                      p.roleLabel,
                      d.roles.map((r) => r.key),
                    )
                    d.roles.push(newRole(key, p.roleLabel))
                    d.fields[key] = standardFields()
                    d.parties[key] = p.variableKey
                  })
                }
              >
                Add signer for {p.value ?? p.roleLabel}
              </Button>
            ))}
          </span>
        </Alert>
      )}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            disabled={saving}
            onClick={() =>
              update((d) => {
                const key = blankKey(
                  `signer ${d.roles.length + 1}`,
                  d.roles.map((r) => r.key),
                )
                d.roles.push(newRole(key, `Signer ${d.roles.length + 1}`))
                d.fields[key] = standardFields()
              })
            }
          >
            Add signer
          </Button>
          <span className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm" role="status">
              {status === "saved" && !dirty && "Saved"}
              {status === "error" && "Not saved. Try again."}
              {status === "stale" && "The document changed meanwhile. Reload and try again."}
              {status === "invalid" && message}
            </span>
            <Button type="submit" loading={saving} disabled={!dirty || saving}>
              Save signers
            </Button>
          </span>
        </div>
      )}
    </form>
  )
}

function roleDescription(signer: boolean, party: DocumentParty | null): string {
  if (!party) return signer ? "Signs this document" : "Gets a copy when it's signed"
  const who = party.value ?? `${party.label} (not filled yet)`
  return signer ? `Signs for ${who}` : `Gets a copy for ${who}`
}

function newRole(key: string, label: string): SignersDefinition["roles"][number] {
  return {
    key,
    label,
    recipientRole: "SIGNER",
    name: null,
    email: null,
    initialsOnEveryPage: false,
  }
}

const standardFields = (): SignerField[] => [
  { fieldType: "SIGNATURE", required: true },
  { fieldType: "NAME", required: true },
  { fieldType: "DATE_SIGNED", required: true },
]

function setRole(
  d: SignersDefinition,
  index: number,
  patch: Partial<SignersDefinition["roles"][number]>,
) {
  const role = d.roles[index]
  if (role) d.roles[index] = { ...role, ...patch }
}

/** One signer's fields: type, what to fill or agree to (text, checkbox), required, remove. */
function FieldList({
  fields,
  disabled,
  onChange,
}: {
  fields: SignerField[]
  disabled: boolean
  onChange: (next: SignerField[]) => void
}) {
  const set = (i: number, patch: Partial<SignerField>) =>
    onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <div className="flex flex-col gap-3">
      <span className="font-medium text-sm">Fields</span>
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">No fields yet. A signer needs a signature.</p>
      )}
      <ul className="flex flex-col divide-y rounded-xl border">
        {fields.map((f, i) => (
          <li key={f.id ?? `new-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="w-28 shrink-0 text-sm">{FIELD_NAMES[f.fieldType]}</span>
            {f.fieldType === "TEXT" || f.fieldType === "CHECKBOX" ? (
              <div className="min-w-48 flex-1">
                <Input
                  label={f.fieldType === "TEXT" ? "What to fill in" : "Statement to tick"}
                  value={f.label ?? ""}
                  disabled={disabled}
                  onChange={(e) => set(i, { label: e.target.value || undefined })}
                />
              </div>
            ) : (
              <span className="flex-1" />
            )}
            <Checkbox
              label="Required"
              checked={f.required}
              disabled={disabled}
              onCheckedChange={(v) => set(i, { required: v === true })}
            />
            <Tooltip content="Remove field">
              <IconButton
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${FIELD_NAMES[f.fieldType]} field`}
                disabled={disabled}
                onClick={() => onChange(fields.filter((_, j) => j !== i))}
              >
                <XIcon aria-hidden />
              </IconButton>
            </Tooltip>
          </li>
        ))}
      </ul>
      {!disabled && (
        <div>
          <DropdownMenu
            label="Add field"
            align="start"
            items={FIELD_TYPES.map((t) => ({
              label: FIELD_NAMES[t],
              onSelect: () => onChange([...fields, { fieldType: t, required: t !== "CHECKBOX" }]),
            }))}
          />
        </div>
      )}
    </div>
  )
}
