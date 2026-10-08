"use client"

import { defaultRoleLabels, type RecipientRole, SaveTemplateSchema } from "@sahihi/core"
import { useEffect, useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { DialogActions } from "@/components/app/confirm-dialog"
import { useDraftState } from "@/components/app/envelope/draft-state"
import { LayoutTemplateIcon } from "@/components/app/icons"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Dialog, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
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
  open: openProp,
  onOpenChange: onOpenChangeProp,
  onAddRecipients,
}: {
  envelopeId: string
  envelopeTitle: string
  recipients: TemplateSourceRecipient[]
  /**
   * Controlled, without a trigger (e.g. opened from a menu item). Uncontrolled, it renders a
   * secondary "Save as template" button.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Without recipients there's nothing to save yet: this offers the way to add them. */
  onAddRecipients?: () => void
}) {
  const draft = useDraftState()
  const initialLabels = defaultRoleLabels(recipients)
  const [openState, setOpenState] = useState(false)
  const controlled = openProp !== undefined
  const open = openProp ?? openState
  const [name, setName] = useState(envelopeTitle)
  const [description, setDescription] = useState("")
  const [labels, setLabels] = useState(initialLabels)
  const [keep, setKeep] = useState<boolean[]>(recipients.map(() => false))
  const [errors, setErrors] = useState<FormErrors>({})
  const [problems, setProblems] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  function setOpen(next: boolean) {
    if (!controlled) setOpenState(next)
    onOpenChangeProp?.(next)
  }

  function onOpenChange(next: boolean) {
    if (pending) return
    setOpen(next)
  }

  // Start each opening from a clean form, however it was opened.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when it opens
  useEffect(() => {
    if (!open) return
    setName(envelopeTitle)
    setDescription("")
    setLabels(defaultRoleLabels(recipients))
    setKeep(recipients.map(() => false))
    setErrors({})
    setProblems([])
    setSavedId(null)
  }, [open])

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
      // Confirmed in place: the dialog switches to its "Saved" view.
      setSavedId(template.id)
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
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="secondary">
            <LayoutTemplateIcon aria-hidden />
            <span>Save as template</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        title={savedId ? "Template saved" : "Save as template"}
        description="Reuse this document, its recipients' roles and every field. This envelope isn't changed."
      >
        {savedId ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Next time, start from <span className="font-medium">{name}</span> on the Templates
              page and just fill in who signs.
            </p>
            <DialogActions>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <ButtonLink variant="primary" href={`/templates/${savedId}/use`}>
                Use it now
              </ButtonLink>
            </DialogActions>
          </div>
        ) : recipients.length === 0 ? (
          <div className="flex flex-col gap-4">
            <Alert tone="info" title="Add a recipient first">
              A template keeps each recipient's role and fields, so this draft needs at least one
              recipient before it can be saved as a template.
            </Alert>
            <DialogActions>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              {onAddRecipients && (
                <Button variant="primary" onClick={onAddRecipients}>
                  Add recipients
                </Button>
              )}
            </DialogActions>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            {problems.length > 0 && (
              <Alert tone="warning" title="Before you save">
                <ul className="flex flex-col gap-1">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <Input
              label="Template name"
              name="name"
              value={name}
              maxLength={120}
              error={errors.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Description (optional)"
              name="description"
              value={description}
              maxLength={500}
              error={errors.description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For example, 12-month residential lease, Nairobi"
            />
            <fieldset className="flex flex-col gap-3">
              <legend className="pb-3 font-medium text-sm">Roles</legend>
              {recipients.map((r, i) => (
                <div key={r.id} className="flex flex-col gap-3 rounded-2xl border p-4">
                  <Input
                    label={`Role for ${r.name}`}
                    name={`roles.${i}.label`}
                    value={labels[i] ?? ""}
                    maxLength={60}
                    error={errors[`roles.${i}.label`]}
                    onChange={(e) =>
                      setLabels((all) => all.map((l, j) => (j === i ? e.target.value : l)))
                    }
                  />
                  <Checkbox
                    label={`Always send to ${r.email}`}
                    description="For someone who signs every time, like your own countersigner."
                    checked={keep[i] ?? false}
                    onCheckedChange={(checked) =>
                      setKeep((all) => all.map((k, j) => (j === i ? checked === true : k)))
                    }
                  />
                </div>
              ))}
            </fieldset>
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                Save template
              </Button>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
