"use client"

import { draftFromTemplate, hasFixedContact, type TemplateForUse } from "@sahihi/core"
import { LockIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
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
  const [pending, setPending] = useState(false)
  const open = template.roles.filter((r) => !hasFixedContact(r))
  const sequential = template.signingOrder === "SEQUENTIAL"

  const set = (roleId: string, patch: Partial<Person>) =>
    setPeople((all) => ({ ...all, [roleId]: { ...(all[roleId] as Person), ...patch } }))

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const recipients = open.map((r) => ({ roleId: r.id, ...(people[r.id] as Person) }))
    const errs: FormErrors = {}
    if (!title.trim()) errs.title = "Give the envelope a title."
    const draft = draftFromTemplate(template, recipients)
    if (!draft.ok) Object.assign(errs, issuesToFormErrors(draft.issues))
    if (Object.keys(errs).length > 0) return setErrors(errs)
    setErrors({})
    setPending(true)
    try {
      const { envelope } = await api<{ envelope: { id: string } }>(
        `/templates/${templateId}/envelopes`,
        {
          method: "POST",
          json: { title: title.trim(), message: message.trim() || undefined, recipients },
        },
      )
      router.push(`/envelopes/${envelope.id}`)
    } catch (err) {
      setPending(false)
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
    <Form className="flex flex-col gap-6" errors={errors} onSubmit={onSubmit}>
      <Field name="title">
        <FieldLabel>Envelope title</FieldLabel>
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <FieldDescription>Recipients see this in the email subject.</FieldDescription>
        <FieldError />
      </Field>

      <div className="flex flex-col gap-4">
        <p className="font-medium text-sm">
          Who signs {sequential && <span className="text-muted-foreground">(in this order)</span>}
        </p>
        {template.roles.map((role) => (
          <RoleBlock
            key={role.id}
            role={role}
            step={sequential ? role.order : null}
            person={people[role.id] as Person}
            roleError={errors[`recipients.${role.id}`]}
            onChange={(patch) => set(role.id, patch)}
          />
        ))}
      </div>

      <Field name="message">
        <FieldLabel>Message (optional)</FieldLabel>
        <Textarea
          value={message}
          maxLength={2000}
          rows={3}
          onChange={(e) => setMessage(e.target.value)}
        />
        <FieldError />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner aria-hidden />}
          Create draft
        </Button>
      </div>
    </Form>
  )
}

function RoleBlock({
  role,
  step,
  person,
  roleError,
  onChange,
}: {
  role: Role
  step: number | null
  person: Person
  roleError: string | undefined
  onChange: (patch: Partial<Person>) => void
}) {
  const base = `recipients.${role.id}`
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        {step !== null && <Badge variant="outline">Step {step}</Badge>}
        <span className="font-medium">{role.label}</span>
        <span className="text-muted-foreground text-sm">
          {ROLE_LABELS[role.role]} · {VERIFICATION_LABELS[role.verification]}
        </span>
      </div>
      {hasFixedContact(role) ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <LockIcon aria-hidden className="size-4" />
          Always sent to {role.name} ({role.email})
        </p>
      ) : (
        <>
          {roleError && <p className="text-destructive-foreground text-sm">{roleError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field name={`${base}.name`}>
              <FieldLabel>Name</FieldLabel>
              <Input
                value={person.name}
                maxLength={120}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              <FieldError />
            </Field>
            <Field name={`${base}.email`}>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                value={person.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
              <FieldError />
            </Field>
            {role.verification === "SMS_OTP" && (
              <Field name={`${base}.phone`}>
                <FieldLabel>Mobile (for the SMS code)</FieldLabel>
                <Input
                  value={person.phone}
                  placeholder="+254712345678"
                  onChange={(e) => onChange({ phone: e.target.value })}
                />
                <FieldError />
              </Field>
            )}
          </div>
        </>
      )}
    </div>
  )
}
