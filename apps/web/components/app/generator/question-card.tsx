"use client"

import type { ToolCallMessagePartComponent } from "@assistant-ui/react"
import {
  type AskQuestionsInput,
  AskQuestionsInputSchema,
  type AskQuestionsResult,
  AskQuestionsResultSchema,
} from "@sahihi/core"
import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, XIcon } from "@/components/app/icons"
import { Button } from "@/components/arc/button/button"
import { Input } from "@/components/arc/input/input"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { Button as CossButton } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import {
  answeredLines,
  answerValues,
  questionDraftKey,
  questionResult,
  resumeQuestions,
} from "@/lib/generator"
import { cn } from "@/lib/utils"
import { useGenerator } from "./generator-context"

/**
 * `ask_questions` (docs/ai-documents.md → Clarifying questions): one question at a time with the
 * assistant's suggested options (keys 1–4 pick one), a free-text answer, Skip, Answer, Back to the
 * previous question, and a dismiss control. The
 * answers are saved to the document first (`POST …/variables`, skips mark the blank skipped), then
 * returned to the assistant as the tool result. Answers given so far are kept in this browser, so
 * after a reload or a failed reply the card resumes at the first unanswered question. Once
 * answered, the card collapses to compact "question → answer or Skipped" rows.
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
  // Which way the last step went, so the next question slides in from that side.
  const [direction, setDirection] = useState<1 | -1>(1)
  const [answers, setAnswers] = useState<Record<string, string | null>>({})
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const draftKey = questionDraftKey(detail.document.id, toolCallId)
  // The parsed input is a new object every render; the questions of one tool call don't change.
  const questions = useRef(input)

  // Pick up the answers given before a reload or a failed reply. After mount, since the server
  // render has no storage.
  useEffect(() => {
    let saved: unknown = null
    try {
      const raw = localStorage.getItem(draftKey)
      saved = raw ? JSON.parse(raw) : null
    } catch {
      // storage blocked or garbled: start from the first question
    }
    const resumed = resumeQuestions(questions.current, saved)
    if (Object.keys(resumed.answers).length === 0) return
    setAnswers(resumed.answers)
    setIndex(resumed.index)
    setDraft(resumed.draft)
  }, [draftKey])

  const remember = (all: Record<string, string | null> | null) => {
    try {
      if (all) localStorage.setItem(draftKey, JSON.stringify(all))
      else localStorage.removeItem(draftKey)
    } catch {
      // a convenience only: the card still works without storage
    }
  }

  // While this card waits, the chat input stays closed.
  useEffect(() => {
    if (!editable) return
    setPendingQuestion(toolCallId)
    return () => setPendingQuestion(null)
  }, [editable, toolCallId, setPendingQuestion])

  const question = input.questions[index]

  // Number keys pick an option, unless the person is typing somewhere.
  const pick = useRef<(n: number) => void>(() => {})
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return
      const n = Number(e.key)
      if (Number.isInteger(n) && n >= 1) pick.current(n)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  if (!editable || !question) {
    return <p className="text-muted-foreground text-sm">The assistant asked questions here.</p>
  }

  const finish = async (all: Record<string, string | null>) => {
    setSaving(true)
    setError(null)
    try {
      const values = answerValues(input, all, detail.version.data.variables)
      if (values.length) await saveVariables(values, "answer")
      onDone(questionResult(input, all))
      remember(null)
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
    remember(next)
    setDraft("")
    if (index + 1 < input.questions.length) {
      setDirection(1)
      setIndex(index + 1)
      field.current?.focus()
    } else void finish(next)
  }

  const back = () => {
    const previous = input.questions[index - 1]
    if (!previous) return
    setDirection(-1)
    setIndex(index - 1)
    setDraft(
      previous.options.includes(answers[previous.id] ?? "") ? "" : (answers[previous.id] ?? ""),
    )
    setError(null)
  }

  pick.current = (n) => {
    const option = question.options[n - 1]
    if (option !== undefined && !saving) answer(option)
  }

  const fills = detail.version.data.variables.find((v) => v.key === question.variableKey)?.label

  return (
    <section
      aria-label="Questions from the assistant"
      className="overflow-hidden rounded-2xl border border-info/50 bg-card shadow-(--shadow-raised)"
    >
      <header className="flex flex-col gap-1.5 px-4 pt-3.5 pb-1">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1">
            {index > 0 && (
              <Tooltip content="Previous question">
                <CossButton
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous question"
                  className="-ml-1.5"
                  disabled={saving}
                  onClick={back}
                >
                  <ArrowLeftIcon aria-hidden />
                </CossButton>
              </Tooltip>
            )}
            <span className="font-mono text-[11px] text-muted-foreground uppercase tabular-nums tracking-wider">
              Question {index + 1} of {input.questions.length}
            </span>
          </span>
          <Tooltip content="Dismiss questions">
            <CossButton
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss questions"
              disabled={saving}
              onClick={() => {
                onDone({ dismissed: true, answers: [] })
                remember(null)
              }}
            >
              <XIcon aria-hidden />
            </CossButton>
          </Tooltip>
        </div>
      </header>

      {/* Keyed by question: each one eases in from the side the step went (opacity only under
          reduced motion). The answer field below stays put, so its focus survives. */}
      <div
        key={question.id}
        className={cn(
          "flex flex-col gap-3 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] starting:opacity-0 motion-reduce:starting:translate-x-0",
          direction === 1 ? "starting:translate-x-2" : "starting:-translate-x-2",
        )}
      >
        <div className={cn("flex flex-col gap-1.5 px-4", question.options.length === 0 && "pb-3")}>
          <h3 className="font-medium text-[15px] leading-snug">{question.question}</h3>
          {fills && <p className="text-muted-foreground text-xs">Fills: {fills}</p>}
        </div>

        {question.options.length > 0 && (
          <div className="flex flex-col gap-1.5 px-3 pb-3">
            {question.options.map((option, i) => (
              // coss, not Arc: Arc's button sizes its label for the morph animation and can't
              // stretch into a left-aligned row with the chevron on the right.
              <CossButton
                key={option}
                variant="outline"
                className="h-auto min-h-10 w-full justify-between gap-3 whitespace-normal py-2 text-left"
                disabled={saving}
                onClick={() => answer(option)}
              >
                <span
                  aria-hidden
                  className="w-3 shrink-0 font-mono text-muted-foreground text-xs tabular-nums [@media(pointer:coarse)]:hidden"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">{option}</span>
                <ChevronRightIcon aria-hidden className="text-muted-foreground" />
              </CossButton>
            ))}
          </div>
        )}
      </div>

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
 * `set_variables`: what the assistant filled from the chat, or why it was refused. When the
 * document on screen doesn't show the applied values yet (the result arrived during this visit),
 * it reloads once. Judged by the data, not by timing: a fast reply can render with its result
 * already there.
 */
export const AppliedNote: ToolCallMessagePartComponent<
  { values?: { key: string; value: string }[] },
  SetVariablesResult
> = ({ args, result }) => {
  const { detail, refresh } = useGenerator()
  const fetched = useRef(false)
  const behind = (args.values ?? []).some(
    (v) => detail.version.data.variables.find((x) => x.key === v.key)?.value !== v.value,
  )
  useEffect(() => {
    if (result?.ok && behind && !fetched.current) {
      fetched.current = true
      void refresh().catch(() => {})
    }
  }, [result, behind, refresh])

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
