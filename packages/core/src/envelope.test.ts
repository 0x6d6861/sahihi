import { describe, expect, test } from "bun:test"
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isTerminal,
} from "./envelope-state"
import {
  currentRecipients,
  deriveOutcome,
  isRecipientsTurn,
  type RoutingRecipient,
} from "./routing"

describe("envelope state machine", () => {
  test("happy path", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true)
    expect(canTransition("SENT", "IN_PROGRESS")).toBe(true)
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true)
  })
  test("terminal states are final", () => {
    for (const s of ["COMPLETED", "DECLINED", "VOIDED", "EXPIRED"] as const) {
      expect(isTerminal(s)).toBe(true)
      expect(canTransition(s, "SENT")).toBe(false)
    }
  })
  test("drafts cannot complete directly", () => {
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow(InvalidTransitionError)
  })
})

const r = (
  id: string,
  order: number,
  status: RoutingRecipient["status"] = "SENT",
  role: RoutingRecipient["role"] = "SIGNER",
): RoutingRecipient => ({ id, order, status, role })

describe("routing", () => {
  test("parallel: everyone not done is current", () => {
    const list = [r("a", 1, "SIGNED"), r("b", 2), r("c", 3)]
    expect(currentRecipients(list, "PARALLEL").map((x) => x.id)).toEqual(["b", "c"])
  })
  test("sequential: lowest pending order only, ties sign together", () => {
    const list = [r("a", 1, "SIGNED"), r("b", 2), r("c", 2), r("d", 3, "PENDING")]
    expect(currentRecipients(list, "SEQUENTIAL").map((x) => x.id)).toEqual(["b", "c"])
    expect(isRecipientsTurn(list[3] as RoutingRecipient, list, "SEQUENTIAL")).toBe(false)
  })
  test("viewers never block routing or completion", () => {
    const list = [r("a", 1, "SIGNED"), r("cc", 1, "SENT", "VIEWER")]
    expect(currentRecipients(list, "SEQUENTIAL")).toEqual([])
    expect(deriveOutcome(list)).toBe("COMPLETED")
  })
  test("any decline declines the envelope", () => {
    expect(deriveOutcome([r("a", 1, "SIGNED"), r("b", 2, "DECLINED")])).toBe("DECLINED")
  })
  test("in progress until all actionable signed", () => {
    expect(deriveOutcome([r("a", 1, "SIGNED"), r("b", 2, "VIEWED")])).toBe("IN_PROGRESS")
  })
})
