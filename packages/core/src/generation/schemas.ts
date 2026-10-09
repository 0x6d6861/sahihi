import { z } from "zod"
import { DocContentSchema, VariableSchema, VariableValueSchema } from "./model"
import { SignersDefinitionSchema } from "./signers"

/**
 * Validators shared by the assistant's tools (server), the chat UI that renders them (web) and the
 * REST routes behind the generator page.
 */

const VariableKey = VariableSchema.shape.key

// ── Assistant tools ──────────────────────────────────────────────────────────
/** At most this many questions per batch, so the person is never handed a form. */
export const MAX_QUESTIONS_PER_BATCH = 3

export const AskQuestionsInputSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        /** The blank this question fills. Answers go straight into it; skips mark it skipped. */
        variableKey: VariableKey,
        question: z.string().trim().min(1).max(300),
        /** Suggested answers shown as buttons. Generic choices only, never a person's details. */
        options: z.array(z.string().trim().min(1).max(80)).max(4).default([]),
      }),
    )
    .min(1)
    .max(MAX_QUESTIONS_PER_BATCH),
})
export type AskQuestionsInput = z.infer<typeof AskQuestionsInputSchema>

/** What the question card sends back. `dismissed`: closed without answering; nothing changes. */
export const AskQuestionsResultSchema = z.object({
  dismissed: z.boolean().default(false),
  answers: z
    .array(z.object({ questionId: z.string(), value: VariableValueSchema.nullable() }))
    .max(MAX_QUESTIONS_PER_BATCH)
    .default([]),
})
export type AskQuestionsResult = z.infer<typeof AskQuestionsResultSchema>

export const SetVariablesInputSchema = z.object({
  values: z
    .array(z.object({ key: VariableKey, value: VariableValueSchema }))
    .min(1)
    .max(20),
})
export type SetVariablesInput = z.infer<typeof SetVariablesInputSchema>

// ── REST ─────────────────────────────────────────────────────────────────────
export const CreateGeneratedDocumentSchema = z.object({
  starter: z.string().trim().min(1).max(60),
})

/**
 * `POST /generated-documents/:id/variables`. `answer`: from a question card (null = skipped);
 * `edit`: typed into the document directly (null clears the value).
 */
export const UpdateVariablesSchema = z.object({
  baseVersionId: z.string().min(1).max(64),
  source: z.enum(["answer", "edit"]),
  values: z
    .array(z.object({ key: VariableKey, value: VariableValueSchema.nullable() }))
    .min(1)
    .max(50),
})
export type UpdateVariablesInput = z.infer<typeof UpdateVariablesSchema>

/**
 * `PUT /generated-documents/:id/signers`: roles, contacts and each role's fields, applied with
 * `applySigners`. Contacts are checked in full by the finalise preflight.
 */
export const UpdateSignersSchema = z.object({
  baseVersionId: z.string().min(1).max(64),
  signers: SignersDefinitionSchema,
})
export type UpdateSignersInput = z.infer<typeof UpdateSignersSchema>

/**
 * `PUT /generated-documents/:id/content`: the text as edited in the editor, plus any blanks the
 * person inserted that don't exist yet. Applied on top of the latest version when only blanks or
 * signers changed since `baseVersionId`; a 409 when the text itself changed.
 */
export const UpdateContentSchema = z.object({
  baseVersionId: z.string().min(1).max(64),
  content: DocContentSchema,
  newVariables: z
    .array(
      z.object({
        key: VariableKey,
        label: VariableSchema.shape.label,
        type: VariableSchema.shape.type,
      }),
    )
    .max(20)
    .default([]),
})
export type UpdateContentInput = z.infer<typeof UpdateContentSchema>

export const FinalizeGeneratedDocumentSchema = z.object({
  versionId: z.string().min(1).max(64),
  /** "I've reviewed this document": AI drafts are never sent unread. */
  acknowledged: z.literal(true, { error: "Confirm you've reviewed the document." }),
})
