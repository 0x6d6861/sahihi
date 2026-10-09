import { describe, expect, test } from "bun:test"
import type { AskQuestionsInput } from "@sahihi/core"
import { answeredLines, answerValues, blankState, questionResult, roleIssues } from "./generator"

const input: AskQuestionsInput = {
  questions: [
    { id: "q1", variableKey: "term", question: "How long?", options: ["1 year"] },
    { id: "q2", variableKey: "purpose", question: "What for?", options: [] },
  ],
}

describe("blankState", () => {
  test("filled, skipped or unresolved", () => {
    const v = { key: "k", label: "K", type: "text" as const }
    expect(blankState({ ...v, value: "x", status: "answered" })).toBe("filled")
    expect(blankState({ ...v, value: null, status: "skipped" })).toBe("skipped")
    expect(blankState({ ...v, value: null, status: "unresolved" })).toBe("unresolved")
    expect(blankState(undefined)).toBe("unresolved")
  })
})

describe("question cards", () => {
  test("answers become values; blank or missing answers are skips", () => {
    expect(answerValues(input, { q1: " one year ", q2: "  " })).toEqual([
      { key: "term", value: "one year" },
      { key: "purpose", value: null },
    ])
    expect(answerValues(input, {})).toEqual([
      { key: "term", value: null },
      { key: "purpose", value: null },
    ])
  })

  test("the tool result names every question", () => {
    expect(questionResult(input, { q1: "one year" })).toEqual({
      dismissed: false,
      answers: [
        { questionId: "q1", value: "one year" },
        { questionId: "q2", value: null },
      ],
    })
  })

  test("answered lines pair each question with its answer or a skip", () => {
    const result = questionResult(input, { q1: "one year" })
    expect(answeredLines(input, result)).toEqual([
      { question: "How long?", answer: "one year" },
      { question: "What for?", answer: null },
    ])
  })
})

test("roleIssues keeps one role's problems", () => {
  const issues = [
    { code: "missing_name" as const, message: "a", roleKey: "party_a" },
    { code: "invalid_email" as const, message: "b", roleKey: "party_b" },
    { code: "unresolved_variable" as const, message: "c", variableKey: "term" },
  ]
  expect(roleIssues(issues, "party_a").map((i) => i.message)).toEqual(["a"])
})
