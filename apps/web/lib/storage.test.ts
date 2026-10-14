import { describe, expect, test } from "bun:test"
import {
  connectionBadge,
  connectionDetails,
  connectionWhere,
  deliveryOutcome,
  formProviders,
  ownStorageLabel,
  primaryStatus,
  releasedKeyLabel,
  type StorageConnectionRow,
} from "./storage"

const base: StorageConnectionRow = {
  id: "c1",
  purpose: "SYNC",
  provider: "AWS_S3",
  name: "Archive",
  endpoint: null,
  region: "eu-west-1",
  bucket: "acme-contracts",
  prefix: "sahihi/",
  auth: "ACCESS_KEYS",
  secretHint: "WXYZ",
  roleArn: null,
  accountEmail: null,
  rootFolder: null,
  folderTemplate: "{yyyy}/{id}",
  status: "ACTIVE",
  primaryState: null,
  migratedCount: 0,
  migrateTotal: 0,
  lastCheckedAt: null,
  lastError: null,
}

describe("storage settings helpers", () => {
  test("where the files go, and the rest of the line", () => {
    expect(connectionWhere(base)).toBe("acme-contracts/sahihi")
    expect(connectionDetails(base)).toBe("Amazon S3 (eu-west-1) · Access key …WXYZ")
    const r2 = { ...base, provider: "CLOUDFLARE_R2" as const, region: "auto", prefix: "" }
    expect(connectionWhere(r2)).toBe("acme-contracts")
    expect(connectionDetails(r2)).toBe("Cloudflare R2 · Access key …WXYZ")
    const drive = {
      ...base,
      provider: "GOOGLE_DRIVE" as const,
      auth: "OAUTH" as const,
      accountEmail: "ann@acme.test",
      rootFolder: "Contracts",
    }
    expect(connectionWhere(drive)).toBe("Contracts")
    expect(connectionDetails(drive)).toBe("Google Drive · Signed in as ann@acme.test")
    const role = {
      ...base,
      auth: "AWS_ROLE" as const,
      roleArn: "arn:aws:iam::123456789012:role/sahihi-storage",
    }
    expect(connectionDetails(role)).toBe("Amazon S3 (eu-west-1) · IAM role sahihi-storage")
  })

  test("a failed first test isn't shown as untested", () => {
    expect(connectionBadge({ status: "PENDING", lastError: null }).label).toBe("Not tested")
    expect(connectionBadge({ status: "PENDING", lastError: "Access denied" }).label).toBe(
      "Test failed",
    )
    expect(connectionBadge({ status: "FAILING", lastError: "x" }).tone).toBe("danger")
  })

  test("primary storage progress", () => {
    expect(
      primaryStatus({ ...base, primaryState: "MIGRATING_IN", migrateTotal: 8, migratedCount: 2 }),
    ).toEqual({
      label: "Moving files in",
      tone: "info",
      progress: 25,
    })
    expect(primaryStatus({ ...base, primaryState: "ACTIVE" }).progress).toBeNull()
    expect(primaryStatus(base).label).toBe("Not in use yet")
  })

  test("delivery outcomes", () => {
    const d = {
      id: "d1",
      status: "SUCCEEDED" as const,
      attempts: 1,
      lastError: null,
      path: "2026/10/Lease (k3j9x2)",
      fileCount: 3,
      deliveredAt: null,
      createdAt: "",
      envelope: { id: "e", title: "Lease" },
    }
    expect(deliveryOutcome(d)).toBe("3 files · 2026/10/Lease (k3j9x2)")
    expect(deliveryOutcome({ ...d, status: "PENDING", attempts: 0 })).toBe("Waiting to be copied")
    expect(
      deliveryOutcome({ ...d, status: "FAILED", attempts: 4, lastError: "Access denied" }),
    ).toBe("Access denied · 4 attempts")
  })

  test("the form offers S3-compatible providers only", () => {
    const values = formProviders("SYNC").map((p) => p.value)
    expect(values).toContain("AWS_S3")
    expect(values).not.toContain("GOOGLE_DRIVE")
    expect(formProviders("PRIMARY").map((p) => p.value)).toEqual(values)
  })
})

describe("ownStorageLabel", () => {
  test("per tier", () => {
    expect(ownStorageLabel({ ownStorage: "none", storageDestinations: 0 })).toBe("Not included")
    expect(ownStorageLabel({ ownStorage: "sync", storageDestinations: 1 })).toBe(
      "Sync to 1 destination",
    )
    expect(ownStorageLabel({ ownStorage: "primary", storageDestinations: 5 })).toBe(
      "Your own bucket, sync to 5 destinations",
    )
  })
})

describe("releasedKeyLabel", () => {
  test("keeps the end of the key, where the file name is", () => {
    const prefix = "sahihi/org/mNXk7QOsFd2p2tPBVWMddZG4IDqx485C/documents/afd5b871-645a-42ec"
    expect(releasedKeyLabel(`${prefix}/original.pdf`)).toBe("…/documents/afd5b871…/original.pdf")
    expect(releasedKeyLabel(`${prefix}/thumbnail-1a2b3c4d.png`)).toBe(
      "…/documents/afd5b871…/thumbnail-1a2b3c4d.png",
    )
    expect(releasedKeyLabel("org/o1/envelopes/e1/")).toBe("…/o1/envelopes/e1/")
    expect(releasedKeyLabel("a/b.pdf")).toBe("a/b.pdf")
  })
})
