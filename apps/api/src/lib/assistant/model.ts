import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { getEnv } from "@sahihi/config"
import { createProviderRegistry, type LanguageModel } from "ai"

/**
 * The language model behind the document assistant (docs/ai-documents.md → Provider). `AI_MODEL`
 * picks it as `provider:model`; keys come from the env schema, never from `process.env` here.
 * Unset `AI_MODEL` = the assistant is off.
 */
let override: LanguageModel | null = null

/** Tests only: answer with a scripted model instead of calling a provider. */
export function setAssistantModelForTests(model: LanguageModel | null) {
  override = model
}

export function assistantConfigured(): boolean {
  return override !== null || Boolean(getEnv().AI_MODEL)
}

export function assistantModel(): LanguageModel {
  if (override) return override
  const env = getEnv()
  if (!env.AI_MODEL) throw new Error("AI_MODEL is not set")
  const registry = createProviderRegistry({
    anthropic: createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }),
    openai: createOpenAI({ apiKey: env.OPENAI_API_KEY }),
  })
  return registry.languageModel(env.AI_MODEL as `${"anthropic" | "openai"}:${string}`)
}

/** The model id recorded in the trail (`assistant.turn`). */
export function assistantModelId(): string {
  return override ? "test" : (getEnv().AI_MODEL ?? "")
}
