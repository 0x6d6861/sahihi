import {
  AskQuestionsInputSchema,
  AskQuestionsResultSchema,
  applyVariableUpdates,
  isValueAttested,
  SetVariablesInputSchema,
} from "@sahihi/core"
import { prisma } from "@sahihi/db"
import { createLogger } from "@sahihi/infra"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  type ToolSet,
  toUIMessageStream,
  type UIMessage,
  validateUIMessages,
} from "ai"
import {
  appendEvent,
  appendVersion,
  LockedError,
  latestVersion,
  StaleVersionError,
} from "../generated-documents"
import { assistantModel, assistantModelId } from "./model"
import { systemPrompt } from "./prompt"

/**
 * One assistant turn on a generated document (docs/ai-documents.md → Assistant): validate the
 * conversation, stream the model's reply, and let it change the document only through tools.
 *
 * - `ask_questions` has no `execute`: the browser renders it as a question card, applies the
 *   answers through `POST …/variables` (a USER version) and returns the result as the tool output.
 * - `set_variables` runs here and only accepts values the person actually typed
 *   (`isValueAttested`); anything else is refused and the model is told to ask instead.
 */
const log = createLogger("assistant")

/** Everything the person typed: chat text and question answers. The provenance check's evidence. */
export function userStatements(messages: UIMessage[]): string[] {
  const out: string[] = []
  for (const m of messages) {
    for (const part of m.parts) {
      if (m.role === "user" && part.type === "text") out.push(part.text)
      if (part.type === "tool-ask_questions" && part.state === "output-available") {
        const result = AskQuestionsResultSchema.safeParse(part.output)
        if (result.success) {
          for (const a of result.data.answers) if (a.value) out.push(a.value)
        }
      }
    }
  }
  return out
}

function tools(ctx: { generatedDocumentId: string; userId: string; statements: string[] }) {
  return {
    ask_questions: {
      description:
        "Ask the person up to three questions about blanks in the document. Shows a question card with your suggested options, a free-text answer and Skip. Their answers fill the blanks automatically.",
      inputSchema: AskQuestionsInputSchema,
    },
    set_variables: {
      description:
        "Fill blanks with values the person stated in the chat, copied exactly as they wrote them. Values they didn't say are refused.",
      inputSchema: SetVariablesInputSchema,
      execute: async ({ values }: { values: { key: string; value: string }[] }) => {
        const base = await latestVersion(prisma, ctx.generatedDocumentId)
        const unknown = values.filter((v) => !base.data.variables.some((x) => x.key === v.key))
        const unsaid = values.filter((v) => !isValueAttested(v.value, ctx.statements))
        if (unknown.length || unsaid.length) {
          await prisma.$transaction((tx) =>
            appendEvent(tx, {
              generatedDocumentId: ctx.generatedDocumentId,
              type: "variables.rejected",
              actor: "AI",
              actorUserId: ctx.userId,
              data: { keys: [...unknown, ...unsaid].map((v) => v.key) },
            }),
          )
          return {
            ok: false,
            error: [
              unknown.length ? `Unknown blanks: ${unknown.map((v) => v.key).join(", ")}.` : "",
              unsaid.length
                ? `The person never said: ${unsaid.map((v) => JSON.stringify(v.value)).join(", ")}. Ask them with ask_questions instead.`
                : "",
            ]
              .filter(Boolean)
              .join(" "),
          }
        }
        try {
          await appendVersion({
            generatedDocumentId: ctx.generatedDocumentId,
            baseVersionId: base.id,
            data: applyVariableUpdates(base.data, values, "chat"),
            actor: "AI",
            userId: ctx.userId,
            reason: `Assistant filled ${values.length === 1 ? "1 blank" : `${values.length} blanks`}`,
            event: { type: "variables.set_by_assistant", data: { keys: values.map((v) => v.key) } },
          })
        } catch (err) {
          if (err instanceof StaleVersionError || err instanceof LockedError) {
            return { ok: false, error: "The document changed meanwhile. Nothing was applied." }
          }
          throw err
        }
        return { ok: true, applied: values.map((v) => v.key) }
      },
    },
  } satisfies ToolSet
}

export async function streamAssistantReply(input: {
  generatedDocumentId: string
  organizationName: string
  userId: string
  messages: unknown
  selectedSectionId: string | null
  abortSignal: AbortSignal
}): Promise<Response> {
  const placeholderTools = tools({ ...input, statements: [] })
  const messages = await validateUIMessages<UIMessage>({
    messages: input.messages as UIMessage[],
    tools: placeholderTools,
  })
  const ctx = { ...input, statements: userStatements(messages) }
  const toolSet = tools(ctx)
  const version = await latestVersion(prisma, input.generatedDocumentId)

  const result = streamText({
    model: assistantModel(),
    system: systemPrompt({
      data: version.data,
      versionId: version.id,
      selectedSectionId: input.selectedSectionId,
      organizationName: input.organizationName,
      today: new Date().toISOString().slice(0, 10),
    }),
    messages: await convertToModelMessages(messages, { tools: toolSet }),
    tools: toolSet,
    stopWhen: isStepCount(5),
    abortSignal: input.abortSignal,
    onEnd: async ({ totalUsage }) => {
      await prisma
        .$transaction((tx) =>
          appendEvent(tx, {
            generatedDocumentId: input.generatedDocumentId,
            type: "assistant.turn",
            actor: "AI",
            actorUserId: input.userId,
            data: {
              model: assistantModelId(),
              inputTokens: totalUsage.inputTokens ?? null,
              outputTokens: totalUsage.outputTokens ?? null,
            },
          }),
        )
        .catch((err) => log.error("assistant turn not recorded", { err }))
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools: toolSet,
      originalMessages: messages,
      onError: (err) => {
        log.error("assistant reply failed", { err })
        return "The assistant couldn't reply. Try again."
      },
      onEnd: async ({ messages: all }) => {
        await prisma.generatedDocument
          .update({
            where: { id: input.generatedDocumentId },
            data: { messages: all as unknown as object },
          })
          .catch((err) => log.error("conversation not saved", { err }))
      },
    }),
  })
}
