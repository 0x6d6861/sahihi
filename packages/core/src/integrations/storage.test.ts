import { describe, expect, test } from "bun:test"
import {
  awsExternalId,
  awsRoleTrustPolicy,
  BUCKET_NAME,
  CreateS3ConnectionSchema,
  checkStorageEndpoint,
  normalizePrefix,
  pathSegment,
  resolveStorageEndpoint,
  STORAGE_PROVIDER_INFO,
  STORAGE_PROVIDERS,
  signOAuthState,
  signStorageTicket,
  storageBucketPolicy,
  syncFolderPath,
  UpdateStorageConnectionSchema,
  verifyOAuthState,
  verifyStorageTicket,
} from "./storage"

const SECRET = "x".repeat(40)

describe("providers", () => {
  test("only S3-compatible providers can hold primary storage", () => {
    for (const p of STORAGE_PROVIDERS) {
      const info = STORAGE_PROVIDER_INFO[p]
      expect(info.supportsPrimary).toBe(info.kind === "s3")
    }
  })

  test("endpoints come from the preset, the user, or AWS's default", () => {
    expect(resolveStorageEndpoint({ provider: "AWS_S3", region: "eu-west-1" })).toBeNull()
    expect(
      resolveStorageEndpoint({ provider: "CLOUDFLARE_R2", region: "auto", accountId: "abc" }),
    ).toBe("https://abc.r2.cloudflarestorage.com")
    expect(resolveStorageEndpoint({ provider: "BACKBLAZE_B2", region: "us-west-004" })).toBe(
      "https://s3.us-west-004.backblazeb2.com",
    )
    expect(
      resolveStorageEndpoint({
        provider: "S3_COMPATIBLE",
        region: "us-east-1",
        endpoint: "https://s3.example.com",
      }),
    ).toBe("https://s3.example.com")
  })
})

describe("checks", () => {
  test("bucket names follow S3 rules", () => {
    for (const ok of ["contracts", "acme-signed.docs", "a1b"])
      expect(BUCKET_NAME.test(ok)).toBe(true)
    for (const bad of ["Contracts", "ab", "-x-", "10.0.0.1", "a_b", "xn--abc"]) {
      expect(BUCKET_NAME.test(bad)).toBe(false)
    }
  })

  test("prefixes are trimmed and end with a slash", () => {
    expect(normalizePrefix("")).toBe("")
    expect(normalizePrefix("/contracts/sahihi/")).toBe("contracts/sahihi/")
    expect(normalizePrefix("x")).toBe("x/")
  })

  test("custom endpoints must be public HTTPS origins", () => {
    expect(checkStorageEndpoint("https://s3.example.com")).toEqual({
      ok: true,
      url: "https://s3.example.com",
    })
    expect(checkStorageEndpoint("http://s3.example.com").ok).toBe(false)
    expect(checkStorageEndpoint("https://169.254.169.254").ok).toBe(false)
    expect(checkStorageEndpoint("https://minio.internal").ok).toBe(false)
    expect(checkStorageEndpoint("https://s3.example.com/bucket").ok).toBe(false)
    expect(checkStorageEndpoint("http://localhost:9000", { allowPrivate: true })).toEqual({
      ok: true,
      url: "http://localhost:9000",
    })
  })
})

describe("CreateS3ConnectionSchema", () => {
  const base = {
    purpose: "SYNC",
    name: "Archive",
    provider: "AWS_S3",
    bucket: "acme-contracts",
    region: "eu-west-1",
    auth: "ACCESS_KEYS",
    accessKeyId: "AKIAEXAMPLE",
    secretAccessKey: "secret-secret",
  }

  test("normalises the prefix and defaults the folder pattern", () => {
    const parsed = CreateS3ConnectionSchema.parse({ ...base, prefix: "/signed/" })
    expect(parsed.prefix).toBe("signed/")
    expect(parsed.folderTemplate).toBe("{yyyy}/{mm}/{title} ({id})")
  })

  test("R2 needs the account id, S3-compatible needs an endpoint", () => {
    const r2 = CreateS3ConnectionSchema.safeParse({ ...base, provider: "CLOUDFLARE_R2" })
    expect(r2.success).toBe(false)
    expect(r2.error?.issues.map((i) => i.path.join("."))).toContain("accountId")
    const other = CreateS3ConnectionSchema.safeParse({ ...base, provider: "S3_COMPATIBLE" })
    expect(other.error?.issues.map((i) => i.path.join("."))).toContain("endpoint")
  })

  test("roles are for Amazon S3 only, with a real ARN", () => {
    const role = { ...base, auth: "AWS_ROLE", roleArn: "arn:aws:iam::123456789012:role/sahihi" }
    expect(CreateS3ConnectionSchema.safeParse(role).success).toBe(true)
    expect(CreateS3ConnectionSchema.safeParse({ ...role, provider: "WASABI" }).success).toBe(false)
    expect(CreateS3ConnectionSchema.safeParse({ ...role, roleArn: "sahihi" }).success).toBe(false)
  })

  test("Drive providers are refused (they connect with OAuth)", () => {
    expect(CreateS3ConnectionSchema.safeParse({ ...base, provider: "GOOGLE_DRIVE" }).success).toBe(
      false,
    )
  })

  test("folder patterns need {id} and known tokens only", () => {
    expect(
      CreateS3ConnectionSchema.safeParse({ ...base, folderTemplate: "{yyyy}/{title}" }).success,
    ).toBe(false)
    expect(
      CreateS3ConnectionSchema.safeParse({ ...base, folderTemplate: "{year}/{id}" }).success,
    ).toBe(false)
    expect(
      CreateS3ConnectionSchema.safeParse({ ...base, folderTemplate: "signed/{yyyy}/{id}" }).success,
    ).toBe(true)
  })

  test("updates rotate both key parts together", () => {
    expect(UpdateStorageConnectionSchema.safeParse({ accessKeyId: "AKIANEW" }).success).toBe(false)
    expect(UpdateStorageConnectionSchema.safeParse({ name: "New" }).success).toBe(true)
  })
})

