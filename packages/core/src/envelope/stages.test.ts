import { describe, expect, test } from "bun:test"
import { ENVELOPE_STATUSES } from "../shared/enums"
import { ENVELOPE_STAGE_STATUSES, ENVELOPE_STAGES, envelopeStage } from "./stages"

describe("envelope stages", () => {
  test("every status belongs to exactly one stage", () => {
    for (const status of ENVELOPE_STATUSES) {
      const stages = ENVELOPE_STAGES.filter((s) => ENVELOPE_STAGE_STATUSES[s].includes(status))
      expect(stages).toEqual([envelopeStage(status)])
    }
  })

  test("in progress covers sent and partly signed; closed covers the dead ends", () => {
    expect(envelopeStage("SENT")).toBe("active")
    expect(envelopeStage("IN_PROGRESS")).toBe("active")
    expect(envelopeStage("VOIDED")).toBe("closed")
    expect(envelopeStage("EXPIRED")).toBe("closed")
  })
})
