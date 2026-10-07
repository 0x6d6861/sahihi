import { beforeEach, describe, expect, test } from "bun:test"
import { prisma } from "@sahihi/db"
import { auth } from "../src/auth"
import { createSender, joinOrganization, request, resetDb } from "./helpers"

/** Settings → Profile and Workspace (docs/auth.md → Account settings). */

type Saved = { email: string; signature: string | null; initials: string | null }
const saved = async (res: Response) => (await res.json()) as Saved

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

beforeEach(resetDb)

describe("saved signatures (/api/me/signatures)", () => {
  test("need a session but no active workspace", async () => {
    expect((await request(null, "/api/me/signatures")).status).toBe(401)
    const loner = await createSender("loner", { withOrganization: false })
    const res = await request(loner, "/api/me/signatures")
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ signature: null, initials: null })
  })

  test("save, read back, replace and remove", async () => {
    const amina = await createSender("amina")
    const put = await request(amina, "/api/me/signatures", {
      method: "PUT",
      json: { kind: "signature", dataUrl: PNG },
    })
    expect(put.status).toBe(200)
    const first = await prisma.savedSignature.findUniqueOrThrow({ where: { userId: amina.userId } })
    expect(first.signatureKey).toStartWith(`user/${amina.userId}/signature-`)

    const read = await saved(await request(amina, "/api/me/signatures"))
    expect(read).toMatchObject({ signature: PNG, initials: null })
    expect(read.email).toContain("@example.test")

    await request(amina, "/api/me/signatures", {
      method: "PUT",
      json: { kind: "signature", dataUrl: PNG },
    })
    const second = await prisma.savedSignature.findUniqueOrThrow({
      where: { userId: amina.userId },
    })
    expect(second.signatureKey).not.toBe(first.signatureKey)

    expect(
      (await request(amina, "/api/me/signatures/signature", { method: "DELETE" })).status,
    ).toBe(204)
    expect((await saved(await request(amina, "/api/me/signatures"))).signature).toBeNull()
  })

  test("are private to their owner", async () => {
    const amina = await createSender("amina")
    const juma = await joinOrganization(amina, "juma", "admin")
    await request(amina, "/api/me/signatures", {
      method: "PUT",
      json: { kind: "initials", dataUrl: PNG },
    })
    const read = await saved(await request(juma, "/api/me/signatures"))
    expect(read.initials).toBeNull()
  })

  test("refuse anything that isn't a PNG", async () => {
    const amina = await createSender("amina")
    const res = await request(amina, "/api/me/signatures", {
      method: "PUT",
      json: { kind: "signature", dataUrl: "data:image/png;base64,PHN2Zz48L3N2Zz4=" },
    })
    expect(res.status).toBe(400)
  })
})

describe("workspace logo", () => {
  test("owners upload it; the public route serves it; emails get the URL", async () => {
    const owner = await createSender("owner")
    const put = await request(owner, "/api/workspace/logo", {
      method: "PUT",
      json: { dataUrl: PNG },
    })
    expect(put.status).toBe(200)
    const { logo } = (await put.json()) as { logo: string }
    expect(logo).toContain(`/api/branding/${owner.organizationId}/logo.png?v=`)
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: owner.organizationId },
    })
    expect(org.logo).toBe(logo)

    const path = new URL(logo).pathname
    const img = await request(null, path)
    expect(img.status).toBe(200)
    expect(img.headers.get("content-type")).toBe("image/png")
    expect(img.headers.get("cross-origin-resource-policy")).toBe("cross-origin")
    expect(img.headers.get("cache-control")).toContain("public")

    expect((await request(owner, "/api/workspace/logo", { method: "DELETE" })).status).toBe(204)
    expect((await request(null, path)).status).toBe(404)
    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: owner.organizationId },
    })
    expect(after.logo).toBeNull()
  })

  test("members can't change it", async () => {
    const owner = await createSender("owner")
    const member = await joinOrganization(owner, "member", "member")
    const res = await request(member, "/api/workspace/logo", {
      method: "PUT",
      json: { dataUrl: PNG },
    })
    expect(res.status).toBe(403)
  })

  test("better-auth can't set an arbitrary logo URL", async () => {
    const owner = await createSender("owner")
    const attempt = auth.api.updateOrganization({
      body: {
        organizationId: owner.organizationId,
        data: { logo: "https://tracker.example/pixel.png" },
      },
      headers: new Headers({ cookie: owner.cookie }),
    })
    await expect(attempt).rejects.toThrow()
    // Renaming still works.
    await auth.api.updateOrganization({
      body: { organizationId: owner.organizationId, data: { name: "Renamed Ltd" } },
      headers: new Headers({ cookie: owner.cookie }),
    })
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: owner.organizationId },
    })
    expect(org).toMatchObject({ name: "Renamed Ltd", logo: null })
  })

  test("an unknown workspace has no logo", async () => {
    expect((await request(null, "/api/branding/nope/logo.png")).status).toBe(404)
  })
})

describe("profile picture", () => {
  test("upload sets User.image; the user and workspace mates can load it, others can't", async () => {
    const amina = await createSender("amina")
    const juma = await joinOrganization(amina, "juma", "member")
    const stranger = await createSender("stranger")

    const put = await request(amina, "/api/me/avatar", { method: "PUT", json: { dataUrl: PNG } })
    expect(put.status).toBe(200)
    const { image } = (await put.json()) as { image: string }
    expect(image).toStartWith(`/api/avatars/${amina.userId}?v=`)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: amina.userId } })
    expect(user.image).toBe(image)

    const own = await request(amina, image)
    expect(own.status).toBe(200)
    expect(own.headers.get("content-type")).toBe("image/png")
    expect(own.headers.get("cache-control")).toContain("private")
    expect((await request(juma, image)).status).toBe(200)
    expect((await request(stranger, image)).status).toBe(404)
    expect((await request(null, image)).status).toBe(401)

    expect((await request(amina, "/api/me/avatar", { method: "DELETE" })).status).toBe(204)
    expect((await request(amina, image)).status).toBe(404)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: amina.userId } })
    expect(after.image).toBeNull()
  })

  test("refuses an oversized picture", async () => {
    const amina = await createSender("amina")
    // 512×1 PNG header: wider than AVATAR_SIZE.
    const bytes = new Uint8Array(33)
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])
    new DataView(bytes.buffer).setUint32(16, 512)
    new DataView(bytes.buffer).setUint32(20, 1)
    const dataUrl = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
    const res = await request(amina, "/api/me/avatar", { method: "PUT", json: { dataUrl } })
    expect(res.status).toBe(400)
  })

  test("better-auth can't point the picture elsewhere, but name updates still work", async () => {
    const amina = await createSender("amina")
    const headers = new Headers({ cookie: amina.cookie })
    await expect(
      auth.api.updateUser({ body: { image: "https://tracker.example/me.png" }, headers }),
    ).rejects.toThrow()
    await auth.api.updateUser({ body: { name: "Amina O." }, headers })
    const user = await prisma.user.findUniqueOrThrow({ where: { id: amina.userId } })
    expect(user).toMatchObject({ name: "Amina O.", image: null })
  })
})
