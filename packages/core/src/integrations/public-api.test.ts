import { describe, expect, test } from "bun:test"
import { ApiCreateFromDocumentSchema } from "./public-api"

describe("ApiCreateFromDocumentSchema", () => {
  test("fields point at recipients by index; viewers can't own one", () => {
    const base = {
      documentId: "d1",
      title: "Lease",
      fields: [
        { recipient: 0, type: "SIGNATURE", page: 1, x: 0.1, y: 0.1, width: 0.3, height: 0.06 },
      ],
    }
    expect(
      ApiCreateFromDocumentSchema.safeParse({
        ...base,
        recipients: [{ name: "A", email: "a@example.com" }],
      }).success,
    ).toBe(true)
    const viewer = ApiCreateFromDocumentSchema.safeParse({
      ...base,
      recipients: [{ name: "A", email: "a@example.com", role: "VIEWER" }],
    })
    expect(viewer.success).toBe(false)
    expect(viewer.error?.issues.map((i) => i.path.join("."))).toContain("fields.0.recipient")
  })
})
