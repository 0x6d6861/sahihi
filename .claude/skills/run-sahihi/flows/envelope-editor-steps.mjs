/**
 * Draft envelope editor: a screenshot of each step (Documents, Recipients, Fields, Preview). Pass the
 * draft envelope id in ENVELOPE_ID.
 *   ENVELOPE_ID=… bun .claude/skills/run-sahihi/driver.mjs flow .claude/skills/run-sahihi/flows/envelope-editor-steps.mjs
 */
export default async ({ page, goto, shot }) => {
  const id = process.env.ENVELOPE_ID
  for (const step of ["document", "recipients", "fields", "preview"]) {
    await goto(`/envelopes/${id}/edit?step=${step}`)
    await page.waitForLoadState("networkidle")
    await page.waitForTimeout(1500)
    await shot(`env-${step}`)
  }
}
