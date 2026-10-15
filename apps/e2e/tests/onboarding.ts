import type { Page } from "@playwright/test"

/**
 * Onboarding (ADR 0061): name the workspace, skip inviting, and leave the AI assistant off when
 * that step is offered (only where the server has a model). Ends on All files.
 */
export async function createWorkspace(page: Page, name: string) {
  await page.getByLabel("Workspace name").fill(name)
  await page.getByRole("button", { name: "Create workspace" }).click()
  await page.getByRole("button", { name: "Skip for now" }).click()
  const finish = page.getByRole("button", { name: "Finish setup" })
  const files = page.waitForURL(/\/files/)
  if (await finish.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByText("Not now", { exact: true }).click()
    await finish.click()
  }
  await files
}
