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
  email: string
  password: string
}

let seq = 0

/**
 * A verified user with an active organization, signed in through better-auth.
 * `withOrganization: false` gives a signed-in user with no active org.
 * Test orgs are on the unlimited Enterprise plan so quotas never interfere; billing tests pass
 * `plan` to test limits (docs/billing.md).
 */
export async function createSender(
  label: string,
  {
    withOrganization = true,
    plan = "enterprise",
  }: { withOrganization?: boolean; plan?: "free" | "starter" | "business" | "enterprise" } = {},
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
    await prisma.subscription.create({ data: { organizationId, plan } })
    await auth.api.setActiveOrganization({
      body: { organizationId },
      headers: new Headers({ cookie }),
    })
  }
  return { userId: user.id, organizationId, cookie, email, password }
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
  const kids = Array.from({ length: pages }, (_, i) => `${3 + i} 0 R`).join(" ")
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`,
    ...Array.from(
      { length: pages },
      () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
    ),
  ])
}

/** One US Letter page with an AcroForm: a "Buyer Signature" signature widget and a "Seller Date" text widget. */
export function formPdf(): Uint8Array {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R] >> >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Annots [4 0 R 5 0 R] >>",
    "<< /Type /Annot /Subtype /Widget /FT /Sig /T (Buyer Signature) /Rect [61.2 79.2 183.6 118.8] /F 4 >>",
    "<< /Type /Annot /Subtype /Widget /FT /Tx /T (Seller Date) /Rect [306 79.2 428.4 99] /F 4 >>",
  ])
}

/** One US Letter page with `lines` of Helvetica text, one per 40pt from the top (y = 700, 660, …). */
export function textPdf(...lines: string[]): Uint8Array {
  const esc = (t: string) => t.replace(/[\\()]/g, "\\$&")
  const content = lines
    .map((t, i) => `BT /F1 12 Tf 72 ${700 - i * 40} Td (${esc(t)}) Tj ET`)
    .join("\n")
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ])
}

/** Objects (numbered from 1, object 1 is the catalog) → PDF bytes with a computed xref. */
function buildPdf(objects: string[]): Uint8Array {
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
  { folderId }: { folderId?: string } = {},
): Promise<{ status: number; document: UploadedDocument }> {
  const created = await request(sender, "/api/documents/uploads", {
    method: "POST",
    json: { name, sizeBytes: bytes.byteLength, contentType: "application/pdf", folderId },
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
