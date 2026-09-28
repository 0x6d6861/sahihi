"use client"

import { CalendarIcon, XIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Form } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { envelopeTitleFromFileName } from "@/lib/documents"
import { buildCreateEnvelopeInput, type FormErrors, issuesToFormErrors } from "@/lib/envelope-form"

export interface ReadyDocument {
  id: string
  name: string
}

const dateLabel = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" })

function startOfToday() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Step 1 of drafting: document + envelope settings → DRAFT, then the envelope page. */
export function NewEnvelopeForm({
  documents,
  defaultDocumentId,
}: {
  documents: ReadyDocument[]
  defaultDocumentId?: string
}) {
  const router = useRouter()
  const initial = documents.find((d) => d.id === defaultDocumentId)
  const [documentId, setDocumentId] = useState(initial?.id ?? "")
  const [title, setTitle] = useState(initial ? envelopeTitleFromFileName(initial.name) : "")
  const [titleEdited, setTitleEdited] = useState(false)
  const [message, setMessage] = useState("")
  const [sequential, setSequential] = useState(false)
  const [expiresOn, setExpiresOn] = useState<Date | null>(null)
  const [dateOpen, setDateOpen] = useState(false)
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
        json: built.input,
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
    <Form className="flex flex-col gap-5" errors={errors} onSubmit={onSubmit}>
      <Field name="documentId">
        <FieldLabel>Document</FieldLabel>
        <Select
          items={documents.map((d) => ({ value: d.id, label: d.name }))}
          value={documentId || null}
          onValueChange={(v) => chooseDocument(String(v ?? ""))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a ready PDF" />
          </SelectTrigger>
          <SelectPopup>
            {documents.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <FieldError />
      </Field>

      <Field name="title">
        <FieldLabel>Title</FieldLabel>
        <Input
          value={title}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleEdited(true)
          }}
        />
        <FieldDescription>Recipients see this in the email subject.</FieldDescription>
        <FieldError />
      </Field>

      <Field name="message">
        <FieldLabel>Message (optional)</FieldLabel>
        <Textarea
          value={message}
          maxLength={2000}
          rows={4}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi, please review and sign."
        />
        <FieldError />
      </Field>

      <Field name="signingOrder">
        <FieldLabel className="flex items-center gap-3">
          <Switch checked={sequential} onCheckedChange={setSequential} />
          Sign in order
        </FieldLabel>
        <FieldDescription>
          {sequential
            ? "Recipients are invited one after another, following their order."
            : "Everyone is invited at the same time."}
        </FieldDescription>
      </Field>

      <Field name="expiresAt">
        <FieldLabel>Expires (optional)</FieldLabel>
        <div className="flex items-center gap-2">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger render={<Button variant="outline" className="justify-start" />}>
              <CalendarIcon aria-hidden />
              {expiresOn ? dateLabel.format(expiresOn) : "No expiry"}
            </PopoverTrigger>
            <PopoverPopup align="start">
              <Calendar
                mode="single"
                selected={expiresOn ?? undefined}
                onSelect={(day: Date | undefined) => {
                  setExpiresOn(day ?? null)
                  setDateOpen(false)
                }}
                disabled={{ before: startOfToday() }}
                defaultMonth={expiresOn ?? undefined}
              />
            </PopoverPopup>
          </Popover>
          {expiresOn && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear expiry"
              onClick={() => setExpiresOn(null)}
            >
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
        <FieldDescription>Links stop working at the end of this day.</FieldDescription>
        <FieldError />
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create draft"}
        </Button>
      </div>
    </Form>
  )
}
