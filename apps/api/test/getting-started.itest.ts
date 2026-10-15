import { beforeEach, describe, expect, test } from "bun:test"
import {
  createSender,
  joinOrganization,
  request,
  resetDb,
  type Sender,
  uploadDocument,
} from "./helpers"

// ADR 0061: the Get started checklist on All files.
interface Checklist {
  steps: { step: string; done: boolean }[]
  done: number
  total: number
  complete: boolean
  dismissed: boolean
}

let alice: Sender

const checklist = async (sender: Sender = alice) =>
  (await (await request(sender, "/api/getting-started")).json()) as Checklist
const doneSteps = (c: Checklist) => c.steps.filter((s) => s.done).map((s) => s.step)

describe("GET /api/getting-started", () => {
  beforeEach(async () => {
    await resetDb()
    alice = await createSender("alice")
  })

  test("a new workspace has only the workspace step done", async () => {
    const c = await checklist()
    expect(doneSteps(c)).toEqual(["workspace"])
    expect(c).toMatchObject({ done: 1, total: 5, complete: false, dismissed: false })
  })

  test("a teammate and an upload tick their steps", async () => {
    await joinOrganization(alice, "bob", "member")
    await uploadDocument(alice)
    expect(doneSteps(await checklist())).toEqual(["workspace", "team", "upload"])
  })

  test("counts only the caller's workspace", async () => {
    const mallory = await createSender("mallory")
    await uploadDocument(mallory)
    expect(doneSteps(await checklist())).toEqual(["workspace"])
  })
})

describe("PUT /api/getting-started", () => {
  beforeEach(async () => {
    await resetDb()
    alice = await createSender("alice")
  })

  test("hides and shows again, per member", async () => {
    const bob = await joinOrganization(alice, "bob", "member")
    const put = await request(alice, "/api/getting-started", {
      method: "PUT",
      json: { dismissed: true },
    })
    expect(put.status).toBe(200)
    expect((await checklist()).dismissed).toBe(true)
    expect((await checklist(bob)).dismissed).toBe(false)

    await request(alice, "/api/getting-started", { method: "PUT", json: { dismissed: false } })
    expect((await checklist()).dismissed).toBe(false)
  })

  test("refuses a body that isn't a boolean", async () => {
    const res = await request(alice, "/api/getting-started", {
      method: "PUT",
      json: { dismissed: "yes" },
    })
    expect(res.status).toBe(400)
  })
})
