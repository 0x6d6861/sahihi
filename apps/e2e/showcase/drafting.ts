import { expect, type Locator, type Page } from "@playwright/test"
import { open, shoot } from "./shoot"

/**
 * A real conversation with the drafting assistant (the model in AI_MODEL). Its wording and its
 * questions vary from run to run, so answers are picked by what each question asks; anything
 * unexpected is skipped, as a person would.
 */
const ANSWERS: [RegExp, string][] = [
  // Most specific first: a question about the survival period may also mention "effective date".
  [/confidential.*(continue|survive|last|after)|survival|after the agreement ends/i, "3 years"],
  [/behalf of tana|for tana|tana freight/i, "Achieng Otieno, achieng@tanafreight.co.ke"],
  [/behalf of savanna|for savanna|savanna/i, "Grace Njoroge, grace@savannafresh.co.ke"],
  [/law|jurisdiction/i, "Kenya"],
  [/how long|term|duration/i, "2 years"],
  [/effective|start date|take effect/i, "1 November 2026"],
]

const OPENING =
  "We're Tana Freight Ltd (Godown 14, Enterprise Road, Industrial Area, Nairobi). Draft this NDA " +
  "with Savanna Fresh Exports Ltd of Moi South Lake Road, Naivasha. We're sharing route plans and " +
  "pricing before a cold-chain pilot for their cut flowers."

/** The assistant has finished its turn: no "Thinking…" or streaming indicator left. */
async function idle(page: Page) {
  await page.waitForTimeout(1500)
  await expect(page.getByText(/^(Thinking|Writing|Working)/)).toHaveCount(0, { timeout: 180_000 })
  await page.waitForTimeout(1500)
  if (await page.getByText("The assistant couldn't reply").count()) {
    throw new Error(
      "The assistant couldn't reply: check AI_MODEL and the provider account (api log), " +
        "or run with SHOWCASE_SKIP_AI=1 to keep the drafting shots you have",
    )
  }
}

function questionCard(page: Page): Locator {
  return page
    .getByText(/^Question \d+ of \d+$/i)
    .locator("xpath=ancestor::div[.//button[normalize-space()='Skip']][1]")
}

async function send(page: Page, message: string) {
  const box = page.getByPlaceholder(/Message the assistant/)
  await box.fill(message)
  await box.press("Enter")
  await idle(page)
}

/** Answer every open question card; shoot the first card that offers choices. */
async function answerQuestions(page: Page, shots: { taken: boolean }) {
  for (let turn = 0; turn < 12; turn++) {
    const card = questionCard(page)
    if (!(await card.count())) return
    const text = await card.first().innerText()
    const options = card.first().getByRole("button", { name: /^\d\s*\S/ })
    if (!shots.taken && (await options.count()) > 1) {
      await shoot(page, "drafting")
      shots.taken = true
    }
    const answer = ANSWERS.find(([re]) => re.test(text))?.[1]
    const option = answer
      ? card.first().getByRole("button", { name: new RegExp(`^\\d\\s*${answer}$`, "i") })
      : null
    if (option && (await option.count())) {
      await option.first().click()
    } else if (answer) {
      await card
        .first()
        .getByLabel(/answer/i)
        .first()
        .fill(answer)
      await card
        .first()
        .getByRole("button", { name: /^Answer/ })
        .click()
    } else {
      await card.first().getByRole("button", { name: "Skip" }).click()
    }
    await page.waitForTimeout(1200)
    // The last answer of a batch hands the turn back to the assistant.
    if (!(await questionCard(page).count())) await idle(page)
  }
}

/** A live conversation, shot while the assistant asks a question that offers choices. */
export async function draftWithAssistant(page: Page, id: string) {
  await open(page, `/generate/${id}`)
  await send(page, OPENING)
  const shots = { taken: false }
  await answerQuestions(page, shots)
  if (!shots.taken) await shoot(page, "drafting")
}
