import { expect, test } from "@playwright/test"
import { draftWithAssistant } from "./drafting"
import { Api, createAccount, openAs, people, signAs } from "./seed"
import { newPage, open, SCALE, shoot } from "./shoot"

test("showcase: seed a believable workspace and capture the real screens", async ({
  page,
  browser,
}) => {
  const api = new Api(page.request)
  const ids = { nda: "", offer: "", policy: "", board: "" }

  await test.step("account and workspace", async () => {
    await createAccount(page)
    await api.call("PUT", "/generated-documents/settings", { enabled: true })
  })

  await test.step("mutual NDA: drafted, finalised, sent and signed", async () => {
    const nda = await api.draftFromStarter("mutual-nda", [
      { key: "party_a", person: people.achieng },
      { key: "party_b", person: people.baraka },
      { key: "counsel", label: "Legal counsel", viewer: true, person: people.amina },
    ])
    const envelopeId = await api.finalize(nda.id, nda.versionId)
    await api.details(
      envelopeId,
      "Mutual NDA — Kilima Agro",
      "Baraka, here is the NDA we discussed for the cold-chain pilot. Amina has a copy for review.",
    )
    await api.send(envelopeId)
    await signAs(browser, people.achieng.email, "Mutual NDA — Kilima Agro", 1)
    await signAs(browser, people.baraka.email, "Mutual NDA — Kilima Agro", 2)
    ids.nda = envelopeId
  })

  await test.step("offer letter: sent, the candidate has opened it", async () => {
    const offer = await api.draftFromStarter("offer-letter", [
      { key: "employer", person: people.achieng },
      { key: "candidate", person: people.juma },
    ])
    const envelopeId = await api.finalize(offer.id, offer.versionId)
    await api.details(
      envelopeId,
      "Offer letter — Juma Ochieng, Operations Coordinator",
      "Juma, congratulations. Please read and sign your offer by 23 October.",
      "SEQUENTIAL",
    )
    await api.send(envelopeId)
    await signAs(browser, people.achieng.email, "Offer letter — Juma Ochieng", 3)
    await openAs(browser, people.juma.email, "Offer letter — Juma Ochieng")
    ids.offer = envelopeId
  })

  await test.step("IT acceptable use policy: email code before signing", async () => {
    const policy = await api.draftFromStarter("acceptable-use-policy", [
      { key: "approver", person: people.wanjiru },
      { key: "employee", person: people.njeri },
    ])
    const envelopeId = await api.finalize(policy.id, policy.versionId)
    await api.details(
      envelopeId,
      "IT acceptable use policy — Njeri Wambui",
      "Please read and sign.",
    )
    await api.requireEmailCode(envelopeId, people.njeri.email)
    await api.send(envelopeId)
    await signAs(browser, people.wanjiru.email, "IT acceptable use policy — Njeri Wambui", 4)
    ids.policy = envelopeId
  })

  await test.step("board resolution: a draft in the editor", async () => {
    const board = await api.draftFromStarter("board-resolution", [
      { key: "director_1", label: "Director", person: people.achieng },
      { key: "director_2", label: "Director", person: people.david },
    ])
    const envelopeId = await api.finalize(board.id, board.versionId)
    await api.details(envelopeId, "Board resolution — Athi River depot lease", "", "SEQUENTIAL")
    ids.board = envelopeId
  })

  // ── Screens ──
  const storageState = await page.context().storageState()
  const sender = await newPage(browser, { storageState })

  await test.step("completed envelope, all files", async () => {
    await expect
      .poll(async () => (await api.envelope(ids.nda)).envelope.certificate?.code ?? null, {
        timeout: 120_000,
        intervals: [2_000],
      })
      .not.toBeNull()
    await open(sender, `/envelopes/${ids.nda}`)
    await shoot(sender, "envelope")
    await open(sender, "/files")
    await shoot(sender, "files")
  })

  await test.step("a drafted document, before the assistant", async () => {
    const draft = await api.draftFromStarter("mutual-nda", [
      { key: "party_a", person: people.achieng },
      { key: "party_b", person: people.baraka },
    ])
    await open(sender, `/generate/${draft.id}`)
    // Without the model, the drafting shot is this draft: blanks filled, assistant ready to start.
    // The assistant step below replaces it with a live conversation.
    await shoot(sender, "drafting")
  })

  // The real assistant (AI_MODEL). SHOWCASE_SKIP_AI makes no model calls: the plain draft
  // captured above stays the drafting reference.
  await test.step("drafting with the assistant", async () => {
    if (process.env.SHOWCASE_SKIP_AI) return
    const { id } = await api.call<{ id: string }>("POST", "/generated-documents", {
      starter: "mutual-nda",
    })
    await draftWithAssistant(sender, id)
  })

  await test.step("draft envelope editor", async () => {
    await open(sender, `/envelopes/${ids.board}/edit`)
    const steps = sender.getByRole("navigation", { name: "Steps" })
    await steps.getByRole("button", { name: "Fields" }).click()
    await sender.waitForTimeout(1500)
    const field = sender.getByRole("button", { name: /^Signature for Achieng Otieno/ }).first()
    await field.scrollIntoViewIfNeeded()
    await field.click()
    await sender.waitForTimeout(800)
    await shoot(sender, "editor")
  })

  console.log(JSON.stringify(ids), `scale ${SCALE}`)
})
