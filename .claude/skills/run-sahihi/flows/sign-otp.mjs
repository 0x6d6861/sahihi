/**
 * Signing page with an email code: request the code and type three digits. Pass a signing token
 * of a recipient with email verification in SIGN_TOKEN.
 */
export default async ({ page, goto, shot }) => {
  await goto(`/sign/${process.env.SIGN_TOKEN}`)
  await page.getByRole("button", { name: "Send code" }).click()
  await page.getByText("Verification code").waitFor()
  await page.keyboard.type("729")
  await page.waitForTimeout(500)
  await shot("sign-otp")
}
