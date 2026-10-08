import { describe, expect, test } from "bun:test"
import { type EnvelopeResponse, isEditableDraft } from "./envelope-detail"

const response = (status: string, manage: boolean) =>
  ({ envelope: { status }, permissions: { manage, purge: false } }) as unknown as EnvelopeResponse

describe("isEditableDraft", () => {
  test("only a draft the user may manage opens in the editor", () => {
    expect(isEditableDraft(response("DRAFT", true))).toBe(true)
    expect(isEditableDraft(response("DRAFT", false))).toBe(false)
    expect(isEditableDraft(response("SENT", true))).toBe(false)
  })
})
