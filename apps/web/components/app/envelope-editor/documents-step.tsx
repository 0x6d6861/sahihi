"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import { Button } from "@/components/app/button"
import { ButtonLink } from "@/components/app/button-link"
import { DocumentTypeIcon } from "@/components/app/documents/document-type-icon"
import { AttachmentsList } from "@/components/app/envelope/attachments-list"
import { useDraftState } from "@/components/app/envelope/draft-state"
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EllipsisIcon,
  FilePenLineIcon,
  Trash2Icon,
} from "@/components/app/icons"
import { toastManager } from "@/components/app/toast"
import { type DropdownItem, DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { api } from "@/lib/api"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { pluralize } from "@/lib/format"
import { AddDocumentDialog } from "./add-document-dialog"
import { PrepareStep } from "./prepare-step"

/**
 * Step 1 of the draft editor (ADR 0024, 0037): the documents to sign, in signing order, and the
 * supporting files shared with the recipients, as sections on the canvas. Each document is a card
 * with Open (its library page) and a ⋯ menu that prepares its pages (the full PDF editor, which
 * saves a new document and removes that document's fields), moves it or removes it (with its
 * fields). Every change saves at once.
 */
export function DocumentsStep({
  envelope: e,
  files,
  fieldCountOf,
  onNext,
}: {
  envelope: EnvelopeDetail
  /** Presigned URL of each envelope document's original, by envelope document id. */
  files: Record<string, string | null>
  /** Fields placed right now (live) on a document, for warnings. */
  fieldCountOf: (envelopeDocumentId: string) => number
  onNext: () => void
}) {
  const router = useRouter()
  const draft = useDraftState()
  const [preparing, setPreparing] = useState<string | null>(null)
  const docs = e.documents

  const prepared = docs.find((d) => d.id === preparing)
  const preparedSrc = prepared ? files[prepared.id] : null
  if (prepared && preparedSrc) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setPreparing(null)}>
            <ArrowLeftIcon aria-hidden />
            All documents
          </Button>
          <span className="truncate text-muted-foreground text-sm">{prepared.name}</span>
        </div>
        <div className="min-h-0 flex-1">
          <PrepareStep
            key={prepared.documentId}
            envelopeId={e.id}
            envelopeDocumentId={prepared.id}
            document={{ id: prepared.documentId, name: prepared.name }}
            src={preparedSrc}
            fieldCount={fieldCountOf(prepared.id)}
            onDone={() => setPreparing(null)}
          />
        </div>
      </div>
    )
  }

  async function change(run: () => Promise<unknown>, done: string) {
    // Nothing may still be on its way to fields of a document that moves or goes.
    await draft?.settle()
    try {
      await run()
      toastManager.add({ title: done, type: "success" })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Not saved",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    }
  }

  const move = (index: number, by: -1 | 1) => {
    const order = docs.map((d) => d.id)
    const [item] = order.splice(index, 1)
    order.splice(index + by, 0, item as string)
    void change(
      () =>
        api(`/envelopes/${e.id}/documents/order`, {
          method: "PUT",
          json: { envelopeDocumentIds: order },
        }),
      "Order saved",
    )
  }

  const remove = (id: string, name: string) =>
    change(
      () => api(`/envelopes/${e.id}/documents/${id}`, { method: "DELETE" }),
      `Removed “${name}”`,
    )

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10 px-4 py-6 md:py-10">
      <StepSection
        title="Documents to sign"
        description="Signed in this order. Each becomes its own signed PDF, and one certificate covers them all."
      >
        <ol className="flex flex-col gap-2">
          {docs.map((d, i) => {
            const fields = fieldCountOf(d.id)
            const items: DropdownItem[] = [
              {
                label: "Prepare pages…",
                icon: <FilePenLineIcon />,
                disabled: !files[d.id],
                onSelect: () => setPreparing(d.id),
              },
              ...(i > 0
                ? [
                    {
                      label: "Move up",
                      icon: <ArrowDownIcon className="rotate-180" />,
                      onSelect: () => move(i, -1),
                    },
                  ]
                : []),
              ...(i < docs.length - 1
                ? [{ label: "Move down", icon: <ArrowDownIcon />, onSelect: () => move(i, 1) }]
                : []),
              ...(docs.length > 1
                ? [
                    {
                      label:
                        fields > 0 ? `Remove (and its ${pluralize(fields, "field")})` : "Remove",
                      icon: <Trash2Icon />,
                      destructive: true,
                      separatorBefore: true,
                      onSelect: () => void remove(d.id, d.name),
                    },
                  ]
                : []),
            ]
            return (
              <li
                key={d.id}
                className="flex min-w-0 items-center gap-3 rounded-(--radius-panel) border bg-card py-3 ps-4 pe-2"
              >
                {docs.length > 1 && (
                  <span className="w-4 shrink-0 text-center text-muted-foreground text-xs tabular-nums">
                    {i + 1}
                  </span>
                )}
                <span className="on-paper flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border bg-background">
                  <DocumentTypeIcon status="READY" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm" title={d.name}>
                    {d.name}
                  </span>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {pluralize(d.pageCount ?? 0, "page")}
                    {fields > 0 ? ` · ${pluralize(fields, "field")}` : ""}
                  </span>
                </span>
                <ButtonLink variant="ghost" size="sm" href={`/documents/${d.documentId}`}>
                  Open
                </ButtonLink>
                <DropdownMenu
                  label={`Actions for ${d.name}`}
                  iconOnly
                  icon={<EllipsisIcon />}
                  items={items}
                />
              </li>
            )
          })}
        </ol>
        <div>
          <AddDocumentDialog
            envelopeId={e.id}
            inEnvelope={docs.map((d) => d.documentId)}
            onAdded={() => router.refresh()}
          />
        </div>
      </StepSection>

      <StepSection
        title="Supporting files"
        description="Optional. Shared with the recipients while they sign; nobody signs them. Each file's fingerprint goes on the certificate."
      >
        <AttachmentsList
          attachments={e.attachments}
          source={{ kind: "sender", envelopeId: e.id }}
          editable
        />
      </StepSection>

      <div className="flex justify-end">
        <Button size="sm" onClick={onNext}>
          <ArrowRightIcon aria-hidden />
          Continue to recipients
        </Button>
      </div>
    </div>
  )
}

/** A step's section on the canvas: heading and line, then its content (no card around it). */
export function StepSection({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="font-medium text-lg tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
