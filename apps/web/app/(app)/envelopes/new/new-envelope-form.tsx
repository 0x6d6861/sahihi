"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { Combobox } from "@/components/arc/combobox/combobox"
import { DatePicker } from "@/components/arc/date-picker/date-picker"
import { Input } from "@/components/arc/input/input"
import { Switch } from "@/components/arc/switch/switch"
import { Textarea } from "@/components/arc/textarea/textarea"
import { ApiError, api } from "@/lib/api"
import { envelopeTitleFromFileName } from "@/lib/documents"
import { buildCreateEnvelopeInput, type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

export interface ReadyDocument {
  id: string
  name: string
}

function startOfToday() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Step 1 of drafting: document + envelope settings → DRAFT, then the envelope page. */
export function NewEnvelopeForm({
  documents,
  defaultDocumentId,
  folderId,
}: {
  documents: ReadyDocument[]
  defaultDocumentId?: string
  /** Folder the draft lands in (ADR 0038); omitted = top level. */
  folderId?: string
}) {
  const router = useRouter()
  const initial = documents.find((d) => d.id === defaultDocumentId)
  const [documentId, setDocumentId] = useState(initial?.id ?? "")
  const [title, setTitle] = useState(initial ? envelopeTitleFromFileName(initial.name) : "")
  const [titleEdited, setTitleEdited] = useState(false)
  const [message, setMessage] = useState("")
  const [sequential, setSequential] = useState(false)
  const [expiresOn, setExpiresOn] = useState<Date | null>(null)
  const [errors, setErrors] = useState<FormErrors>({})
  const [pending, setPending] = useState(false)

  function chooseDocument(id: string) {
    setDocumentId(id)
    const doc = documents.find((d) => d.id === id)
    // Suggest a title from the file name until the sender types their own.
    if (doc && !titleEdited) setTitle(envelopeTitleFromFileName(doc.name))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const built = buildCreateEnvelopeInput({ documentId, title, message, sequential, expiresOn })
    if (!built.ok) return setErrors(built.errors)
    setErrors({})
    setPending(true)
    try {
      const { envelope } = await api<{ envelope: { id: string } }>("/envelopes", {
        method: "POST",
        json: { ...built.input, folderId },
      })
      router.push(`/envelopes/${envelope.id}`)
    } catch (err) {
      setPending(false)
      if (err instanceof ApiError && err.body?.issues?.length) {
        return setErrors(issuesToFormErrors(err.body.issues))
      }
      toastManager.add({
        title: "Could not create envelope",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    }
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <Combobox
          label="Document"
          name="documentId"
          options={documents.map((d) => ({ value: d.id, label: d.name }))}
          value={documentId}
          onValueChange={chooseDocument}
          placeholder="Choose a ready PDF"
          emptyMessage="No ready document matches"
        />
        {errors.documentId && (
          <p role="alert" className="text-destructive-foreground text-sm">
            {errors.documentId}
          </p>
        )}
      </div>

      <Input
        label="Title"
        name="title"
        value={title}
        maxLength={200}
        description="Recipients see this in the email subject."
        error={errors.title}
        onChange={(e) => {
          setTitle(e.target.value)
          setTitleEdited(true)
        }}
      />

      <Textarea
        label="Message (optional)"
        name="message"
        value={message}
        maxLength={2000}
        rows={4}
        error={errors.message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Hi, please review and sign."
      />

      <div className="flex flex-col gap-1.5">
        <Switch label="Sign in order" checked={sequential} onCheckedChange={setSequential} />
        <p className="text-muted-foreground text-sm">
          {sequential
            ? "Recipients are invited one after another, following their order."
            : "Everyone is invited at the same time."}
        </p>
      </div>

      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <DatePicker
            label="Expires (optional)"
            value={expiresOn ?? undefined}
            onChange={(day) => setExpiresOn(day ?? null)}
            minDate={startOfToday()}
            placeholder="No expiry"
            locale="en-GB"
            description={errors.expiresAt ?? "Links stop working at the end of this day."}
          />
        </div>
        {expiresOn && (
          <Button type="button" variant="ghost" onClick={() => setExpiresOn(null)}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Create draft
        </Button>
      </div>
    </form>
  )
}
