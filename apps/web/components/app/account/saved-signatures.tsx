"use client"

import type { SavedSignatureKind } from "@sahihi/core"
import { useState } from "react"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { PenLineIcon, Trash2Icon } from "@/components/app/icons"
import { SignatureCaptureDialog } from "@/components/app/signing/signature-capture-dialog"
import { toastManager } from "@/components/app/toast"
import { Button } from "@/components/arc/button/button"
import { api } from "@/lib/api"

export interface SavedSignatures {
  signature: string | null
  initials: string | null
}

const LABEL: Record<SavedSignatureKind, string> = { signature: "Signature", initials: "Initials" }

/**
 * Saved signature and initials (PUT/DELETE /api/me/signatures). Captured with the same dialog
 * signers use, and offered back on signing pages addressed to this user's email.
 */
export function SavedSignaturesEditor({
  name,
  initial,
}: {
  name: string
  initial: SavedSignatures
}) {
  const [saved, setSaved] = useState<SavedSignatures>(initial)
  const [editing, setEditing] = useState<SavedSignatureKind | null>(null)
  const [removing, setRemoving] = useState<SavedSignatureKind | null>(null)

  async function save(kind: SavedSignatureKind, dataUrl: string) {
    try {
      await api("/me/signatures", { method: "PUT", json: { kind, dataUrl } })
      setSaved((s) => ({ ...s, [kind]: dataUrl }))
      toastManager.add({ title: `${LABEL[kind]} saved`, type: "success" })
    } catch (err) {
      toastManager.add({
        title: "Not saved",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
    }
  }

  async function remove(kind: SavedSignatureKind) {
    try {
      await api(`/me/signatures/${kind}`, { method: "DELETE" })
      setSaved((s) => ({ ...s, [kind]: null }))
    } catch (err) {
      toastManager.add({
        title: "Not removed",
        description: err instanceof Error ? err.message : undefined,
        type: "error",
      })
      throw err
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["signature", "initials"] as const).map((kind) => {
        const image = saved[kind]
        return (
          <div key={kind} className="flex flex-col gap-3">
            <span className="font-medium text-sm">{LABEL[kind]}</span>
            {/* Signatures are dark ink for a white page, so the preview stays on paper in dark mode. */}
            <div className="on-paper flex h-28 items-center justify-center rounded-2xl border border-dashed bg-background p-3">
              {image ? (
                // biome-ignore lint/performance/noImgElement: local data URL preview
                <img
                  src={image}
                  alt={`Your saved ${kind}`}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <span className="text-muted-foreground text-xs">No {kind} saved</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(kind)}>
                <PenLineIcon aria-hidden />
                {image ? "Replace" : `Add ${kind}`}
              </Button>
              {image && (
                <Button variant="ghost" size="sm" onClick={() => setRemoving(kind)}>
                  <Trash2Icon aria-hidden />
                  Remove
                </Button>
              )}
            </div>
          </div>
        )
      })}

      <SignatureCaptureDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        kind={editing ?? "signature"}
        signerName={name}
        adopted={null}
        description={`Saved to your account. You can place it with one click when a document is sent to you.`}
        confirmLabel="Save"
        onConfirm={(dataUrl) => {
          if (editing) void save(editing, dataUrl)
        }}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove your saved ${removing ?? "signature"}?`}
        description="Documents you already signed keep it. Next time you sign, you'll draw, type or upload it again."
        confirmLabel="Remove"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </div>
  )
}
