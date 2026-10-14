/**
 * Settings → Storage: connect the local MinIO `sahihi-customer` bucket as a sync destination
 * (docs/storage.md → Local development). Needs an Enterprise or Business session.
 *   bun .claude/skills/run-sahihi/driver.mjs flow .claude/skills/run-sahihi/flows/connect-storage.mjs
 */
export default async ({ page, goto, shot }) => {
  await goto("/settings/storage")
  await page.getByRole("heading", { name: "Sync", exact: true }).waitFor({ timeout: 60_000 })
  await page.getByRole("button", { name: "Add a bucket" }).click()
  const dialog = page.getByRole("dialog")
  // Arc's Select is Radix: open the combobox, then pick the option (it renders outside the dialog).
  await dialog.getByRole("combobox", { name: "Provider" }).click()
  await page.getByRole("option", { name: "Other S3-compatible" }).click()
  // Labels overlap ("Bucket" / "Folder in the bucket"), so match them exactly.
  await dialog.getByLabel("Name", { exact: true }).fill("Local archive")
  await dialog.getByLabel("Endpoint URL").fill("http://localhost:9000")
  await dialog.getByLabel("Bucket", { exact: true }).fill("sahihi-customer")
  await dialog.getByLabel("Folder in the bucket (optional)").fill(`agent-${Date.now()}`)
  await dialog.getByLabel("Access key ID").fill("sahihi")
  await dialog.getByLabel("Secret access key").fill("sahihi-secret")
  await shot("storage-dialog")
  await dialog.getByRole("button", { name: "Connect and test" }).click()
  await page.getByText("Connected and tested").first().waitFor({ timeout: 30_000 })
  await page.getByText("Local archive").first().waitFor()
  await shot("storage-connected")
}
