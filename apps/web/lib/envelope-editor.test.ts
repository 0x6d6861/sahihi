import { describe, expect, test } from "bun:test"
import {
  EDITOR_STEPS,
  FIX_STEP,
  fieldSummary,
  isEditorStep,
  nextStep,
  resolveStep,
  stepEnabled,
  stepHint,
  stepNumber,
} from "./envelope-editor"

describe("editor steps", () => {
  test("numbers and progress follow the step order", () => {
    expect(EDITOR_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4])
  })
  test("next step, none after the last", () => {
    expect(nextStep("document")).toBe("recipients")
    expect(nextStep("recipients")).toBe("fields")
    expect(nextStep("fields")).toBe("preview")
    expect(nextStep("preview")).toBeNull()
  })
  test("guards query values", () => {
    expect(isEditorStep("fields")).toBe(true)
    expect(isEditorStep("document")).toBe(true)
    expect(isEditorStep("tab")).toBe(false)
    expect(isEditorStep(null)).toBe(false)
  })
})

describe("resolveStep", () => {
  test("keeps a valid, reachable step", () => {
    expect(resolveStep("preview", true)).toBe("preview")
    expect(resolveStep("recipients", true)).toBe("recipients")
  })
  test("defaults to fields once someone can own a field, else the first step", () => {
    expect(resolveStep(null, true)).toBe("fields")
    expect(resolveStep("bogus", false)).toBe("document")
  })
  test("fields and preview wait for a signer or approver", () => {
    expect(stepEnabled("fields", false)).toBe(false)
    expect(stepEnabled("document", false)).toBe(true)
    expect(stepEnabled("recipients", false)).toBe(true)
    expect(resolveStep("fields", false)).toBe("document")
  })
})

describe("FIX_STEP", () => {
  test("sends each preflight issue to the step that fixes it", () => {
    expect(FIX_STEP.no_signers).toBe("recipients")
    expect(FIX_STEP.missing_phone).toBe("recipients")
    expect(FIX_STEP.missing_signature_field).toBe("fields")
    expect(FIX_STEP.expiry_in_past).toBeUndefined()
  })
})

describe("fieldSummary", () => {
  test("counts repeated types, keeps first-placed order", () => {
    expect(fieldSummary(["SIGNATURE", "DATE_SIGNED", "SIGNATURE"])).toBe(
      "Signature ×2 · Date signed",
    )
    expect(fieldSummary([])).toBe("")
  })
})

describe("stepHint", () => {
  test("what the step is for, or why it's closed", () => {
    expect(stepHint("recipients", false)).toBe("Who signs, approves or gets a copy")
    expect(stepHint("fields", false)).toBe("Add a signer or approver first")
    expect(stepHint("fields", true)).toBe("Place fields on the pages for each recipient")
  })
})
