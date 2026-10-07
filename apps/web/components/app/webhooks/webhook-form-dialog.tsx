"use client"

import {
  CreateWebhookSchema,
  WEBHOOK_EVENT_DESCRIPTIONS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from "@sahihi/core"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { DialogActions } from "@/components/app/confirm-dialog"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
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
      <DialogContent
        title={secret ? "Copy the signing secret" : editing ? "Edit webhook" : "Add a webhook"}
        description="Sahihi POSTs signed JSON to this URL when the events you pick happen in this workspace."
      >
        {secret ? (
          <div className="flex flex-col gap-4">
            <SecretReveal secret={secret} />
            <DialogActions>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogActions>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Input
              label="Endpoint URL"
              name="url"
              type="url"
              value={url}
              description="HTTPS, reachable from the internet."
              error={errors.url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://erp.example.co.ke/webhooks/sahihi"
            />
            <Input
              label="Description (optional)"
              name="description"
              value={description}
              maxLength={200}
              error={errors.description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="For example, contracts sync in our ERP"
            />
            <fieldset className="flex flex-col gap-3">
              <legend className="pb-3 font-medium text-sm">Events</legend>
              {WEBHOOK_EVENT_TYPES.map((type: WebhookEventType) => (
                <Checkbox
                  key={type}
                  name="events"
                  value={type}
                  label={type}
                  description={WEBHOOK_EVENT_DESCRIPTIONS[type]}
                  checked={events.includes(type)}
                  onCheckedChange={(checked) =>
                    setEvents((all) =>
                      checked === true ? [...all, type] : all.filter((x) => x !== type),
                    )
                  }
                />
              ))}
              {errors.events && (
                <p role="alert" className="text-destructive-foreground text-sm">
                  {errors.events}
                </p>
              )}
            </fieldset>
            <DialogActions>
              <Button
                variant="ghost"
                type="button"
                disabled={pending}
                onClick={() => change(false)}
              >
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {editing ? "Save" : "Add webhook"}
              </Button>
            </DialogActions>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
