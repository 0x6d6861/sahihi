"use client"

import {
  CreateWebhookSchema,
  WEBHOOK_EVENT_DESCRIPTIONS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckboxGroup } from "@/components/ui/checkbox-group"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"
import { SecretReveal } from "./secret-reveal"

export interface WebhookFormValues {
  id?: string
  url: string
  description: string | null
  events: string[]
}

/**
 * Add or edit an endpoint (docs/webhooks.md). After "Add", the signing secret is shown once.
 * Controlled by the parent so it can open from a button or a menu item.
 */
export function WebhookFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: WebhookFormValues
}) {
  const router = useRouter()
  const editing = Boolean(initial?.id)
  const [url, setUrl] = useState(initial?.url ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [events, setEvents] = useState<string[]>(
    initial?.events ?? ["envelope.completed", "envelope.declined"],
  )
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)

  function change(next: boolean) {
    if (pending) return
    onOpenChange(next)
    if (next) {
      setUrl(initial?.url ?? "")
      setDescription(initial?.description ?? "")
      setEvents(initial?.events ?? ["envelope.completed", "envelope.declined"])
      setErrors({})
      setSecret(null)
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = CreateWebhookSchema.safeParse({
      url,
      description: description.trim() || undefined,
      events,
    })
    if (!parsed.success) return setErrors(issuesToFormErrors(parsed.error.issues))
    setErrors({})
    setPending(true)
    try {
      if (editing) {
        await api(`/webhooks/${initial?.id}`, {
          method: "PATCH",
          json: { ...parsed.data, description: parsed.data.description ?? null },
        })
        toastManager.add({ title: "Webhook updated", type: "success" })
        onOpenChange(false)
      } else {
        const res = await api<{ secret: string }>("/webhooks", {
          method: "POST",
          json: parsed.data,
        })
        setSecret(res.secret)
      }
      router.refresh()
    } catch (err) {
      if (err instanceof ApiError && err.body?.issues?.length) {
        setErrors(issuesToFormErrors(err.body.issues))
      } else {
        toastManager.add({
          title: editing ? "Not updated" : "Not added",
          description: err instanceof Error ? err.message : undefined,
          type: "error",
        })
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit webhook" : "Add a webhook"}</DialogTitle>
          <DialogDescription>
            Sahihi POSTs signed JSON to this URL when the events you pick happen in this workspace.
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <DialogPanel>
              <SecretReveal secret={secret} />
            </DialogPanel>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <Form errors={errors} onSubmit={onSubmit} className="contents">
            <DialogPanel className="flex flex-col gap-5">
              <Field name="url">
                <FieldLabel>Endpoint URL</FieldLabel>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://erp.example.co.ke/webhooks/sahihi"
                />
                <FieldDescription>HTTPS, reachable from the internet.</FieldDescription>
                <FieldError />
              </Field>
              <Field name="description">
                <FieldLabel>Description (optional)</FieldLabel>
                <Input
                  value={description}
                  maxLength={200}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Contracts sync in our ERP"
                />
                <FieldError />
              </Field>
              <Field name="events">
                <FieldLabel>Events</FieldLabel>
                <CheckboxGroup value={events} onValueChange={(v) => setEvents(v as string[])}>
                  {WEBHOOK_EVENT_TYPES.map((type: WebhookEventType) => (
                    <Label key={type} className="flex items-start gap-2 font-normal">
                      <Checkbox name="events" value={type} />
                      <span className="flex flex-col">
                        <span className="font-mono text-xs">{type}</span>
                        <span className="text-muted-foreground text-xs">
                          {WEBHOOK_EVENT_DESCRIPTIONS[type]}
                        </span>
                      </span>
                    </Label>
                  ))}
                </CheckboxGroup>
                <FieldError />
              </Field>
            </DialogPanel>
            <DialogFooter>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => change(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner aria-hidden />}
                {editing ? "Save" : "Add webhook"}
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogPopup>
    </Dialog>
  )
}
