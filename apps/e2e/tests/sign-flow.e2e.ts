import path from "node:path"
import { expect, type Page, test } from "@playwright/test"
import { linkFromEmail } from "./mailpit"

/**
 * The core journey, through the real UI and real email (Mailpit):
 * sign-up → verify email → create workspace → upload → create envelope → add recipient →
 * place a signature field → send → signer opens the emailed link → signs → worker finalizes →
 * signed PDF + certificate → public /verify page.
 */

const run = Date.now().toString(36)
const sender = {
  name: "Wanjiru E2E",
  email: `sender-${run}@example.test`,
  password: `Pw-e2e-${run}-long`,
}
const signer = { name: "Otieno E2E", email: `signer-${run}@example.test` }
const fixture = path.resolve(import.meta.dirname, "../../../fixtures/mixed-sizes.pdf")

/** Dev pages compile on first visit; typing before React hydrates is lost. Wait for it. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle")
}

test("sender signs up, sends an envelope; the signer signs; a certificate is issued", async ({
  page,
  browser,
}) => {
  // ── Sign up and verify email ──
  await page.goto("/sign-up")
  await settle(page)
  await page.getByLabel("Full name").fill(sender.name)
  await page.getByLabel("Work email").fill(sender.email)
  await page.getByLabel("Password").fill(sender.password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  await expect(page.getByText("Check your email")).toBeVisible()

  const verifyLink = await linkFromEmail(sender.email, /https?:\/\/[^\s"<>]+verify-email[^\s"<>]+/)
  await page.goto(verifyLink)

  // ── Create the workspace ──
  await page.waitForURL(/\/onboarding/)
  await settle(page)
  await page.getByLabel("Workspace name").fill(`E2E Ltd ${run}`)
  await page.getByRole("button", { name: "Continue" }).click()
  await page.waitForURL(/\/documents/)

  // ── Upload a PDF ──
  await settle(page)
  await page.locator('input[type="file"]').first().setInputFiles(fixture)
  const docLink = page.getByRole("link", { name: /mixed-sizes/ }).first()
  await expect(docLink).toBeVisible({ timeout: 60_000 })
  await docLink.click()

  // ── Create an envelope and add the signer ──
  await page.getByRole("link", { name: "Create envelope" }).click()
  await page.waitForURL(/\/envelopes\/new/)
  await settle(page)
  await page.getByRole("button", { name: "Create draft" }).click()
  await page.waitForURL(/\/envelopes\/[a-z0-9]{20,}$/)
  await settle(page)
  await page.getByRole("tab", { name: /Recipients/ }).click()
  await page.getByLabel("Name").first().fill(signer.name)
  await page.getByLabel("Email").first().fill(signer.email)
  await page.getByRole("button", { name: "Save recipients" }).click()
  await expect(page.getByText("All changes saved").first()).toBeVisible()

  // ── Place a signature field on page 1 ──
  await page.getByRole("tab", { name: /Document/ }).click()
  await page
    .getByRole("radio", { name: "Signature" })
    .or(page.getByRole("button", { name: "Signature" }))
    .first()
    .click()
  const layer = page.locator("[data-field-layer]").first()
  await expect(layer).toBeVisible({ timeout: 60_000 })
  await layer.click({ position: { x: 120, y: 160 } })
  await expect(
    page.getByRole("button", { name: new RegExp(`Signature for ${signer.name}`) }),
  ).toBeVisible()

  // ── Send ──
  await page.getByRole("button", { name: "Send", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Send", exact: true }).click()
  await expect(page.getByText("Envelope sent")).toBeVisible()
  const envelopeUrl = page.url()

  // ── The signer signs (no account, separate browser context) ──
  const signLink = await linkFromEmail(
    signer.email,
    /https?:\/\/[^\s"<>]+\/sign\/[A-Za-z0-9_-]{43}/,
  )
  const signerContext = await browser.newContext()
  const signerPage = await signerContext.newPage()
  await signerPage.goto(signLink)
  await settle(signerPage)
  await signerPage
    .getByRole("button", { name: /Add signature/ })
    .first()
    .click()
  const dialog = signerPage.getByRole("dialog")
  await dialog.getByRole("tab", { name: "Type" }).click()
  await dialog.getByLabel("Type your name").fill(signer.name)
  await dialog.getByRole("button", { name: "Adopt and place" }).click()
  await signerPage.getByRole("checkbox", { name: /I agree to sign/ }).click()
  await signerPage.getByRole("button", { name: /^Finish signing/ }).click()
  await expect(signerPage.getByText(/signed|complete/i).first()).toBeVisible()
  await signerContext.close()

  // ── The worker stamps the PDF and issues the certificate ──
  await expect
    .poll(
      async () => {
        await page.goto(envelopeUrl)
        // The card shows at COMPLETED; the certificate (and this link) follow once finalize ran.
        return page.getByRole("link", { name: "Public verification page" }).isVisible()
      },
      { timeout: 90_000, intervals: [3_000] },
    )
    .toBe(true)
  await expect(
    page.getByText("The signed PDF and the Certificate of Completion are ready"),
  ).toBeVisible()
  const verifyHref = await page
    .getByRole("link", { name: "Public verification page" })
    .getAttribute("href")
  expect(verifyHref).toMatch(/^\/verify\/[A-Z0-9-]+$/)

  // ── Anyone can verify the certificate ──
  const publicPage = await (await browser.newContext()).newPage()
  await publicPage.goto(verifyHref as string)
  await expect(publicPage.getByText(/valid|verified/i).first()).toBeVisible()
  await expect(publicPage.getByText(`E2E Ltd ${run}`)).toBeVisible()

  // The signer is emailed their copy.
  await linkFromEmail(signer.email, /https?:\/\/[^\s"<>]+\/sign\/[A-Za-z0-9_-]{43}/)
})
