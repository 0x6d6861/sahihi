import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { getEnv } from "@sahihi/config"
import { encryptSecret } from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { driveDestination, WriteOnceError } from "@sahihi/infra"
import { createSender, request, resetDb, type Sender } from "./helpers"

/**
 * Google Drive and OneDrive sync destinations (docs/storage.md → Cloud drives). Their APIs are
 * mocked at `fetch`: every call to a Google or Microsoft host goes to `fake`, the rest is real.
 */

type Call = { method: string; url: string; body?: unknown; headers: Headers }
let calls: Call[] = []
let fake: (call: Call) => Response | Promise<Response>
const realFetch = globalThis.fetch

beforeEach(async () => {
  await resetDb()
  calls = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (!/googleapis\.com|google\.com|microsoft(online)?\.com/.test(url)) {
      return realFetch(input, init)
    }
    const call = {
      method: init?.method ?? "GET",
      url,
      body: init?.body,
      headers: new Headers(init?.headers),
    }
    calls.push(call)
    return fake(call)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })

const idToken = (claims: object) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`

async function startOAuth(who: Sender, provider: "GOOGLE_DRIVE" | "ONEDRIVE") {
  const res = await request(who, "/api/storage/oauth/start", {
    method: "POST",
    json: { provider, name: "Contracts drive", folderTemplate: "{yyyy}/{id}" },
  })
  return { res, body: (await res.json()) as { url?: string; message?: string } }
}

describe("connecting a cloud drive", () => {
  test("start: Business and up; the consent URL asks for the narrowest scope", async () => {
    const free = await createSender("free", { plan: "free" })
    expect((await startOAuth(free, "GOOGLE_DRIVE")).res.status).toBe(402)

    const owner = await createSender("owner", { plan: "business" })
    const { body } = await startOAuth(owner, "GOOGLE_DRIVE")
    const url = new URL(body.url as string)
    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("client_id")).toBe("google-client")
    expect(url.searchParams.get("scope")).toBe(
      "openid email https://www.googleapis.com/auth/drive.file",
    )
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/storage/oauth/google/callback",
    )
    const ms = new URL((await startOAuth(owner, "ONEDRIVE")).body.url as string)
    expect(ms.searchParams.get("scope")).toBe("offline_access User.Read Files.ReadWrite.AppFolder")
  })

  test("callback: exchanges the code, saves the encrypted refresh token, lands on settings", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const state = new URL(
      (await startOAuth(owner, "GOOGLE_DRIVE")).body.url as string,
    ).searchParams.get("state") as string
    fake = (call) => {
      expect(call.url).toBe("https://oauth2.googleapis.com/token")
      expect(String(call.body)).toContain("code=the-code")
      return json({
        access_token: "at",
        refresh_token: "rt-google",
        id_token: idToken({ email: "owner@acme.test" }),
      })
    }
    const res = await request(
      owner,
      `/api/storage/oauth/google/callback?code=the-code&state=${encodeURIComponent(state)}`,
    )
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location") as string)
    expect(location.pathname).toBe("/settings/storage")
    const conn = await prisma.storageConnection.findFirstOrThrow({
      where: { organizationId: owner.organizationId },
    })
    expect(location.searchParams.get("connected")).toBe(conn.id)
    expect(conn).toMatchObject({
      provider: "GOOGLE_DRIVE",
      auth: "OAUTH",
      accountEmail: "owner@acme.test",
      status: "ACTIVE",
      folderTemplate: "{yyyy}/{id}",
      rootFolder: "Sahihi",
    })
    expect(conn.secretEncrypted).not.toContain("rt-google")
  })

  test("callback: a state from another person or workspace connects nothing", async () => {
    const owner = await createSender("owner", { plan: "business" })
    const other = await createSender("other", { plan: "business" })
    const state = new URL(
      (await startOAuth(owner, "GOOGLE_DRIVE")).body.url as string,
    ).searchParams.get("state") as string
    fake = () => json({ access_token: "at", refresh_token: "rt" })
    for (const path of [
      `/api/storage/oauth/google/callback?code=c&state=${encodeURIComponent(state)}`,
      `/api/storage/oauth/microsoft/callback?code=c&state=${encodeURIComponent(state)}`,
      "/api/storage/oauth/google/callback?code=c&state=forged",
    ]) {
      const res = await request(other, path)
      expect(new URL(res.headers.get("location") as string).searchParams.has("error")).toBe(true)
    }
    expect(calls).toHaveLength(0)
    expect(await prisma.storageConnection.count()).toBe(0)
  })
})

describe("writing to Google Drive", () => {
  const conn = async () => ({
    id: "c1",
    provider: "GOOGLE_DRIVE",
    rootFolder: "Sahihi",
    secretEncrypted: await encryptSecret(getEnv().BETTER_AUTH_SECRET, "rt"),
  })
  const bytes = new TextEncoder().encode("%PDF signed")

  test("creates the folder path once, uploads, and skips the same file next time", async () => {
    const folders = new Map<string, string>()
    let uploaded: { name: string; md5: string } | null = null
    fake = (call) => {
      const url = new URL(call.url)
      if (url.pathname === "/token") return json({ access_token: "at" })
      if (url.pathname === "/drive/v3/files" && call.method === "GET") {
        const q = url.searchParams.get("q") ?? ""
        const name = /name = '([^']*)'/.exec(q)?.[1] as string
        if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
          const id = folders.get(name)
          return json({ files: id ? [{ id }] : [] })
        }
        return json({
          files: uploaded?.name === name ? [{ id: "f1", md5Checksum: uploaded.md5 }] : [],
        })
      }
      if (url.pathname === "/drive/v3/files" && call.method === "POST") {
        const { name } = JSON.parse(String(call.body))
        folders.set(name, `id-${name}`)
        return json({ id: `id-${name}` })
      }
      if (url.pathname === "/upload/drive/v3/files") {
        uploaded = { name: JSON.parse(String(call.body)).name, md5: "" }
        return new Response(null, {
          status: 200,
          headers: { location: "https://www.googleapis.com/upload/session/1" },
        })
      }
      if (url.pathname === "/upload/session/1") {
        if (uploaded)
          uploaded.md5 = createHash("md5")
            .update(call.body as Uint8Array)
            .digest("hex")
        return json({ id: "f1" })
      }
      return json({ error: "unexpected" }, 500)
    }
    const drive = await driveDestination(await conn())
    expect(
      await drive.write(["2026", "Lease"], "Lease (signed).pdf", bytes, "application/pdf"),
    ).toBe("written")
    expect([...folders.keys()]).toEqual(["Sahihi", "2026", "Lease"])
    // The same bytes again: found by name and checksum, not uploaded twice.
    expect(
      await drive.write(["2026", "Lease"], "Lease (signed).pdf", bytes, "application/pdf"),
    ).toBe("exists")
    expect(calls.filter((c) => c.url.includes("/upload/")).length).toBe(2)
    // Different bytes under the same name are refused, never overwritten.
    await expect(
      drive.write(["2026", "Lease"], "Lease (signed).pdf", new Uint8Array([1]), "application/pdf"),
    ).rejects.toBeInstanceOf(WriteOnceError)
  })

  test("a revoked grant is reported plainly", async () => {
    fake = () => json({ error: "invalid_grant" }, 400)
    await expect(driveDestination(await conn())).rejects.toThrow("revoked or expired")
  })
})

describe("writing to OneDrive", () => {
  test("uploads through a session into the app folder; an existing file is skipped; tokens rotate", async () => {
    let rotated = ""
    const existing = new Set<string>()
    fake = (call) => {
      const url = new URL(call.url)
      if (url.pathname.endsWith("/token"))
        return json({ access_token: "at", refresh_token: "rt-2" })
      if (url.pathname.endsWith(":/createUploadSession")) {
        const path = decodeURIComponent(url.pathname)
        return existing.has(path)
          ? json({}, 409)
          : json({ uploadUrl: `https://graph.microsoft.com/upload?p=${encodeURIComponent(path)}` })
      }
      if (url.pathname === "/upload") {
        expect(call.headers.get("content-range")).toBe("bytes 0-10/11")
        existing.add(url.searchParams.get("p") as string)
        return json({ id: "item" }, 201)
      }
      if (call.method === "GET") return json({ size: 11 })
      return json({}, 500)
    }
    const drive = await driveDestination(
      {
        id: "c2",
        provider: "ONEDRIVE",
        rootFolder: "Sahihi",
        secretEncrypted: await encryptSecret(getEnv().BETTER_AUTH_SECRET, "rt-1"),
      },
      {
        onRefreshToken: async (s) => {
          rotated = s
        },
      },
    )
    expect(rotated).not.toBe("")
    expect(rotated).not.toContain("rt-2")
    const bytes = new TextEncoder().encode("%PDF signed")
    expect(await drive.write(["2026"], "a.pdf", bytes, "application/pdf")).toBe("written")
    expect(
      calls.some((c) =>
        c.url.includes("/me/drive/special/approot:/Sahihi/2026/a.pdf:/createUploadSession"),
      ),
    ).toBe(true)
    expect(await drive.write(["2026"], "a.pdf", bytes, "application/pdf")).toBe("exists")
  })
})
