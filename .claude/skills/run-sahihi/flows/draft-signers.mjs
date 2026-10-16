/** Drafting with AI: the Signers tab. DRAFT_ID=… as in draft-select-section.mjs. */
export default async ({ page, goto, shot }) => {
  await goto(`/generate/${process.env.DRAFT_ID}`)
  await page
    .getByRole("group", { name: "Document view" })
    .getByRole("button", { name: "Signers" })
    .click()
  await page.waitForTimeout(500)
  await shot("draft-signers")
}
