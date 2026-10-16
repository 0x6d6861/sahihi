"use client"

import {
  currentSigners,
  type DocumentParty,
  documentParties,
  type GeneratedFieldType,
  type SignerField,
  type SignersDefinition,
  SignersDefinitionSchema,
} from "@sahihi/core"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/app/button"
import { useAutosave } from "@/components/app/field-editor/use-autosave"
import { Input } from "@/components/app/fields"
import { CheckIcon, PlusIcon, UserPlusIcon, XIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
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
 * (`PUT …/signers`, `applySigners`), on its own like the text (debounced, serialised, flushed
 * before finalising); finalising checks names and distinct, valid emails. A field's preflight
 * problem hides while that field differs from what's saved.
 *
 * Signers know the parties of the document (ADR 0048): each card says who it signs for, offers the
 * party's name as the signer's, and parties nobody signs for get an "Add signer for …" button.
 */
export function SignersPanel() {
  const { detail, editable, saveSigners, refresh, nav, registerFlush } = useGenerator()
  const saved = currentSigners(detail.version.data)
  const savedJson = JSON.stringify(saved)
  const parties = documentParties(detail.version.data)
  const [draft, setDraft] = useState<SignersDefinition>(saved)
  const draftRef = useRef(draft)
  draftRef.current = draft
  // The server state the form last loaded: unsaved edits are differences from it, not from the
  // latest server state (which can change underneath, e.g. an accepted suggestion).
  const [baseline, setBaseline] = useState(savedJson)
  const [revision, setRevision] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== baseline
  const root = useRef<HTMLDivElement>(null)

  // Pick up changes made elsewhere (an accepted suggestion, the editor) unless mid-edit.
  if (savedJson !== baseline && !dirty) {
    setBaseline(savedJson)
    setDraft(JSON.parse(savedJson) as SignersDefinition)
  }

  const update = (change: (d: SignersDefinition) => void) => {
    setDraft((d) => {
      const next = structuredClone(d)
      change(next)
      return next
    })
    setRevision((r) => r + 1)
  }

  const save = async () => {
    const sent = JSON.stringify(draftRef.current)
    if (sent === baseline) return
    const parsed = SignersDefinitionSchema.safeParse(JSON.parse(sent))
    if (!parsed.success) {
      setProblem(
        draftRef.current.roles.some((r) => !r.label.trim())
          ? "Give every signer a role to save."
          : "These signers can't be saved yet. Check the fields.",
      )
      throw new Error("invalid")
    }
    try {
      const version = await saveSigners(parsed.data)
      setProblem(null)
      // Take the server's definition (new fields get their ids there), unless the person kept
      // typing meanwhile: then the queued save sends the newer form.
      const server = JSON.stringify(currentSigners(version.data))
      setBaseline(server)
      setDraft((d) => (JSON.stringify(d) === sent ? (JSON.parse(server) as SignersDefinition) : d))
    } catch (err) {
      // Pick up the current version so the retry saves on top of it; the draft stays dirty.
      if (err instanceof ApiError && err.status === 409) await refresh().catch(() => {})
      setProblem(
        err instanceof ApiError && err.status === 409
          ? "The document changed meanwhile. Retry to save on top of it."
          : err instanceof ApiError && err.status === 400
            ? err.message
            : "Not saved.",
      )
      throw err
    }
  }

  const autosave = useAutosave(revision, save, 1200)
  const { flush } = autosave
  useEffect(() => registerFlush(flush), [registerFlush, flush])

  // A jump from the finalise list: the signer's card, with the focus on its first problem.
  useEffect(() => {
    if (nav?.target.kind !== "signers") return
    const roleKey = nav.target.roleKey
    const frame = requestAnimationFrame(() => {
      const card = roleKey
        ? root.current?.querySelector<HTMLElement>(`[data-role-key="${CSS.escape(roleKey)}"]`)
        : root.current
      if (!card) return
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      card.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })
      card.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [nav])

  return (
    <div
      ref={root}
      className="mx-auto flex max-w-[720px] scroll-mt-4 flex-col gap-4 px-3 pt-1 pb-10 sm:px-0"
    >
      {draft.roles.map((role, i) => {
        const issues = roleIssues(detail.issues, role.key)
        const savedRole = saved.roles.find((r) => r.key === role.key)
        // A field being edited hides only its own problem, until it's saved.
        const issue = (code: string, unchanged: boolean) =>
          unchanged ? issues.find((x) => x.code === code)?.message : undefined
        const nameSaved = (role.name ?? null) === (savedRole?.name ?? null)
        const emailSaved = (role.email ?? null) === (savedRole?.email ?? null)
        const signer = role.recipientRole === "SIGNER"
        const fields = draft.fields[role.key] ?? []
        const fieldsSaved = JSON.stringify(fields) === JSON.stringify(saved.fields[role.key] ?? [])
        const party = partyForRole(parties, draft, role.key)
        return (
          <div key={role.key} data-role-key={role.key} className="scroll-mt-4">
            <section
              aria-label={role.label || "Untitled signer"}
              className="flex flex-col gap-4 rounded-(--radius-panel) border bg-card p-5"
            >
              <header className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.45]">
                  {/* The role is the card's title, renamed in place. */}
                  <input
                    aria-label="Role"
                    className="-mx-1 min-w-0 rounded-md bg-transparent px-1 font-medium text-base outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
                    value={role.label}
                    placeholder="Untitled signer"
                    disabled={!editable}
                    onChange={(e) => update((d) => setRole(d, i, { label: e.target.value }))}
                  />
                  <p className="text-muted-foreground text-sm">{roleDescription(signer, party)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {editable ? (
                    <DropdownMenu
                      label={signer ? "Signer" : "Gets a copy"}
                      accessibleLabel={`Takes part as: ${signer ? "Signer" : "Gets a copy"}`}
                      align="end"
                      items={(["SIGNER", "VIEWER"] as const).map((v) => ({
                        label: v === "SIGNER" ? "Signer" : "Gets a copy",
                        icon: role.recipientRole === v ? <CheckIcon /> : <span />,
                        onSelect: () =>
                          update((d) => {
                            setRole(d, i, {
                              recipientRole: v,
                              ...(v === "VIEWER" ? { initialsOnEveryPage: false } : {}),
                            })
                            // A copy has no signature block, so it can't carry a party link (ADR 0048).
                            if (v === "VIEWER") {
                              d.fields[role.key] = []
                              delete d.parties[role.key]
                            }
                          }),
                      }))}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {signer ? "Signer" : "Gets a copy"}
                    </span>
                  )}
                  {editable && draft.roles.length > 1 && (
                    <Tooltip content="Remove signer">
                      <IconButton
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${role.label || "signer"}`}
                        className="text-muted-foreground"
                        onClick={() =>
                          update((d) => {
                            d.roles.splice(i, 1)
                            delete d.fields[role.key]
                            delete d.parties[role.key]
                          })
                        }
                      >
                        <XIcon aria-hidden />
                      </IconButton>
                    </Tooltip>
                  )}
                </div>
              </header>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Input
                    label="Name"
                    placeholder="Full name"
                    autoComplete="off"
                    value={role.name ?? ""}
                    disabled={!editable}
                    error={issue("missing_name", nameSaved)}
                    onChange={(e) => update((d) => setRole(d, i, { name: e.target.value || null }))}
                  />
                  {/* Signing in person: the party's own name. For a company, whoever signs for it. */}
                  {editable && party?.value && !role.name && (
                    <button
                      type="button"
                      className="absolute top-0 right-0 max-w-[60%] truncate text-muted-foreground text-sm leading-5 hover:text-foreground"
                      onClick={() => update((d) => setRole(d, i, { name: party.value }))}
                    >
                      Use “{party.value}”
                    </button>
                  )}
                </div>
                <Input
                  label="Email"
                  type="email"
                  placeholder="name@company.com"
                  autoComplete="off"
                  value={role.email ?? ""}
                  disabled={!editable}
                  error={issue("invalid_email", emailSaved) ?? issue("duplicate_email", emailSaved)}
                  onChange={(e) => update((d) => setRole(d, i, { email: e.target.value || null }))}
                />
              </div>
              {signer && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm" id={`${role.key}-initials`}>
                      Initials on every page
                    </span>
                    <Switch
                      aria-labelledby={`${role.key}-initials`}
                      checked={role.initialsOnEveryPage}
                      disabled={!editable}
                      onCheckedChange={(checked) =>
                        update((d) => setRole(d, i, { initialsOnEveryPage: checked }))
                      }
                    />
                  </div>
                  <FieldList
                    fields={fields}
                    disabled={!editable}
                    onChange={(next) =>
                      update((d) => {
                        d.fields[role.key] = next
                      })
                    }
                  />
                  {issue("missing_signature_field", fieldsSaved) && (
                    <p className="text-destructive-foreground text-sm">
                      {issue("missing_signature_field", fieldsSaved)}
                    </p>
                  )}
                </>
              )}
            </section>
          </div>
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
            size="sm"
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
            <UserPlusIcon aria-hidden />
            Add signer
          </Button>
          <span className="text-muted-foreground text-sm" role="status">
            {autosave.status === "saving" || autosave.status === "pending" ? "Saving…" : null}
            {autosave.status === "saved" && revision > 0 ? "Saved" : null}
            {autosave.status === "error" ? (
              <>
                {problem ?? "Not saved."}{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => void autosave.retry()}
                >
                  Retry
                </button>
              </>
            ) : null}
          </span>
        </div>
      )}
    </div>
  )
}

function roleDescription(signer: boolean, party: DocumentParty | null): string {
  if (!signer) return "Gets a copy when it's signed"
  if (!party) return "Signs this document"
  return `Signs for ${party.value ?? `${party.label} (not filled yet)`}`
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

/**
 * One signer's fields as chips: a click opens what to fill or agree to (text, checkbox), whether
 * it's required, and remove; "Add field" appends one.
 */
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
    <div className="flex flex-col gap-2">
      <span className="font-medium text-sm">Fields</span>
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">No fields yet. A signer needs a signature.</p>
      )}
      <ul className="flex flex-wrap items-center gap-2">
        {fields.map((f, i) => (
          <li key={f.id ?? `new-${i}`}>
            <FieldChip
              field={f}
              disabled={disabled}
              onChange={(patch) => set(i, patch)}
              onRemove={() => onChange(fields.filter((_, j) => j !== i))}
            />
          </li>
        ))}
        {!disabled && (
          <li className="app-plain-trigger">
            <DropdownMenu
              label="Add field"
              icon={<PlusIcon />}
              align="start"
              items={FIELD_TYPES.map((t) => ({
                label: FIELD_NAMES[t],
                onSelect: () => onChange([...fields, { fieldType: t, required: t !== "CHECKBOX" }]),
              }))}
            />
          </li>
        )}
      </ul>
    </div>
  )
}

function FieldChip({
  field,
  disabled,
  onChange,
  onRemove,
}: {
  field: SignerField
  disabled: boolean
  onChange: (patch: Partial<SignerField>) => void
  onRemove: () => void
}) {
  const name = FIELD_NAMES[field.fieldType]
  const withLabel = field.fieldType === "TEXT" || field.fieldType === "CHECKBOX"
  // Text and checkbox fields say what they ask for; the others are named by their type.
  const title = withLabel && field.label ? `${name}: ${field.label}` : name
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${title}, ${field.required ? "required" : "optional"}`}
          className="app-canvas press inline-flex h-[30px] max-w-64 items-center gap-1.5 rounded-2xl border px-2.5 text-sm outline-none hover:border-input focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none"
        >
          <span className="truncate">{title}</span>
          {!field.required && <span className="text-muted-foreground text-xs">optional</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="flex flex-col gap-3">
          <span className="font-medium text-sm">{name}</span>
          {withLabel && (
            <Input
              label={field.fieldType === "TEXT" ? "What to fill in" : "Statement to tick"}
              value={field.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value || undefined })}
            />
          )}
          <Checkbox
            label="Required"
            checked={field.required}
            onCheckedChange={(v) => onChange({ required: v === true })}
          />
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={onRemove}>
              Remove field
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
