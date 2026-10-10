"use client"

import type { ToolCallMessagePartComponent } from "@assistant-ui/react"
import {
  type AskQuestionsInput,
  AskQuestionsInputSchema,
  type AskQuestionsResult,
  AskQuestionsResultSchema,
} from "@sahihi/core"
import { useEffect, useRef, useState } from "react"
import { XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Textarea } from "@/components/arc/textarea/textarea"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as IconButton } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { answeredLines, answerValues, questionResult } from "@/lib/generator"
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
        <li key={line.question} className="flex flex-col gap-0.5 rounded-xl border px-3.5 py-2.5">
          <span className="text-sm">{line.question}</span>
          <span className="text-muted-foreground text-sm">{line.answer ?? "Skipped"}</span>
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
  const { editable, saveVariables, refresh, setPendingQuestion } = useGenerator()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

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
      textarea.current?.focus()
    } else void finish(next)
  }

  return (
    <section
      aria-label="Questions from the assistant"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-sm tabular-nums">
            Question {index + 1} of {input.questions.length}
          </span>
          <h3 className="font-medium text-base">{question.question}</h3>
        </div>
        <Tooltip content="Dismiss questions">
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss questions"
            disabled={saving}
            onClick={() => onDone({ dismissed: true, answers: [] })}
          >
            <XIcon aria-hidden />
          </IconButton>
        </Tooltip>
      </header>

      {question.options.length > 0 && (
        <div className="flex flex-col gap-2">
          {question.options.map((option) => (
            <Button
              key={option}
              variant="secondary"
              className="justify-start"
              disabled={saving}
              onClick={() => answer(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      )}

      <Textarea
        ref={textarea}
        label={question.options.length > 0 ? "Or type your answer" : "Your answer"}
        rows={2}
        value={draft}
        disabled={saving}
        error={error ?? undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && draft.trim()) {
            e.preventDefault()
            answer(draft)
          }
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={saving} onClick={() => answer(null)}>
          Skip
        </Button>
        <Button loading={saving} disabled={!draft.trim() || saving} onClick={() => answer(draft)}>
          Answer
        </Button>
      </div>
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
  return <p className="text-muted-foreground text-sm">Filled {labels.join(", ")}.</p>
}
