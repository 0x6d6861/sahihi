"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/app/button"
import { ArrowRightIcon } from "@/components/app/icons"
import { RecipientsEditor } from "@/components/app/recipients-editor/recipients-editor"
import { toastManager } from "@/components/app/toast"
import { Switch } from "@/components/arc/switch/switch"
import { api } from "@/lib/api"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { buildEnvelopeDetailsInput, detailsFromEnvelope } from "@/lib/envelope-form"
import { StepSection } from "./documents-step"

/**
 * Step 2 of the draft editor: who receives the envelope, as a table (the recipients editor, which
 * saves explicitly), and whether they sign in order. Turning the order on or off saves at once
 * (`PUT …/details`), which renumbers the steps. Fields come next, once someone can own one.
 */
export function RecipientsStep({
  envelope: e,
  hasFieldOwners,
  onNext,
}: {
  envelope: EnvelopeDetail
  hasFieldOwners: boolean
  onNext: () => void
}) {
  const sequential = e.signingOrder === "SEQUENTIAL"
  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-10 px-4 py-6 md:py-10">
      <StepSection
        title="Recipients"
        description={
          sequential
            ? "Invited step by step. Recipients on the same step sign in parallel."
            : "Everyone is invited at the same time."
        }
        actions={<SigningOrderSwitch envelope={e} />}
      >
        <RecipientsEditor envelopeId={e.id} signingOrder={e.signingOrder} initial={e.recipients} />
      </StepSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!hasFieldOwners && (
          <p className="text-muted-foreground text-sm">
            Save a recipient who signs or approves to place fields.
          </p>
        )}
        <Button size="sm" onClick={onNext} disabled={!hasFieldOwners}>
          <ArrowRightIcon aria-hidden />
          Continue to fields
        </Button>
      </div>
    </div>
  )
}

/** "Sign in order", saved on its own with the envelope's other details unchanged. */
function SigningOrderSwitch({ envelope: e }: { envelope: EnvelopeDetail }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const sequential = e.signingOrder === "SEQUENTIAL"

  async function change(next: boolean) {
    const built = buildEnvelopeDetailsInput({ ...detailsFromEnvelope(e), sequential: next })
    if (!built.ok) {
      toastManager.add({
        title: "Signing order not changed",
        description: Object.values(built.errors)[0] ?? "Check the envelope's details.",
        type: "error",
      })
      return
    }
    setPending(true)
    try {
      await api(`/envelopes/${e.id}/details`, { method: "PUT", json: built.input })
      router.refresh()
    } catch (err) {
      toastManager.add({
        title: "Signing order not changed",
        description: err instanceof Error ? err.message : "Please try again.",
        type: "error",
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      <span id="sign-in-order" className="font-medium text-sm">
        Sign in order
      </span>
      <Switch
        aria-labelledby="sign-in-order"
        checked={sequential}
        disabled={pending}
        onCheckedChange={(next) => void change(next)}
      />
    </div>
  )
}
