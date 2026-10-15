/**
 * Signing page: the document with its side panel, the signature dialog, the required-fields
 * warning and the decline dialog. Pass a fresh signing token in SIGN_TOKEN (a sent envelope's
 * invite in Mailpit). Nothing is submitted.
 *   SIGN_TOKEN=… bun .claude/skills/run-sahihi/driver.mjs flow .claude/skills/run-sahihi/flows/sign-states.mjs
 */
export default async ({ page, goto, shot }) => {
  await goto(`/sign/${process.env.SIGN_TOKEN}`)
  await page.getByText("Your fields").waitFor({ timeout: 60_000 })
  await page.locator("[data-field-id]").first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(1500)
  await shot("sign-ready")
  await page
    .getByRole("button", { name: /Add signature/ })
    .first()
    .click()
  await page.getByRole("dialog").waitFor()
  await page.waitForTimeout(500)
  await shot("sign-capture")
  await page.keyboard.press("Escape")
  await page.getByRole("checkbox").last().check()
  await page.getByRole("button", { name: "Finish signing" }).click()
  await page.waitForTimeout(800)
  await shot("sign-missing")
  await page.getByRole("button", { name: "Decline to sign" }).click()
  await page.getByRole("dialog").waitFor()
  await page.waitForTimeout(400)
  await shot("sign-decline")
}
