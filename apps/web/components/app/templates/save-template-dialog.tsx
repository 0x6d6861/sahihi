"use client"

import { defaultRoleLabels, type RecipientRole, SaveTemplateSchema } from "@sahihi/core"
import { LayoutTemplateIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { useDraftState } from "@/components/app/envelope/draft-state"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

export interface TemplateSourceRecipient {
  id: string
  name: string
  email: string
  role: RecipientRole
}

/**
 * "Save as template" (docs/templates.md): name the template and each recipient's role. The
 * envelope isn't changed. On a draft, pending field edits are saved first (like Send).
 */
export function SaveTemplateDialog({
  envelopeId,
  envelopeTitle,
  recipients,
}: {
  envelopeId: string
  envelopeTitle: string
  recipients: TemplateSourceRecipient[]
}) {
  const draft = useDraftState()
  const initialLabels = defaultRoleLabels(recipients)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(envelopeTitle)
  const [description, setDescription] = useState("")
  const [labels, setLabels] = useState(initialLabels)
  const [keep, setKeep] = useState<boolean[]>(recipients.map(() => false))
  const [errors, setErrors] = useState<FormErrors>({})
  const [problems, setProblems] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  function onOpenChange(next: boolean) {
    if (pending) return
    setOpen(next)
    if (next) {
      setName(envelopeTitle)
      setDescription("")
      setLabels(initialLabels)
      setKeep(recipients.map(() => false))
      setErrors({})
      setProblems([])
      setSavedId(null)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const input = {
      envelopeId,
      name,
      description: description.trim() || undefined,
      roles: recipients.map((r, i) => ({
        recipientId: r.id,
        label: labels[i] ?? "",
        keepContact: keep[i] ?? false,
      })),
    }
    const parsed = SaveTemplateSchema.safeParse(input)
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setErrors({})
    setPending(true)
    const blocking = (await draft?.settle()) ?? []
    if (blocking.length > 0) {
      setPending(false)
      return setProblems(blocking)
    }
    setProblems([])
    try {
      const { template } = await api<{ template: { id: string } }>("/templates", {
        method: "POST",
        json: parsed.data,
      })
      setSavedId(template.id)
      toastManager.add({ title: "Template saved", description: parsed.data.name, type: "success" })
    } catch (err) {
      if (err instanceof ApiError && err.body?.issues?.length) {
        setErrors(issuesToFormErrors(err.body.issues))
      } else {
        setProblems([err instanceof Error ? err.message : "Could not save the template"])
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <LayoutTemplateIcon aria-hidden />
        Save as template
      </DialogTrigger>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Reuse this document, its recipients' roles and every field. This envelope isn't changed.
          </DialogDescription>
        </DialogHeader>
        {savedId ? (
          <>
            <DialogPanel>
              <p className="text-sm">
                Saved. Next time, start from <span className="font-medium">{name}</span> on the
                Templates page and just fill in who signs.
              </p>
            </DialogPanel>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button render={<Link href={`/templates/${savedId}/use`} />}>Use it now</Button>
            </DialogFooter>
          </>
        ) : (
          <Form errors={errors} onSubmit={onSubmit} className="contents">
            <DialogPanel className="flex flex-col gap-5">
              {problems.length > 0 && (
                <Alert variant="warning">
                  <AlertDescription>
                    <ul className="flex flex-col gap-1">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <Field name="name">
                <FieldLabel>Template name</FieldLabel>
                <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
                <FieldError />
              </Field>
              <Field name="description">
                <FieldLabel>Description (optional)</FieldLabel>
                <Input
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 12-month residential lease, Nairobi"
                />
                <FieldError />
              </Field>
              <div className="flex flex-col gap-4">
                <p className="font-medium text-sm">Roles</p>
                {recipients.map((r, i) => (
                  <div key={r.id} className="flex flex-col gap-2 rounded-lg border p-3">
                    <Field name={`roles.${i}.label`}>
                      <FieldLabel>Role for {r.name}</FieldLabel>
                      <Input
                        value={labels[i] ?? ""}
                        maxLength={60}
                        onChange={(e) =>
                          setLabels((all) => all.map((l, j) => (j === i ? e.target.value : l)))
                        }
                      />
                      <FieldError />
                    </Field>
                    <Field name={`roles.${i}.keepContact`}>
                      <FieldLabel className="flex items-center gap-2 font-normal">
                        <Checkbox
                          checked={keep[i] ?? false}
                          onCheckedChange={(checked) =>
                            setKeep((all) => all.map((k, j) => (j === i ? checked === true : k)))
                          }
                        />
                        Always send to {r.email}
                      </FieldLabel>
                      <FieldDescription>
                        For someone who signs every time, like your own countersigner.
                      </FieldDescription>
                    </Field>
                  </div>
                ))}
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner aria-hidden />}
                Save template
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogPopup>
    </Dialog>
  )
}
