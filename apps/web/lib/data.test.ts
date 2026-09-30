import { describe, expect, test } from "bun:test"
import { exportStatus, formatBytes } from "./data"

describe("data helpers", () => {
  test("export status", () => {
    const now = new Date()
    expect(exportStatus({ status: "PENDING", downloadable: false }, now).label).toBe("Preparing")
    expect(exportStatus({ status: "READY", downloadable: true }, now).label).toBe("Ready")
    expect(exportStatus({ status: "READY", downloadable: false }, now).label).toBe("Expired")
    expect(exportStatus({ status: "FAILED", downloadable: false }, now).variant).toBe("error")
  })

  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(1536)).toBe("1.5 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB")
  })
})
