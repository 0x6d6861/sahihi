"use client"

import { ButtonLink } from "@/components/app/button-link"
import { FileTextIcon } from "@/components/app/icons"
import { Panel } from "@/components/app/panel"
import { RecipientsEditor } from "@/components/app/recipients-editor/recipients-editor"
import { Button } from "@/components/arc/button/button"
import type { EnvelopeDetail } from "@/lib/envelope-detail"
import { formatDate } from "@/lib/format"

/**
 * Step 1 of the draft editor: the document being sent (fixed once the envelope exists) and the
 * recipients editor, which saves explicitly. Fields come next, once someone can own one.
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-8">
      <Panel
        title="Document"
        description={`${e.document.pageCount} ${e.document.pageCount === 1 ? "page" : "pages"}${e.expiresAt ? ` · Expires ${formatDate(new Date(e.expiresAt))}` : " · No expiry"}`}
      >
        <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
          <FileTextIcon aria-hidden className="text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium text-sm">{e.document.name}</span>
          <ButtonLink variant="ghost" size="sm" href={`/documents/${e.document.id}`}>
            Open
          </ButtonLink>
        </div>
      </Panel>

      <Panel
        title="Recipients"
        description={
          sequential
            ? "Invited step by step. Recipients on the same step sign in parallel."
            : "Everyone is invited at the same time."
        }
      >
        <RecipientsEditor envelopeId={e.id} signingOrder={e.signingOrder} initial={e.recipients} />
      </Panel>

      <div className="flex items-center justify-end gap-3">
        {!hasFieldOwners && (
          <p className="text-muted-foreground text-sm">
            Save a recipient who signs or approves to place fields.
          </p>
        )}
        <Button variant="secondary" onClick={onNext} disabled={!hasFieldOwners}>
          Continue to fields
        </Button>
      </div>
    </div>
  )
}
