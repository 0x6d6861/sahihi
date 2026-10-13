import { describe, expect, test } from "bun:test"
import {
  connectionAuth,
  connectionWhere,
  deliveryOutcome,
  formProviders,
  ownStorageLabel,
  primaryStatus,
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
  test("where the files go", () => {
    expect(connectionWhere(base)).toBe("acme-contracts/sahihi · Amazon S3 (eu-west-1)")
    expect(
      connectionWhere({ ...base, provider: "CLOUDFLARE_R2", region: "auto", prefix: "" }),
    ).toBe("acme-contracts · Cloudflare R2")
    expect(
      connectionWhere({
        ...base,
        provider: "GOOGLE_DRIVE",
        auth: "OAUTH",
        accountEmail: "ann@acme.test",
        rootFolder: "Sahihi",
      }),
    ).toBe("Google Drive · ann@acme.test › Sahihi")
  })

  test("how it signs in, without the secret", () => {
    expect(connectionAuth(base)).toBe("Access key …WXYZ")
    expect(
      connectionAuth({
        ...base,
        auth: "AWS_ROLE",
        roleArn: "arn:aws:iam::123456789012:role/sahihi-storage",
      }),
    ).toBe("IAM role sahihi-storage")
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
    expect(ownStorageLabel({ ownStorage: "none", storageDestinations: 0 })).toBe("—")
    expect(ownStorageLabel({ ownStorage: "sync", storageDestinations: 1 })).toBe(
      "Sync to 1 destination",
    )
    expect(ownStorageLabel({ ownStorage: "primary", storageDestinations: 5 })).toBe(
      "Your own bucket, sync to 5 destinations",
    )
  })
})
