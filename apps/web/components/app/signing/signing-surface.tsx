"use client"

import { CONSENT_TEXT, CONSENT_VERSION } from "@sahihi/core"
import { ArrowDownIcon } from "lucide-react"
import dynamic from "next/dynamic"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { PDFViewerHandle, PDFViewerPageOverlayProps } from "@/components/extend/pdf-viewer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toastManager } from "@/components/ui/toast"
import { ApiError, api } from "@/lib/api"
import { FIELD_LABELS } from "@/lib/constants"
import {
  displayedToLocalRect,
  type PageRotation,
  rectStyle,
  uprightContentStyle,
} from "@/lib/field-geometry"
import {
  autoFieldPreview,
  buildSubmitValues,
  completion,
  isAutoField,
  isFilled,
  isImageField,
  nextFieldToFill,
  type SignerField,
  type SignerValue,
  type SignerValues,
} from "@/lib/signing"
import { cn } from "@/lib/utils"
import { SignatureCaptureDialog, type SignatureKind } from "./signature-capture-dialog"

const SigningViewer = dynamic(() => import("./signing-viewer"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
})

interface SurfaceContextValue {
  fields: SignerField[]
  values: SignerValues
  activeId: string | null
  missing: Set<string>
  recipient: { name: string; email: string | null }
  /** Intrinsic /Rotate of a page (1-based), from Document.pages. */
  rotationOf: (page: number) => PageRotation
  activate: (field: SignerField) => void
  setValue: (fieldId: string, value: SignerValue | undefined) => void
}
const SurfaceContext = createContext<SurfaceContextValue | null>(null)
const useSurface = () => {
  const ctx = useContext(SurfaceContext)
  if (!ctx) throw new Error("useSurface outside SigningSurface")
  return ctx
}

/** The field's value if it has the expected kind. */
function fieldValue<K extends SignerValue["kind"]>(
  values: SignerValues,
  id: string,
  kind: K,
): Extract<SignerValue, { kind: K }> | undefined {
  const v = values[id]
  return v?.kind === kind ? (v as Extract<SignerValue, { kind: K }>) : undefined
}

/**
 * The overlay's local frame is the page before its own /Rotate (EmbedPDF's rotate wrapper), so
 * position with the displayed rect converted to local, and turn the content back upright.
 */
function Upright({
  rotation,
  className,
  children,
}: {
  rotation: PageRotation
  className?: string
  children: React.ReactNode
}) {
  return (
    <span style={uprightContentStyle(rotation)} className={cn("flex items-center", className)}>
      {children}
    </span>
  )
}

// Stable reference: the viewer memoizes page rendering on renderPageOverlay.
const renderPageOverlay = (p: PDFViewerPageOverlayProps) => <SignerFieldLayer page={p.pageNumber} />

