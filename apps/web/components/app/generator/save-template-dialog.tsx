"use client"

import { useState } from "react"
import { ButtonLink } from "@/components/app/button-link"
import { DialogActions } from "@/components/app/confirm-dialog"
import { Button } from "@/components/arc/button/button"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ApiError, api } from "@/lib/api"
import { templateChoices } from "@/lib/generator"
import { useGenerator } from "./generator-context"

/**
 * Save as template (docs/ai-documents.md → Templates): the wording, blanks and signers of the
 * current version, for anyone in the workspace to start from. Values and contacts are cleared
 * unless ticked here, so a template doesn't carry one person's details into the next document.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { detail } = useGenerator()
  const choices = templateChoices(detail.version.data)
  const [name, setName] = useState(detail.version.data.title)
  const [description, setDescription] = useState("")
  const [keepValues, setKeepValues] = useState<string[]>([])
  const [keepContacts, setKeepContacts] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const toggle = (list: string[], key: string, on: boolean) =>
    on ? [...list, key] : list.filter((k) => k !== key)

  const reset = () => {
    setName(detail.version.data.title)
    setDescription("")
    setKeepValues([])
    setKeepContacts([])
    setError(null)
    setSaved(false)
  }

  const close = () => {
    onOpenChange(false)
    reset()
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api(`/generated-documents/${encodeURIComponent(detail.document.id)}/template`, {
        method: "POST",
        json: {
          versionId: detail.version.id,
          name: name.trim(),
          description: description.trim() || undefined,
          // Sent in the order offered, which is the document's order.
          keepValues: choices.values.map((v) => v.key).filter((k) => keepValues.includes(k)),
          keepContacts: choices.contacts.map((c) => c.key).filter((k) => keepContacts.includes(k)),
        },
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the template. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (next) onOpenChange(true)
        else close()
      }}
    >
      {saved ? (
        <DialogContent
          title="Template saved"
          description={`Anyone in the workspace can start a document from “${name.trim()}” on the Draft with AI page.`}
        >
          <DialogActions>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <ButtonLink variant="primary" href="/generate">
              Go to Draft with AI
            </ButtonLink>
          </DialogActions>
        </DialogContent>
      ) : (
        <DialogContent
          title="Save as template"
          description="The wording, blanks and signers, for anyone in the workspace to start from. Answers and contacts are left out unless you keep them."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) void save()
            }}
          >
            <Input
              label="Name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
            <Textarea
              label="Description"
              description="Optional. When to use it."
              rows={2}
              maxLength={300}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            {choices.values.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium text-sm">Keep these answers</legend>
                {choices.values.map((v) => (
                  <Checkbox
                    key={v.key}
                    label={v.label}
                    description={v.value}
                    checked={keepValues.includes(v.key)}
                    onCheckedChange={(on) => setKeepValues((l) => toggle(l, v.key, on === true))}
                  />
                ))}
              </fieldset>
            )}
            {choices.contacts.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 font-medium text-sm">Keep these signers' contacts</legend>
                {choices.contacts.map((c) => (
                  <Checkbox
                    key={c.key}
                    label={c.label}
                    description={c.contact}
                    checked={keepContacts.includes(c.key)}
                    onCheckedChange={(on) => setKeepContacts((l) => toggle(l, c.key, on === true))}
                  />
                ))}
              </fieldset>
            )}
            {error && (
              <p className="text-destructive-foreground text-sm" role="alert">
                {error}
              </p>
            )}
            <DialogActions>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!name.trim()}>
                Save template
              </Button>
            </DialogActions>
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
