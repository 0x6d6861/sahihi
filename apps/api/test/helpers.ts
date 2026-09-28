import { prisma } from "@sahihi/db"
import { createApp } from "../src/app"
import { auth } from "../src/auth"

// A bare `bun test` from the repo root auto-loads .env (the dev database) and skips preload.ts.
// Fail before anything can touch that database.
if (!new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.endsWith("_test")) {
  throw new Error("Integration tests must run via `bun run test:integration` (needs a *_test DB)")
}

export const app = createApp()

/** Empties every table in the test database. Re-checks the live connection's database name. */
export async function resetDb() {
  const [db] = await prisma.$queryRaw<{ name: string }[]>`select current_database() as name`
  if (!db?.name.endsWith("_test")) {
    throw new Error(`Refusing to truncate non-test database "${db?.name}"`)
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ")
  await prisma.$executeRawUnsafe(`truncate table ${list} restart identity cascade`)
}

export interface Sender {
  userId: string
  organizationId: string
  cookie: string
}

let seq = 0

/**
 * A verified user with an active organization, signed in through better-auth.
 * `withOrganization: false` gives a signed-in user with no active org.
 */
export async function createSender(
  label: string,
  { withOrganization = true }: { withOrganization?: boolean } = {},
): Promise<Sender> {
  seq += 1
  const email = `${label}-${seq}-${crypto.randomUUID().slice(0, 8)}@example.test`
  const password = `pw-${crypto.randomUUID()}`
  const { user } = await auth.api.signUpEmail({ body: { email, password, name: label } })
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } })

  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  if (!cookie) throw new Error("sign-in returned no session cookie")

  let organizationId = ""
  if (withOrganization) {
    const org = await auth.api.createOrganization({
      body: { name: `${label} Ltd`, slug: `${label}-${seq}-${crypto.randomUUID().slice(0, 6)}` },
      headers: new Headers({ cookie }),
    })
    if (!org) throw new Error("createOrganization returned nothing")
    organizationId = org.id
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: new Headers({ cookie }),
    })
  }
  return { userId: user.id, organizationId, cookie }
}

/** A new signed-in user who joins `org`'s organization with `role` and makes it active. */
export async function joinOrganization(
  org: Sender,
  label: string,
  role: "owner" | "admin" | "member",
): Promise<Sender> {
  const user = await createSender(label, { withOrganization: false })
  await auth.api.addMember({
    body: { userId: user.userId, organizationId: org.organizationId, role },
  })
  await auth.api.setActiveOrganization({
    body: { organizationId: org.organizationId },
    headers: new Headers({ cookie: user.cookie }),
  })
  return { ...user, organizationId: org.organizationId }
}

/** `app.request` as a sender. `json` sets the body and Content-Type. */
export function request(
  sender: Sender | null,
  path: string,
  init: RequestInit & { json?: unknown } = {},
) {
  const { json, headers, ...rest } = init
  const h = new Headers(headers)
  if (sender) h.set("cookie", sender.cookie)
  if (json !== undefined) h.set("content-type", "application/json")
  return app.request(path, {
    ...rest,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
}

/**
 * A valid PDF with `pages` empty US Letter pages, built by hand so tests need no PDF library.
 * The xref offsets are computed, so strict parsers accept it too.
 */
export function minimalPdf(pages = 1): Uint8Array {
  const objects: string[] = []
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ")
  objects.push("<< /Type /Catalog /Pages 2 0 R >>")
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`)
  for (let i = 0; i < pages; i++) {
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>")
  }
  let body = "%PDF-1.7\n"
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

export async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Buffer.from(digest).toString("hex")
}

interface UploadedDocument {
  id: string
  status: string
  sha256: string | null
  pageCount: number | null
  organizationId: string
}

/** Full upload flow: create → PUT bytes to the presigned URL (real MinIO) → complete. */
export async function uploadDocument(
  sender: Sender,
  bytes: Uint8Array = minimalPdf(),
  name = "contract.pdf",
): Promise<{ status: number; document: UploadedDocument }> {
  const created = await request(sender, "/api/documents/uploads", {
    method: "POST",
    json: { name, sizeBytes: bytes.byteLength, contentType: "application/pdf" },
  })
  if (created.status !== 201) throw new Error(`create upload: ${created.status}`)
  const { document, uploadUrl } = (await created.json()) as {
    document: { id: string }
    uploadUrl: string
  }
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: bytes,
    headers: { "content-type": "application/pdf" },
  })
  if (!put.ok) throw new Error(`PUT to storage: ${put.status}`)
  const completed = await request(sender, `/api/documents/${document.id}/complete`, {
    method: "POST",
  })
  const body = (await completed.json()) as { document: UploadedDocument }
  return { status: completed.status, document: body.document }
}
