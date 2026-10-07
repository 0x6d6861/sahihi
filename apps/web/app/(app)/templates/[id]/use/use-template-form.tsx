"use client"

import {
  type CreateAndSendResult,
  draftFromTemplate,
  hasFixedContact,
  type TemplateForUse,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LockIcon, SendIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { toastManager } from "@/components/app/toast"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ApiError, api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"
import { ROLE_LABELS, VERIFICATION_LABELS } from "@/lib/recipients"

type Role = TemplateForUse["roles"][number]
type Person = { name: string; email: string; phone: string }

/**
 * Fill in who plays each role, then create a DRAFT envelope (docs/templates.md). Validated with
 * the same `draftFromTemplate` the API runs, so errors land next to the right role.
 */
export function UseTemplateForm({
  templateId,
  defaultTitle,
  defaultMessage,
  template,
}: {
  templateId: string
  defaultTitle: string
  defaultMessage: string
  template: TemplateForUse
}) {
  const router = useRouter()
  const [title, setTitle] = useState(defaultTitle)
  const [message, setMessage] = useState(defaultMessage)
  const [people, setPeople] = useState<Record<string, Person>>(
    Object.fromEntries(template.roles.map((r) => [r.id, { name: "", email: "", phone: "" }])),
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState<"draft" | "send" | null>(null)
  const open = template.roles.filter((r) => !hasFixedContact(r))
  const sequential = template.signingOrder === "SEQUENTIAL"

  const set = (roleId: string, patch: Partial<Person>) =>
    setPeople((all) => ({ ...all, [roleId]: { ...(all[roleId] as Person), ...patch } }))

  /** Create draft, or "Send now" (`send: true`): one call either way (docs/templates.md). */
  async function submit(send: boolean) {
    const recipients = open.map((r) => ({ roleId: r.id, ...(people[r.id] as Person) }))
    const errs: FormErrors = {}
    if (!title.trim()) errs.title = "Give the envelope a title."
    const draft = draftFromTemplate(template, recipients)
    if (!draft.ok) Object.assign(errs, issuesToFormErrors(draft.issues))
    if (Object.keys(errs).length > 0) return setErrors(errs)
    setErrors({})
    setPending(send ? "send" : "draft")
    try {
      const result = await api<CreateAndSendResult>(`/templates/${templateId}/envelopes`, {
        method: "POST",
        json: { title: title.trim(), message: message.trim() || undefined, recipients, send },
      })
      if (result.sent) {
        toastManager.add({ title: "Envelope sent", description: title.trim(), type: "success" })
      } else if (send) {
        toastManager.add({
          title: "Saved as a draft, not sent",
          description: result.message ?? "Finish it on this page, then send.",
          type: "error",
        })
      }
      router.push(`/envelopes/${result.envelope.id}`)
    } catch (err) {
      setPending(null)
      if (err instanceof ApiError && err.body?.issues?.length) {
        return setErrors(issuesToFormErrors(err.body.issues))
      }
      toastManager.add({
        title: "Could not create the envelope",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    }
  }

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit(false)
      }}
    >
      {/* The job here is "who signs", so it comes first; title and message are details. */}
      <Panel
        title="Who signs"
        description={
          sequential
            ? "They're invited in this order. Recipients on the same step sign at the same time."
            : "Everyone is invited at the same time."
        }
      >
        <div className="flex flex-col gap-5">
          {template.roles.map((role) => (
            <RoleBlock
              key={role.id}
              role={role}
              step={sequential ? role.order : null}
              person={people[role.id] as Person}
              errors={errors}
              onChange={(patch) => set(role.id, patch)}
            />
          ))}
        </div>
      </Panel>

      <Panel title="Details">
        <Input
          label="Envelope title"
          name="title"
          value={title}
          maxLength={200}
          description="Recipients see this in the email subject."
          error={errors.title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          label="Message (optional)"
          name="message"
          value={message}
          maxLength={2000}
          rows={3}
          error={errors.message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Panel>

      {/* Phones: full-width buttons, primary on top. */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:max-sm:w-full">
        <Button variant="ghost" type="button" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="secondary"
          loading={pending === "draft"}
          disabled={pending === "send"}
        >
          Create draft
        </Button>
        <Button
          type="button"
          loading={pending === "send"}
          disabled={pending === "draft"}
          onClick={() => void submit(true)}
        >
          <SendIcon aria-hidden />
          Send now
        </Button>
      </div>
    </form>
  )
}

function RoleBlock({
  role,
  step,
  person,
  errors,
  onChange,
}: {
  role: Role
  step: number | null
  person: Person
  errors: FormErrors
  onChange: (patch: Partial<Person>) => void
}) {
  const base = `recipients.${role.id}`
  const roleError = errors[base]
  return (
    <div className="flex flex-col gap-3 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        {step !== null && <Badge size="sm">Step {step}</Badge>}
        <span className="font-medium text-sm">{role.label}</span>
        <span className="text-muted-foreground text-sm">
          {ROLE_LABELS[role.role]} · {VERIFICATION_LABELS[role.verification]}
        </span>
      </div>
      {hasFixedContact(role) ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <LockIcon aria-hidden />
          Always sent to {role.name} ({role.email})
        </p>
      ) : (
        <>
          {roleError && (
            <p role="alert" className="text-destructive-foreground text-sm">
              {roleError}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Name"
              name={`${base}.name`}
              value={person.name}
              maxLength={120}
              error={errors[`${base}.name`]}
              onChange={(e) => onChange({ name: e.target.value })}
            />
            <Input
              label="Email"
              name={`${base}.email`}
              type="email"
              value={person.email}
              error={errors[`${base}.email`]}
              onChange={(e) => onChange({ email: e.target.value })}
            />
            {role.verification === "SMS_OTP" && (
              <Input
                label="Mobile (for the SMS code)"
                name={`${base}.phone`}
                type="tel"
                value={person.phone}
                placeholder="+254712345678"
                error={errors[`${base}.phone`]}
                onChange={(e) => onChange({ phone: e.target.value })}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