/** This recipient's fields on one page. Only their own fields are ever sent by the API. */
function SignerFieldLayer({ page }: { page: number }) {
  const { fields, values, activeId, missing, recipient, rotationOf, activate, setValue } =
    useSurface()
  const rot = rotationOf(page)
  return (
    <div className="pointer-events-none absolute inset-0">
      {fields
        .filter((f) => f.page === page)
        .map((f) => {
          const style = {
            ...rectStyle(displayedToLocalRect(f, rot)),
            containerType: "size",
          } as const
          const label = f.label || FIELD_LABELS[f.type]
          const filled = isFilled(f, values)
          const tone = cn(
            "absolute overflow-hidden rounded-sm border-2 text-left text-[11px] leading-none",
            filled ? "border-success bg-success/10" : "border-warning bg-warning/15",
            missing.has(f.id) && !filled && "border-destructive bg-destructive/10",
            activeId === f.id && "ring-2 ring-ring ring-offset-1",
          )
          // Keep the viewer's own pointer handling (text selection) out of our clicks.
          const stop = { onPointerDownCapture: (e: React.PointerEvent) => e.stopPropagation() }

          if (isAutoField(f)) {
            return (
              <div
                key={f.id}
                data-field-id={f.id}
                style={style}
                title={`${label} (filled in automatically)`}
                className={cn(tone, "border-muted-foreground/40 border-dashed bg-muted/40")}
              >
                <Upright rotation={rot} className="px-1">
                  <span className="truncate text-muted-foreground">
                    {autoFieldPreview(f.type, recipient)}
                  </span>
                </Upright>
              </div>
            )
          }

          if (f.type === "CHECKBOX") {
            const checked = fieldValue(values, f.id, "checkbox")?.checked ?? false
            return (
              <div key={f.id} style={style} className="pointer-events-auto absolute" {...stop}>
                <Upright rotation={rot} className="justify-center">
                  <Checkbox
                    data-field-id={f.id}
                    aria-label={`${label}${f.required ? " (required)" : ""}`}
                    checked={checked}
                    onCheckedChange={(c) => {
                      activate(f)
                      setValue(f.id, { kind: "checkbox", checked: c === true })
                    }}
                    className={cn(
                      "size-full min-h-3 min-w-3",
                      missing.has(f.id) && !checked && "border-destructive",
                      activeId === f.id && "ring-2 ring-ring ring-offset-1",
                    )}
                  />
                </Upright>
              </div>
            )
          }

          if (f.type === "TEXT") {
            const text = fieldValue(values, f.id, "text")?.value ?? ""
            return (
              <Popover key={f.id} open={activeId === f.id} onOpenChange={(o) => !o && activate(f)}>
                <PopoverTrigger
                  data-field-id={f.id}
                  aria-label={`${label}${f.required ? " (required)" : ""}`}
                  style={style}
                  className={cn(tone, "pointer-events-auto")}
                  {...stop}
                  onClick={() => activate(f)}
                >
                  <Upright rotation={rot} className="px-1">
                    <span className={cn("truncate", !text && "text-muted-foreground")}>
                      {text || `${label}${f.required ? " *" : ""}`}
                    </span>
                  </Upright>
                </PopoverTrigger>
                <PopoverPopup className="w-72">
                  <Field>
                    <FieldLabel>{label}</FieldLabel>
                    <Input
                      autoFocus
                      value={text}
                      maxLength={500}
                      onChange={(e) => setValue(f.id, { kind: "text", value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") activate(f)
                      }}
                    />
                  </Field>
                </PopoverPopup>
              </Popover>
            )
          }

          // SIGNATURE / INITIALS
          const img = fieldValue(values, f.id, "image")?.dataUrl ?? null
          return (
            <button
              key={f.id}
              type="button"
              data-field-id={f.id}
              aria-label={`${img ? "Change" : "Add"} ${label.toLowerCase()}${f.required ? " (required)" : ""}`}
              style={style}
              className={cn(tone, "pointer-events-auto")}
              {...stop}
              onClick={() => activate(f)}
            >
              <Upright rotation={rot} className="justify-center">
                {img ? (
                  // biome-ignore lint/performance/noImgElement: local data URL of the signer's own signature
                  <img src={img} alt="" className="size-full object-contain" />
                ) : (
                  <span className="font-medium">
                    {f.type === "INITIALS" ? "Initial" : "Sign"}
                    {f.required ? " *" : ""}
                  </span>
                )}
              </Upright>
            </button>
          )
        })}
    </div>
  )
}

export function SigningSurface({
  base,
  session,
  onDone,
}: {
  base: string
  session: {
    envelope: {
      title: string
      message: string | null
      organization: { name: string }
      sender: { name: string }
    }
    recipient: { name: string; email?: string | null }
    document: { name: string; pages: { rotation: number }[] | null }
    fields: SignerField[]
  }
  onDone: () => void
}) {
  const fields = session.fields
  const recipient = useMemo(
    () => ({ name: session.recipient.name, email: session.recipient.email ?? null }),
    [session.recipient.name, session.recipient.email],
  )
  const viewerRef = useRef<PDFViewerHandle | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState(false)
  const [values, setValues] = useState<SignerValues>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const [capture, setCapture] = useState<{ fieldId: string; kind: SignatureKind } | null>(null)
  const [adopted, setAdopted] = useState<Record<SignatureKind, string | null>>({
    signature: null,
    initials: null,
  })
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [declining, setDeclining] = useState(false)

  // First call marks the recipient VIEWED (and audits it) on the server.
  useEffect(() => {
    api<{ url: string }>(`${base}/file`).then(
      (r) => setFileUrl(r.url),
      () => setFileError(true),
    )
  }, [base])

  const setValue = useCallback((fieldId: string, value: SignerValue | undefined) => {
    setValues((v) => ({ ...v, [fieldId]: value }))
  }, [])

  const activate = useCallback((f: SignerField) => {
    setActiveId((cur) => (f.type === "TEXT" && cur === f.id ? null : f.id))
    if (isImageField(f))
      setCapture({ fieldId: f.id, kind: f.type === "INITIALS" ? "initials" : "signature" })
  }, [])

  const goTo = useCallback((f: SignerField) => {
    viewerRef.current?.scrollToPageArea(
      f.page,
      { top: f.y * 100, left: f.x * 100, width: f.width * 100, height: f.height * 100 },
      { behavior: "smooth" },
    )
    setActiveId(f.id)
    // Focus the field once it's been scrolled into view.
    setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-field-id="${f.id}"]`)
        ?.focus({ preventScroll: true })
    }, 350)
  }, [])

  const progress = completion(fields, values)
  const next = nextFieldToFill(fields, values, activeId)
  const complete = progress.done === progress.total
  const pages = session.document.pages
  const rotationOf = useCallback(
    (page: number): PageRotation => {
      const r = pages?.[page - 1]?.rotation
      return r === 90 || r === 180 || r === 270 ? r : 0
    },
    [pages],
  )
  const ctx = useMemo(
    () => ({ fields, values, activeId, missing, recipient, rotationOf, activate, setValue }),
    [fields, values, activeId, missing, recipient, rotationOf, activate, setValue],
  )

  async function submit() {
    const pending = fields.filter((f) => f.required && !isFilled(f, values))
    if (pending.length > 0) {
      setMissing(new Set(pending.map((f) => f.id)))
      if (pending[0]) goTo(pending[0])
      return
    }
    setSubmitting(true)
    try {
      await api(`${base}/submit`, {
        method: "POST",
        json: {
          consent: true,
          consentVersion: CONSENT_VERSION,
          values: buildSubmitValues(fields, values),
        },
      })
      onDone()
    } catch (err) {
      const body =
        err instanceof ApiError
          ? (err.body as { error?: string; fieldIds?: string[] } | null)
          : null
      if (body?.error === "consent_outdated") {
        // The wording changed since this page loaded (a new deploy). Only a reload shows the new
        // text, so the signer must review it and sign again.
        toastManager.add({
          title: "The signing terms were updated",
          description: "Please review them and sign again.",
          type: "warning",
        })
        setTimeout(() => window.location.reload(), 2500)
      } else if (body?.error === "missing_required_fields" && body.fieldIds) {
        setMissing(new Set(body.fieldIds))
        const first = fields.find((f) => body.fieldIds?.includes(f.id))
        if (first) goTo(first)
      } else if (err instanceof ApiError && err.status === 409) {
        onDone() // already submitted (another tab) or the envelope changed: reload the state
      } else {
        toastManager.add({
          title: "Could not submit",
          description: err instanceof Error ? err.message : "Please try again.",
          type: "error",
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function decline() {
    setDeclining(true)
    try {
      await api(`${base}/decline`, { method: "POST", json: { reason: declineReason.trim() } })
      onDone()
    } catch (err) {
      toastManager.add({
        title: "Could not decline",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
      setDeclining(false)
    }
  }

  const captureField = capture ? fields.find((f) => f.id === capture.fieldId) : null

  return (
    <SurfaceContext.Provider value={ctx}>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{session.envelope.title}</CardTitle>
            <CardDescription>
              {session.envelope.sender.name} ({session.envelope.organization.name}) asked you to
              sign {session.document.name}.
            </CardDescription>
          </CardHeader>
          {session.envelope.message && (
            <CardPanel>
              <p className="whitespace-pre-line text-sm">{session.envelope.message}</p>
            </CardPanel>
          )}
        </Card>

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
          <Progress
            value={progress.total ? (progress.done / progress.total) * 100 : 100}
            className="w-40"
          />
          <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {progress.done} of {progress.total} required
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={!next}
            onClick={() => next && goTo(next)}
          >
            <ArrowDownIcon aria-hidden />
            {complete ? "Next optional field" : "Next field"}
          </Button>
        </div>

        <div className="h-[70dvh] min-h-96 overflow-hidden rounded-xl border">
          {fileError ? (
            <Alert variant="error" className="m-4 w-auto">
              <AlertDescription>
                The document could not be loaded. Refresh to try again.
              </AlertDescription>
            </Alert>
          ) : fileUrl ? (
            <SigningViewer
              src={fileUrl}
              fileName={session.document.name}
              handleRef={viewerRef}
              renderPageOverlay={renderPageOverlay}
            />
          ) : (
            <Skeleton className="size-full" />
          )}
        </div>

        <Card>
          <CardPanel className="flex flex-col gap-4">
            {missing.size > 0 && !complete && (
              <Alert variant="warning">
                <AlertTitle>Some required fields are empty</AlertTitle>
                <AlertDescription>
                  They're outlined in red. Use “Next field” to go through them.
                </AlertDescription>
              </Alert>
            )}
            <Label className="flex items-start gap-3 font-normal">
              <Checkbox
                checked={consent}
                onCheckedChange={(c) => setConsent(c === true)}
                className="mt-0.5"
              />
              <span className="text-sm">{CONSENT_TEXT}</span>
            </Label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="ghost" disabled={submitting} />}>
                  Decline to sign
                </AlertDialogTrigger>
                <AlertDialogPopup>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline to sign?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The sender is told you declined and the envelope is closed for everyone. This
                      can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="px-6">
                    <Field>
                      <FieldLabel>Reason (shared with the sender)</FieldLabel>
                      <Textarea
                        value={declineReason}
                        maxLength={500}
                        rows={3}
                        onChange={(e) => setDeclineReason(e.target.value)}
                      />
                    </Field>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogClose render={<Button variant="ghost" disabled={declining} />}>
                      Cancel
                    </AlertDialogClose>
                    <Button
                      variant="destructive"
                      disabled={declining || !declineReason.trim()}
                      onClick={decline}
                    >
                      {declining && <Spinner aria-hidden />}
                      Decline
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogPopup>
              </AlertDialog>
              <Button onClick={submit} disabled={!consent || submitting}>
                {submitting && <Spinner aria-hidden />}
                {complete
                  ? "Finish signing"
                  : `Finish signing (${progress.total - progress.done} left)`}
              </Button>
            </div>
          </CardPanel>
        </Card>
      </div>

      <SignatureCaptureDialog
        open={capture !== null}
        onOpenChange={(o) => !o && setCapture(null)}
        kind={capture?.kind ?? "signature"}
        signerName={recipient.name}
        adopted={capture ? adopted[capture.kind] : null}
        onConfirm={(dataUrl) => {
          if (!captureField || !capture) return
          setValue(captureField.id, { kind: "image", dataUrl })
          setAdopted((a) => ({ ...a, [capture.kind]: dataUrl }))
          const after = nextFieldToFill(
            fields,
            { ...values, [captureField.id]: { kind: "image", dataUrl } },
            captureField.id,
          )
          if (after) setActiveId(after.id)
        }}
      />
    </SurfaceContext.Provider>
  )
}
