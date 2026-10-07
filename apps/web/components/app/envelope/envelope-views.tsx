"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import SegmentedControl from "@/components/arc/segmented-control/segmented-control"
import { ENVELOPE_VIEW_LABEL, ENVELOPE_VIEWS, type EnvelopeView } from "@/lib/envelope-list"

/** All / Drafts / In progress / Completed / Closed over the same list (Arc segmented control). */
export function EnvelopeViews({
  value,
  counts,
}: {
  value: EnvelopeView
  counts: Record<EnvelopeView, number>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    // Scrolls sideways on its own on narrow screens; the page never does.
    <div className="-mx-1 overflow-x-auto px-1" aria-busy={pending}>
      <SegmentedControl
        label="Show envelopes"
        value={value}
        onValueChange={(next) =>
          startTransition(() =>
            router.replace(next === "all" ? "/envelopes" : `/envelopes?view=${next}`, {
              scroll: false,
            }),
          )
        }
        options={ENVELOPE_VIEWS.map((v) => ({
          value: v,
          label: ENVELOPE_VIEW_LABEL[v],
          accessory: <span className="text-muted-foreground tabular-nums">{counts[v]}</span>,
        }))}
      />
    </div>
  )
}
