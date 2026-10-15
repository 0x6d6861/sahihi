"use client"

import { CONSENT_TEXT, CONSENT_VERSION, documentsSummary, offersSavedSignature } from "@sahihi/core"
import dynamic from "next/dynamic"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/app/button"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { AttachmentsList } from "@/components/app/envelope/attachments-list"
import { DocumentSwitcher } from "@/components/app/envelope/document-switcher"
import { ArrowDownIcon, CheckIcon } from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { Alert } from "@/components/arc/alert/alert"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Input } from "@/components/arc/input/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { Progress } from "@/components/arc/progress/progress"
import { Textarea } from "@/components/arc/textarea/textarea"
import type { PDFViewerHandle, PDFViewerPageOverlayProps } from "@/components/extend/pdf-viewer"
// coss on the PDF itself: a checkbox field stretches to its box (Arc's is fixed-size), and the
// viewer placeholder is a block the size of the page (Arc's skeleton draws text lines).
import { Checkbox as FieldCheckbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { brandingLogoPath } from "@/lib/account"
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
  orderFields,
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
  /** The document on screen (ADR 0037); only its fields are drawn. */
  activeDocumentId: string
  /** Intrinsic /Rotate of a page (1-based) of the document on screen, from Document.pages. */
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
  const {
    fields,
    values,
    activeId,
    missing,
    recipient,
    activeDocumentId,
    rotationOf,
    activate,
    setValue,
  } = useSurface()
  const rot = rotationOf(page)
  return (
    <div className="on-paper pointer-events-none absolute inset-0">
      {fields
        .filter((f) => f.page === page && f.envelopeDocumentId === activeDocumentId)
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
                  <FieldCheckbox
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
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-field-id={f.id}
                    aria-label={`${label}${f.required ? " (required)" : ""}`}
                    style={style}
                    className={cn(tone, "press pointer-events-auto")}
                    {...stop}
                    onClick={() => activate(f)}
                  >
                    <Upright rotation={rot} className="px-1">
                      <span className={cn("truncate", !text && "text-muted-foreground")}>
                        {text || `${label}${f.required ? " *" : ""}`}
                      </span>
                    </Upright>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <Input
                    label={label}
                    autoFocus
                    value={text}
                    maxLength={500}
                    onChange={(e) => setValue(f.id, { kind: "text", value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") activate(f)
                    }}
                  />
                </PopoverContent>
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
              className={cn(tone, "press pointer-events-auto")}
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
      organization: { name: string; logo?: string | null }
      sender: { name: string }
    }
    recipient: { name: string; email?: string | null }
    /** In signing order (ADR 0037). */
    documents: { id: string; name: string; pages: { rotation: number }[] | null }[]
    /** Supporting files the signer can download (ADR 0037). */
    attachments: { id: string; name: string; contentType: string; sizeBytes: number }[]
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
  const documents = session.documents
  const [activeDocumentId, setActiveDocumentId] = useState(documents[0]?.id ?? "")
  const activeDocument = documents.find((d) => d.id === activeDocumentId) ?? documents[0]
  // Each document's original, fetched the first time it's shown (presigned, short-lived).
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({})
  const [fileError, setFileError] = useState(false)
  const fileUrl = activeDocument ? (fileUrls[activeDocument.id] ?? null) : null
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
  const [declineOpen, setDeclineOpen] = useState(false)
  const [termsUpdated, setTermsUpdated] = useState(false)

  // Signed in as this recipient? Offer the signature and initials saved in Settings → Profile.
  // Signed-out signers (and embedded iframes, which get no cookie) get a 401 and nothing changes.
  useEffect(() => {
    if (!recipient.email) return
    let cancelled = false
    api<{ email: string; signature: string | null; initials: string | null }>("/me/signatures")
      .then((saved) => {
        if (cancelled || !offersSavedSignature(saved.email, recipient.email)) return
        setAdopted((a) => ({
          signature: a.signature ?? saved.signature,
          initials: a.initials ?? saved.initials,
        }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [recipient.email])

  // The first call for any document marks the recipient VIEWED (and audits it) on the server.
  useEffect(() => {
    const id = activeDocument?.id
    if (!id || fileUrls[id]) return
    setFileError(false)
    api<{ url: string }>(`${base}/file?document=${encodeURIComponent(id)}`).then(
      (r) => setFileUrls((u) => ({ ...u, [id]: r.url })),
      () => setFileError(true),
    )
  }, [base, activeDocument?.id, fileUrls])

  const setValue = useCallback((fieldId: string, value: SignerValue | undefined) => {
    setValues((v) => ({ ...v, [fieldId]: value }))
  }, [])

  const activate = useCallback((f: SignerField) => {
    setActiveId((cur) => (f.type === "TEXT" && cur === f.id ? null : f.id))
    if (isImageField(f))
      setCapture({ fieldId: f.id, kind: f.type === "INITIALS" ? "initials" : "signature" })
  }, [])

  // A field on another document: switch to it, then keep trying to scroll until its viewer has
  // loaded (up to ~3s), and focus the field once it's on screen.
  const pendingRef = useRef<number | null>(null)
  const goTo = useCallback(
    (f: SignerField) => {
      if (pendingRef.current) window.clearInterval(pendingRef.current)
      const switching = f.envelopeDocumentId !== activeDocumentId
      if (switching) setActiveDocumentId(f.envelopeDocumentId)
      setActiveId(f.id)
      const area = { top: f.y * 100, left: f.x * 100, width: f.width * 100, height: f.height * 100 }
      let tries = 0
      const attempt = () => {
        tries += 1
        viewerRef.current?.scrollToPageArea(f.page, area, {
          behavior: switching ? "auto" : "smooth",
        })
        const el = document.querySelector<HTMLElement>(`[data-field-id="${f.id}"]`)
        if (el || tries > 15) {
          if (pendingRef.current) window.clearInterval(pendingRef.current)
          pendingRef.current = null
          // Focus once it's been scrolled into view.
          setTimeout(() => el?.focus({ preventScroll: true }), switching ? 50 : 350)
        }
      }
      if (switching) pendingRef.current = window.setInterval(attempt, 200)
      else attempt()
    },
    [activeDocumentId],
  )
  useEffect(
    () => () => {
      if (pendingRef.current) window.clearInterval(pendingRef.current)
    },
    [],
  )
  const remainingOn = (id: string) =>
    fields.filter((f) => f.envelopeDocumentId === id && f.required && !isFilled(f, values)).length

  const progress = completion(fields, values)
  const next = nextFieldToFill(fields, values, activeId)
  const complete = progress.done === progress.total
  const pages = activeDocument?.pages ?? null
  const rotationOf = useCallback(
    (page: number): PageRotation => {
      const r = pages?.[page - 1]?.rotation
      return r === 90 || r === 180 || r === 270 ? r : 0
    },
    [pages],
  )
  const ctx = useMemo(
    () => ({
      fields,
      values,
      activeId,
      missing,
      recipient,
      activeDocumentId: activeDocument?.id ?? "",
      rotationOf,
      activate,
      setValue,
    }),
    [
      fields,
      values,
      activeId,
      missing,
      recipient,
      activeDocument?.id,
      rotationOf,
      activate,
      setValue,
    ],
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
        setTermsUpdated(true)
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
    try {
      await api(`${base}/decline`, { method: "POST", json: { reason: declineReason.trim() } })
      onDone()
    } catch (err) {
      toastManager.add({
        title: "Could not decline",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
      throw err
    }
  }

  const captureField = capture ? fields.find((f) => f.id === capture.fieldId) : null
  const logoPath = brandingLogoPath(session.envelope.organization.logo)

  // The side list: the fields this signer fills, in reading order (auto-filled ones excluded).
  const ownFields = orderFields(fields).filter((f) => !isAutoField(f))
  const left = progress.total - progress.done

  return (
    <SurfaceContext.Provider value={ctx}>
      <div className="flex flex-col gap-4">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {logoPath && (
              // Logos are drawn for white backgrounds (emails), so they sit on paper in dark mode too.
              <span className="on-paper shrink-0 rounded-lg bg-background px-2 py-1">
                {/* biome-ignore lint/performance/noImgElement: same-origin branding route */}
                <img
                  src={logoPath}
                  alt={session.envelope.organization.name}
                  className="h-8 w-auto max-w-32 object-contain"
                />
              </span>
            )}
            <div className="flex min-w-0 flex-col">
              <h1 className="truncate font-medium text-lg" title={session.envelope.title}>
                {session.envelope.title}
              </h1>
              <p className="truncate text-muted-foreground text-sm">
                From {session.envelope.sender.name} · {session.envelope.organization.name}
              </p>
            </div>
          </div>
          {/* Sticky on phones, so "Next field" is always one tap away. */}
          <div className="sticky top-0 z-10 flex shrink-0 items-center gap-4 bg-background py-1 max-md:-mx-1 max-md:px-1">
            <div className="flex w-36 flex-col gap-1.5">
              <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
                {progress.done} of {progress.total} required done
              </span>
              <Progress value={progress.done} max={progress.total || 1} />
            </div>
            <Button
              variant={complete ? "secondary" : "primary"}
              disabled={!next}
              onClick={() => next && goTo(next)}
            >
              <ArrowDownIcon aria-hidden />
              {complete ? "Next optional field" : "Go to next field"}
            </Button>
          </div>
        </header>

        {/* Phones: message, document, finish. From lg: the document beside a side column. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr] lg:items-start">
          <section
            aria-label="From the sender"
            className="flex flex-col gap-5 rounded-2xl border bg-card p-5 lg:col-start-2 lg:row-start-1"
          >
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <Avatar name={session.envelope.sender.name} size="sm" />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-sm">
                    {session.envelope.sender.name}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">
                    asked you to sign {documentsSummary(documents.map((d) => d.name))}
                  </span>
                </div>
              </div>
              {session.envelope.message && (
                <p className="whitespace-pre-line rounded-xl bg-muted/60 px-3.5 py-3 text-sm">
                  {session.envelope.message}
                </p>
              )}
            </div>

            {ownFields.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between pb-1.5 text-sm">
                  <h2 className="font-medium">Your fields</h2>
                  <span className="text-muted-foreground tabular-nums">
                    {left > 0 ? `${left} left` : "All done"}
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {ownFields.map((f) => {
                    const filled = isFilled(f, values)
                    const label = f.label || FIELD_LABELS[f.type]
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => goTo(f)}
                          className={cn(
                            "press flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                            activeId === f.id && "bg-primary/10",
                            missing.has(f.id) && !filled && "text-destructive-foreground",
                          )}
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{label}</span>
                            <span className="text-muted-foreground text-xs">
                              {f.required ? "Required" : "Optional"}
                              {documents.length > 1
                                ? ` · ${documents.find((d) => d.id === f.envelopeDocumentId)?.name ?? ""}`
                                : ""}
                              {` · page ${f.page}`}
                            </span>
                          </span>
                          {filled ? (
                            <CheckIcon
                              aria-label="Done"
                              className="size-4 text-success-foreground"
                            />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {session.attachments.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-medium text-sm">
                  Supporting files{" "}
                  <span className="font-normal text-muted-foreground">(to read, not to sign)</span>
                </p>
                <AttachmentsList
                  attachments={session.attachments}
                  source={{ kind: "signer", base }}
                />
              </div>
            )}
          </section>

          <div className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {documents.length > 1 && (
              <DocumentSwitcher
                documents={documents}
                value={activeDocument?.id ?? ""}
                onValueChange={(id) => {
                  setActiveDocumentId(id)
                  setActiveId(null)
                }}
                accessory={(id) => {
                  const remaining = remainingOn(id)
                  return remaining > 0 ? (
                    <span className="text-muted-foreground tabular-nums">{remaining}</span>
                  ) : (
                    <CheckIcon aria-label="Done" className="size-3.5 text-success-foreground" />
                  )
                }}
              />
            )}
            <div className="h-[70dvh] min-h-96 overflow-hidden rounded-2xl border bg-muted lg:h-[calc(100dvh-10rem)]">
              {fileError ? (
                <div className="p-4">
                  <Alert tone="danger" title="The document could not be loaded">
                    Refresh to try again.
                  </Alert>
                </div>
              ) : fileUrl ? (
                <SigningViewer
                  key={activeDocument?.id}
                  src={fileUrl}
                  fileName={activeDocument?.name ?? "document.pdf"}
                  handleRef={viewerRef}
                  renderPageOverlay={renderPageOverlay}
                />
              ) : (
                <Skeleton className="size-full" />
              )}
            </div>
          </div>

          <section
            aria-label="Finish"
            className="flex flex-col gap-4 rounded-2xl border bg-card p-5 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-2"
          >
            {missing.size > 0 && !complete && (
              <Alert tone="warning" title="Some required fields are empty">
                They're outlined in red. Use “Go to next field” to go through them.
              </Alert>
            )}
            <Checkbox
              label={CONSENT_TEXT}
              checked={consent}
              onCheckedChange={(c) => setConsent(c === true)}
            />
            <Button className="w-full" onClick={submit} loading={submitting} disabled={!consent}>
              {complete ? "Finish signing" : `Finish signing (${left} left)`}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={submitting}
              onClick={() => setDeclineOpen(true)}
            >
              Decline to sign
            </Button>
          </section>
        </div>

        <ConfirmDialog
          open={declineOpen}
          onOpenChange={setDeclineOpen}
          title="Decline to sign?"
          description="The sender is told you declined and the envelope is closed for everyone. This can't be undone."
          confirmLabel="Decline"
          disabled={!declineReason.trim()}
          onConfirm={decline}
        >
          <Textarea
            label="Reason (shared with the sender)"
            value={declineReason}
            maxLength={500}
            rows={3}
            onChange={(e) => setDeclineReason(e.target.value)}
          />
        </ConfirmDialog>
        {/* The consent wording changed since this page loaded (a new deploy): the signer reloads to
            read the new text, then signs again. A dialog, not a toast: they must act on it. */}
        <ConfirmDialog
          open={termsUpdated}
          onOpenChange={setTermsUpdated}
          title="The signing terms were updated"
          description="Reload the page to read the new wording, then sign again. What you filled in isn't kept."
          confirmLabel="Reload"
          tone="primary"
          onConfirm={() => window.location.reload()}
        />
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
