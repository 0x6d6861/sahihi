import path from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { linkFromEmail } from "./mailpit"

/**
 * Multi-document envelopes (ADR 0037), through the real UI: one document uploaded on the
 * Documents page, a second uploaded from the draft editor's "Add document", a supporting CSV,
 * a signature field on each document → send → the signer switches documents with "Next field",
 * sees the supporting file, signs both → the worker finalizes both → downloads and /verify list both.
 */

const run = `m${Date.now().toString(36)}`
const sender = {
  name: "Achieng Multi",
  email: `sender-${run}@example.test`,
  password: `Pw-e2e-${run}-long`,
}
const signer = { name: "Kamau Multi", email: `signer-${run}@example.test` }
const fixtures = path.resolve(import.meta.dirname, "../../../fixtures")

async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
}

test("an envelope with two documents and a supporting file is signed and finalized", async ({
  page,
  browser,
}) => {
  // ── Account and workspace ──
  await page.goto("/sign-up")
  await settle(page)
  await page.getByLabel("Full name").fill(sender.name)
  await page.getByLabel("Work email").fill(sender.email)
  await page.getByLabel("Password", { exact: true }).fill(sender.password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  await expect(page.getByText("Check your email")).toBeVisible()
  await page.goto(await linkFromEmail(sender.email, /https?:\/\/[^\s"<>]+verify-email[^\s"<>]+/))
  await page.waitForURL(/\/onboarding/)
  await settle(page)
  await page.getByLabel("Workspace name").fill(`Multi Ltd ${run}`)
  await page.getByRole("button", { name: "Continue" }).click()
  await page.waitForURL(/\/documents/)

  // ── First document, then a draft from it ──
  await settle(page)
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(path.join(fixtures, "mixed-sizes.pdf"))
  const docLink = page.getByRole("link", { name: /mixed-sizes/ }).first()
  await expect(docLink).toBeVisible({ timeout: 60_000 })
  await docLink.click()
  await page.getByRole("link", { name: "Create envelope" }).click()
  await page.waitForURL(/\/envelopes\/new/)
  await settle(page)
  await page.getByRole("button", { name: "Create draft" }).click()
  await page.waitForURL(/\/envelopes\/[a-z0-9]{20,}\/edit/)
  await settle(page)

  // ── Documents step: add a second document by uploading it in the dialog ──
  await expect(page.getByText("Documents to sign")).toBeVisible()
  await page.getByRole("button", { name: "Add document" }).click()
  const add = page.getByRole("dialog", { name: "Add a document" })
  await add.locator('input[type="file"]').setInputFiles(path.join(fixtures, "rotated-90.pdf"))
  await expect(add).toBeHidden({ timeout: 60_000 })
  const list = page.getByRole("list").filter({ hasText: "mixed-sizes.pdf" }).first()
  await expect(list.getByText("rotated-90.pdf")).toBeVisible({ timeout: 30_000 })

  // ── Supporting file ──
  // The supporting-files drop zone is the only file input on the step.
  await page
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "prices.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("item,price\nrent,100\n"),
    })
  await expect(page.getByText("prices.csv")).toBeVisible({ timeout: 30_000 })

  // ── Recipient ──
  const steps = page.getByRole("navigation", { name: "Steps" })
  await steps.getByRole("button", { name: "Recipients" }).click()
  await page.getByLabel("Name").first().fill(signer.name)
  await page.getByLabel("Email").first().fill(signer.email)
  await page.getByRole("button", { name: "Save recipients" }).click()
  await expect(page.getByText("All changes saved").first()).toBeVisible()

  // ── A signature field on each document ──
  await steps.getByRole("button", { name: "Fields" }).click()
  const tools = page.getByRole("complementary", { name: "Field tools" })
  const placeSignature = async () => {
    // The tool stays selected after placing; clicking it again would turn it off.
    const tool = tools.getByRole("button", { name: "Signature", exact: true })
    if ((await tool.getAttribute("aria-pressed")) !== "true") await tool.click()
    const layer = page.locator("[data-field-layer]").first()
    await expect(layer).toBeVisible({ timeout: 60_000 })
    await layer.click({ position: { x: 120, y: 160 } })
  }
  await placeSignature()
  const switcher = page.getByRole("group", { name: "Documents" })
  await switcher.getByRole("button", { name: /^2\. rotated-90/ }).click()
  await placeSignature()
  // Hidden steps stay mounted, so pick the visible status.
  await expect(page.getByText("All changes saved").filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  })

  // ── Send ──
  await page.getByRole("button", { name: "Send", exact: true }).click()
  const review = page.getByRole("dialog", { name: "Review & send" })
  await review.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByText("Envelope sent")).toBeVisible()
  await page.waitForURL(/\/envelopes\/[a-z0-9]{20,}(\?|$)/)
  const envelopeUrl = page.url()

  // ── The signer: two documents, a supporting file ──
  const signLink = await linkFromEmail(
    signer.email,
    /https?:\/\/[^\s"<>]+\/sign\/[A-Za-z0-9_-]{43}/,
  )
  const signerContext = await browser.newContext()
  const signerPage = await signerContext.newPage()
  await signerPage.goto(signLink)
  await settle(signerPage)
  await expect(signerPage.getByText("prices.csv")).toBeVisible()
  await expect(signerPage.getByRole("group", { name: "Documents" })).toBeVisible()

  const sign = async (first: boolean) => {
    await signerPage
      .getByRole("button", { name: /Add signature/ })
      .first()
      .click()
    const dialog = signerPage.getByRole("dialog")
    if (first) {
      await dialog.getByRole("tab", { name: "Type" }).click()
      await dialog.getByLabel("Type your name").fill(signer.name)
      await dialog.getByRole("button", { name: "Adopt and place" }).click()
    } else {
      // The signature adopted on the first document is offered again.
      await dialog.getByRole("button", { name: "Use this signature" }).click()
    }
    await expect(dialog).toBeHidden()
  }
  await sign(true)
  // "Next field" moves to the second document.
  await signerPage.getByRole("button", { name: /Next field/ }).click()
  await expect(
    signerPage.getByRole("group", { name: "Documents" }).getByRole("button", { name: /^2\./ }),
  ).toHaveAttribute("aria-pressed", "true")
  await sign(false)
  await signerPage.getByRole("checkbox", { name: /I agree to sign/ }).click()
  await signerPage.getByRole("button", { name: /^Finish signing/ }).click()
  await expect(signerPage.getByText(/signed|complete/i).first()).toBeVisible()
  await signerContext.close()

  // ── Finalized: both documents signed, one certificate, "Download all" ──
  await expect
    .poll(
      async () => {
        await page.goto(envelopeUrl)
        return page.getByRole("link", { name: "Public verification page" }).isVisible()
      },
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe(true)
  await expect(
    page.getByText("The 2 signed PDFs and the Certificate of Completion are ready"),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Download all", exact: true })).toBeVisible()
  const verifyHref = await page
    .getByRole("link", { name: "Public verification page" })
    .getAttribute("href")
  const publicPage = await (await browser.newContext()).newPage()
  await publicPage.goto(verifyHref as string)
  await expect(publicPage.getByText("1. mixed-sizes.pdf")).toBeVisible()
  await expect(publicPage.getByText("2. rotated-90.pdf")).toBeVisible()
  await expect(publicPage.getByText("prices.csv")).toBeVisible()
})
