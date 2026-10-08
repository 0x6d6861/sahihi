import type { FieldType, PreflightCode } from "@sahihi/core"
import { FIELD_LABELS } from "./constants"

/**
 * Steps of the draft envelope editor (`/envelopes/:id/edit`, ADR 0021), in order. The current one
 * lives in `?step=` so a reload, or a "Fix" link on a preflight issue, lands on the same step.
 */
export const EDITOR_STEPS = ["document", "recipients", "fields", "preview"] as const
export type EditorStep = (typeof EDITOR_STEPS)[number]

/** `label` names the step in the editor's pill; `description` is its hover hint. */
export const EDITOR_STEP_INFO: Record<EditorStep, { label: string; description: string }> = {
  document: {
    label: "Document",
    description: "Optional: redact, rotate, reorder or remove pages",
  },
  recipients: {
    label: "Recipients",
    description: "Who signs, approves or gets a copy",
  },
  fields: {
    label: "Fields",
    description: "Place fields on the pages for each recipient",
  },
  preview: { label: "Preview", description: "Review the document before sending" },
}

/** The step pill's hover hint: what the step is for, or why it isn't open yet. */
export function stepHint(step: EditorStep, hasFieldOwners: boolean): string {
  if (!stepEnabled(step, hasFieldOwners)) return "Add a signer or approver first"
  return EDITOR_STEP_INFO[step].description
}

export function isEditorStep(v: string | null | undefined): v is EditorStep {
  return EDITOR_STEPS.includes(v as EditorStep)
}

/** 1-based position. */
export function stepNumber(step: EditorStep): number {
  return EDITOR_STEPS.indexOf(step) + 1
}

/** Fields and preview need someone who can own a field (a signer or approver). */
export function stepEnabled(step: EditorStep, hasFieldOwners: boolean): boolean {
  return step === "document" || step === "recipients" || hasFieldOwners
}

/**
 * The step to show for a raw `?step=` value: unknown or not yet reachable falls back. A new draft
 * starts at the beginning; one with a signer or approver goes straight to its fields.
 */
export function resolveStep(raw: string | null | undefined, hasFieldOwners: boolean): EditorStep {
  if (isEditorStep(raw) && stepEnabled(raw, hasFieldOwners)) return raw
  return hasFieldOwners ? "fields" : "document"
}

export function nextStep(step: EditorStep): EditorStep | null {
  return EDITOR_STEPS[stepNumber(step)] ?? null
}

/** Which step fixes a preflight issue (none for the expiry, which is set at creation). */
export const FIX_STEP: Record<PreflightCode, EditorStep | undefined> = {
  no_signers: "recipients",
  missing_signature_field: "fields",
  missing_phone: "recipients",
  expiry_in_past: undefined,
}

/** One recipient's fields in a line, in first-placed order: "Signature ×2 · Date signed". */
export function fieldSummary(types: FieldType[]): string {
  const counts = new Map<FieldType, number>()
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts]
    .map(([t, n]) => (n > 1 ? `${FIELD_LABELS[t]} ×${n}` : FIELD_LABELS[t]))
    .join(" · ")
}
