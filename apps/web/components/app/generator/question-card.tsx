"use client"

import type { ToolCallMessagePartComponent } from "@assistant-ui/react"
import {
  type AskQuestionsInput,
  AskQuestionsInputSchema,
  type AskQuestionsResult,
  AskQuestionsResultSchema,
} from "@sahihi/core"
import { useEffect, useRef, useState } from "react"
import { CheckIcon, ChevronRightIcon, XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as CossButton } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { answeredLines, answerValues, questionResult } from "@/lib/generator"
import { cn } from "@/lib/utils"
import { useGenerator } from "./generator-context"

/**
 * `ask_questions` (docs/ai-documents.md → Clarifying questions): one question at a time with the
 * assistant's suggested options, a free-text answer, Skip and Answer, and a dismiss control. The
 * answers are saved to the document first (`POST …/variables`, skips mark the blank skipped), then
 * returned to the assistant as the tool result. Once answered, the card collapses to compact
 * "question → answer or Skipped" rows.
 */
export const QuestionCard: ToolCallMessagePartComponent<AskQuestionsInput, AskQuestionsResult> = ({
  toolCallId,
  args,
  result,
  addResult,
}) => {
  const parsedResult = AskQuestionsResultSchema.safeParse(result)
  const parsedArgs = AskQuestionsInputSchema.safeParse(args)
  if (result !== undefined && parsedArgs.success && parsedResult.success) {
    return <AnsweredQuestions input={parsedArgs.data} result={parsedResult.data} />
  }
  if (!parsedArgs.success) {
    return <Skeleton className="h-28 w-full rounded-2xl" aria-label="Preparing questions" />
  }
  return <ActiveQuestions toolCallId={toolCallId} input={parsedArgs.data} onDone={addResult} />
}

function AnsweredQuestions({
  input,
  result,
}: {
  input: AskQuestionsInput
  result: AskQuestionsResult
}) {
  if (result.dismissed) {
    return <p className="text-muted-foreground text-sm">Questions dismissed.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {answeredLines(input, result).map((line) => (
        <li
          key={line.question}
          className="flex flex-col gap-0.5 rounded-2xl border bg-card px-4 py-3"
        >
          <span className="text-[13px] text-muted-foreground">{line.question}</span>
          <span
            className={cn(
              "text-sm",
              line.answer ? "font-medium text-foreground" : "text-muted-foreground italic",
            )}
          >
            {line.answer ?? "Skipped"}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ActiveQuestions({
  toolCallId,
  input,
  onDone,
}: {
  toolCallId: string
  input: AskQuestionsInput
  onDone: (result: AskQuestionsResult) => void
}) {
  const { detail, editable, saveVariables, refresh, setPendingQuestion } = useGenerator()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)

  // While this card waits, the chat input stays closed.
  useEffect(() => {
    if (!editable) return
    setPendingQuestion(toolCallId)
    return () => setPendingQuestion(null)
  }, [editable, toolCallId, setPendingQuestion])

  const question = input.questions[index]
  if (!editable || !question) {
    return <p className="text-muted-foreground text-sm">The assistant asked questions here.</p>
  }

  const finish = async (all: Record<string, string | null>) => {
    setSaving(true)
    setError(null)
    try {
      await saveVariables(answerValues(input, all), "answer")
      onDone(questionResult(input, all))
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await refresh().catch(() => {})
      setError(
        err instanceof ApiError && err.status === 409
          ? "The document changed meanwhile. Send your answers again."
          : "Your answers weren't saved. Try again.",
      )
    } finally {
      setSaving(false)
    }
  }

  const answer = (value: string | null) => {
    const next = { ...answers, [question.id]: value }
    setAnswers(next)
    setDraft("")
    if (index + 1 < input.questions.length) {
      setIndex(index + 1)
      field.current?.focus()
    } else void finish(next)
  }

  const fills = detail.version.data.variables.find((v) => v.key === question.variableKey)?.label

  return (
    <section
      aria-label="Questions from the assistant"
      className="overflow-hidden rounded-2xl border border-info/50 bg-card shadow-sm"
    >
      <header className="flex flex-col gap-1.5 px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tabular-nums tracking-wider">
            Question {index + 1} of {input.questions.length}
          </span>
          <Tooltip content="Dismiss questions">
            <CossButton
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss questions"
              disabled={saving}
              onClick={() => onDone({ dismissed: true, answers: [] })}
            >
              <XIcon aria-hidden />
            </CossButton>
          </Tooltip>
        </div>
        <h3 className="font-medium text-[15px] leading-snug">{question.question}</h3>
        {fills && <p className="text-muted-foreground text-xs">Fills: {fills}</p>}
      </header>

      {question.options.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {question.options.map((option) => (
            // coss, not Arc: Arc's button sizes its label for the morph animation and can't
            // stretch into a left-aligned row with the chevron on the right.
            <CossButton
              key={option}
              variant="outline"
              className="h-auto min-h-10 w-full justify-between whitespace-normal py-2 text-left"
              disabled={saving}
              onClick={() => answer(option)}
            >
              <span className="min-w-0 flex-1">{option}</span>
              <ChevronRightIcon aria-hidden className="text-muted-foreground" />
            </CossButton>
          ))}
        </div>
      )}

      <form
        className="flex flex-col gap-2.5 border-t bg-muted/40 px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) answer(draft)
        }}
      >
        <Input
          ref={field}
          label={question.options.length > 0 ? "Or type your own answer" : "Your answer"}
          value={draft}
          disabled={saving}
          error={error ?? undefined}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => answer(null)}
          >
            Skip
          </Button>
          <Button type="submit" size="sm" loading={saving} disabled={!draft.trim() || saving}>
            Answer
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </form>
    </section>
  )
}

interface SetVariablesResult {
  ok: boolean
  applied?: string[]
  error?: string
}

/**
 * `set_variables`: what the assistant filled from the chat, or why it was refused. When a result
 * arrives during this visit, the document reloads to show the new values.
 */
export const AppliedNote: ToolCallMessagePartComponent<
  { values?: { key: string; value: string }[] },
  SetVariablesResult
> = ({ args, result }) => {
  const { detail, refresh } = useGenerator()
  const hadResult = useRef(result !== undefined)
  useEffect(() => {
    if (result?.ok && !hadResult.current) {
      hadResult.current = true
      void refresh().catch(() => {})
    }
  }, [result, refresh])

  if (!result) return null
  if (!result.ok) {
    return <p className="text-muted-foreground text-sm">Not applied: {result.error}</p>
  }
  const labels = (args.values ?? []).map(
    (v) => detail.version.data.variables.find((x) => x.key === v.key)?.label ?? v.key,
  )
  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <CheckIcon aria-hidden className="size-3.5 text-success-foreground" />
      Updated {labels.join(", ")}
    </p>
  )
}
