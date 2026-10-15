import { z } from "zod"

/**
 * The Get started checklist on All files (ADR 0061): five first steps, each done when the workspace
 * shows it happened. Counts come from the API; nothing here is stored except whether the member hid
 * the checklist.
 */
export const GETTING_STARTED_STEPS = ["workspace", "team", "upload", "send", "draft"] as const
export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number]

export interface GettingStartedCounts {
  /** Members other than the caller, plus pending invitations. */
  teammates: number
  documents: number
  /** Envelopes that left DRAFT (sent at least once). */
  sentEnvelopes: number
  generatedDocuments: number
}

export interface GettingStartedState {
  steps: { step: GettingStartedStep; done: boolean }[]
  done: number
  total: number
  /** Every step done: the checklist hides itself. */
  complete: boolean
}

export function gettingStarted(counts: GettingStartedCounts): GettingStartedState {
  const done: Record<GettingStartedStep, boolean> = {
    // The workspace exists once anyone can see this list.
    workspace: true,
    team: counts.teammates > 0,
    upload: counts.documents > 0,
    send: counts.sentEnvelopes > 0,
    draft: counts.generatedDocuments > 0,
  }
  const steps = GETTING_STARTED_STEPS.map((step) => ({ step, done: done[step] }))
  const n = steps.filter((s) => s.done).length
  return { steps, done: n, total: steps.length, complete: n === steps.length }
}

/** `PUT /api/getting-started`: hide or show the checklist again. */
export const GettingStartedPreferenceSchema = z.object({ dismissed: z.boolean() })
export type GettingStartedPreference = z.infer<typeof GettingStartedPreferenceSchema>