describe("sync folders", () => {
  const envelope = {
    id: "cmabc123def456gh",
    title: "Lease: Unit 4/B",
    completedAt: new Date("2026-03-07T21:30:00Z"),
  }

  test("fills the pattern and keeps every part a safe single segment", () => {
    expect(syncFolderPath("{yyyy}/{mm}/{title} ({id})", envelope)).toBe(
      "2026/03/Lease- Unit 4-B (def456gh)",
    )
    expect(syncFolderPath("{yyyy}-{mm}-{dd}/{id}", envelope)).toBe("2026-03-07/def456gh")
  })

  test("path segments drop reserved characters and trailing dots", () => {
    expect(pathSegment('a<b>c:"d"|e?*')).toBe("a-b-c--d--e--")
    expect(pathSegment("Report...")).toBe("Report")
    expect(pathSegment("   ")).toBe("untitled")
  })
})

describe("storage tickets", () => {
  const now = 1_800_000_000
  const ticket = { o: "org1", k: "org/org1/documents/d1/original.pdf", e: now + 300 }

  test("round-trips and expires", async () => {
    const raw = await signStorageTicket(SECRET, ticket)
    expect(await verifyStorageTicket(SECRET, raw, now)).toEqual(ticket)
    expect(await verifyStorageTicket(SECRET, raw, now + 301)).toBeNull()
  })

  test("refuses tampering, other secrets and keys outside the workspace", async () => {
    const raw = await signStorageTicket(SECRET, ticket)
    const [payload, mac] = raw.split(".")
    const forged = btoa(JSON.stringify({ ...ticket, k: "org/org2/x" })).replace(/=+$/, "")
    expect(await verifyStorageTicket(SECRET, `${forged}.${mac}`, now)).toBeNull()
    expect(await verifyStorageTicket("y".repeat(40), raw, now)).toBeNull()
    expect(await verifyStorageTicket(SECRET, `${payload}.${mac}.x`, now)).toBeNull()
    const other = await signStorageTicket(SECRET, { ...ticket, k: "org/org2/documents/x.pdf" })
    expect(await verifyStorageTicket(SECRET, other, now)).toBeNull()
    const user = await signStorageTicket(SECRET, { ...ticket, k: "user/u1/avatar.png" })
    expect(await verifyStorageTicket(SECRET, user, now)).toBeNull()
  })
})

describe("AWS setup", () => {
  test("external ids are stable per workspace and differ between workspaces", async () => {
    const a = await awsExternalId(SECRET, "org1")
    expect(a).toMatch(/^sahihi-[A-Za-z0-9_-]{24}$/)
    expect(await awsExternalId(SECRET, "org1")).toBe(a)
    expect(await awsExternalId(SECRET, "org2")).not.toBe(a)
    expect(await awsExternalId("y".repeat(40), "org1")).not.toBe(a)
  })

  test("the trust policy requires the external id", () => {
    const policy = awsRoleTrustPolicy("111122223333", "sahihi-abc")
    expect(policy.Statement[0]?.Principal.AWS).toBe("arn:aws:iam::111122223333:root")
    expect(policy.Statement[0]?.Condition.StringEquals["sts:ExternalId"]).toBe("sahihi-abc")
  })

  test("the bucket policy never grants delete", () => {
    const text = JSON.stringify(storageBucketPolicy("acme", "sahihi/", { tagging: true }))
    expect(text).not.toContain("Delete")
    expect(text).toContain("arn:aws:s3:::acme/sahihi/*")
    expect(text).toContain("s3:PutObjectTagging")
  })
})

describe("OAuth state", () => {
  const now = 1_800_000_000
  const state = {
    o: "org1",
    u: "user1",
    p: "GOOGLE_DRIVE" as const,
    name: "Drive",
    folderTemplate: "{yyyy}/{id}",
    rootFolder: "Sahihi",
    e: now + 600,
  }

  test("round-trips, expires, and is not a storage ticket", async () => {
    const raw = await signOAuthState(SECRET, state)
    expect(await verifyOAuthState(SECRET, raw, now)).toEqual(state)
    expect(await verifyOAuthState(SECRET, raw, now + 601)).toBeNull()
    expect(await verifyStorageTicket(SECRET, raw, now)).toBeNull()
    const ticket = await signStorageTicket(SECRET, { o: "org1", k: "org/org1/x", e: now + 60 })
    expect(await verifyOAuthState(SECRET, ticket, now)).toBeNull()
  })
})
