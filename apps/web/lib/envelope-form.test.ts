import { describe, expect, test } from "bun:test"
import {
  buildCreateEnvelopeInput,
  buildEnvelopeDetailsInput,
  detailsFromEnvelope,
  expiryFromDate,
  issuesToFormErrors,
  type NewEnvelopeValues,
} from "./envelope-form"

const now = new Date(2026, 8, 26, 12, 0, 0)
const base: NewEnvelopeValues = {
  documentId: "doc_1",
  title: "Lease",
  message: "",
  sequential: false,
  expiresOn: null,
}

describe("buildCreateEnvelopeInput", () => {
  test("builds the API input", () => {
    expect(buildCreateEnvelopeInput(base, now)).toEqual({
      ok: true,
      input: { documentId: "doc_1", title: "Lease", signingOrder: "PARALLEL" },
    })
  })
  test("maps the switch, trims the message and sets expiry to the end of the day", () => {
    const res = buildCreateEnvelopeInput(
      { ...base, sequential: true, message: "  Please sign  ", expiresOn: new Date(2026, 9, 1) },
      now,
    )
    expect(res.ok && res.input.signingOrder).toBe("SEQUENTIAL")
    expect(res.ok && res.input.message).toBe("Please sign")
    expect(res.ok && res.input.expiresAt).toEqual(new Date(2026, 9, 1, 23, 59, 59, 999))
  })
  test("reports every invalid field by input name", () => {
    const res = buildCreateEnvelopeInput(
      { ...base, documentId: "", title: "   ", message: "x".repeat(2001) },
      now,
    )
    expect(res.ok).toBe(false)
    expect(!res.ok && Object.keys(res.errors).sort()).toEqual(["documentId", "message", "title"])
  })
  test("expiry today is still allowed; yesterday is not", () => {
    expect(buildCreateEnvelopeInput({ ...base, expiresOn: new Date(2026, 8, 26) }, now).ok).toBe(
      true,
    )
    const past = buildCreateEnvelopeInput({ ...base, expiresOn: new Date(2026, 8, 25) }, now)
    expect(!past.ok && past.errors).toEqual({ expiresAt: "Pick a date in the future." })
  })
})

describe("expiryFromDate", () => {
  test("keeps the calendar day, moves to its last millisecond", () => {
    const d = expiryFromDate(new Date(2026, 0, 31, 8, 30))
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 0, 31, 23])
  })
})

describe("issuesToFormErrors", () => {
  test("keeps the first message per path; accepts dotted or array paths", () => {
    expect(
      issuesToFormErrors([
        { path: "title", message: "first" },
        { path: ["title"], message: "second" },
        { path: [], message: "whole form" },
      ]),
    ).toEqual({ title: "first", form: "whole form" })
  })
})

describe("detailsFromEnvelope / buildEnvelopeDetailsInput", () => {
  test("round-trips a saved envelope through the dialog values", () => {
    const expiresAt = expiryFromDate(new Date(2026, 9, 3)).toISOString()
    const values = detailsFromEnvelope({
      title: "Lease",
      message: null,
      signingOrder: "SEQUENTIAL",
      expiresAt,
    })
    expect(values).toEqual({
      title: "Lease",
      message: "",
      sequential: true,
      expiresOn: new Date(2026, 9, 3),
    })
    expect(buildEnvelopeDetailsInput(values, now)).toEqual({
      ok: true,
      input: { title: "Lease", signingOrder: "SEQUENTIAL", expiresAt: new Date(expiresAt) },
    })
  })
  test("no expiry is sent as null so the API clears it; blank message is dropped", () => {
    const r = buildEnvelopeDetailsInput({ ...base, message: "  " }, now)
    expect(r).toEqual({
      ok: true,
      input: { title: "Lease", signingOrder: "PARALLEL", expiresAt: null },
    })
  })
  test("maps errors onto the dialog's fields", () => {
    const r = buildEnvelopeDetailsInput(
      { ...base, title: " ", expiresOn: new Date(2026, 8, 1) },
      now,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["expiresAt", "title"])
  })
})
