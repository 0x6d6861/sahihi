/**
 * Drafting with AI: select a section in Preview to ask about it (no model call). Pass the draft id
 * in DRAFT_ID (create one with `api POST /generated-documents '{"starter":"mutual-nda"}'`).
 *   DRAFT_ID=… bun .claude/skills/run-sahihi/driver.mjs flow .claude/skills/run-sahihi/flows/draft-select-section.mjs
 */
export default async ({ page, goto, shot }) => {
  await goto(`/generate/${process.env.DRAFT_ID}`)
  await page
    .getByRole("button", { name: "2. Purpose" })
    .or(page.getByRole("button", { name: "Purpose" }))
    .first()
    .click()
  await page.waitForTimeout(400)
  await shot("draft-selected")
}
