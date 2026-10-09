import { describe, expect, test } from "bun:test"
import { annotations, parseJunit, toMarkdown } from "./test-summary"

// The shape bun test writes: a suite per file, nested suites per describe.
const BUN = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="5" failures="1" skipped="1" time="1.5">
  <testsuite name="a.test.ts" file="a.test.ts" tests="3" failures="1" skipped="1" time="1.5">
    <testsuite name="math" file="a.test.ts" line="3" tests="3" failures="1" skipped="1" time="1.5">
      <testcase name="adds" classname="math" time="0.1" file="a.test.ts" line="4" />
      <testcase name="divides &amp; rounds" classname="math" time="0.2" file="a.test.ts" line="8">
        <failure type="AssertionError" message="expected 2, got 3" />
      </testcase>
      <testcase name="later" classname="math" time="0" file="a.test.ts" line="12">
        <skipped />
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`

// The shape Playwright writes: no file or line on test cases, failure text in the body.
const PLAYWRIGHT = `<testsuites id="" name="" tests="2" failures="0" skipped="0" errors="0" time="80.2">
<testsuite name="sign-flow.e2e.ts" tests="1" failures="0" skipped="0" time="40.1" errors="0">
<testcase name="signs" classname="sign-flow.e2e.ts" time="40.1"></testcase>
</testsuite>
<testsuite name="multi-document.e2e.ts" tests="1" failures="0" skipped="0" time="40.1" errors="0">
<testcase name="two documents" classname="multi-document.e2e.ts" time="40.1"></testcase>
</testsuite>
</testsuites>`

describe("test summary", () => {
  test("reads totals, failures and the outermost suite per file", () => {
    const r = parseJunit(BUN)
    expect([r.tests, r.failures, r.skipped, r.time]).toEqual([3, 1, 1, 1.5])
    expect(r.files).toEqual([{ file: "a.test.ts", tests: 3, failures: 1, skipped: 1, time: 1.5 }])
    const failed = r.cases.filter((c) => c.failure)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.name).toBe("divides & rounds")
    expect(failed[0]?.failure).toBe("expected 2, got 3")
  })

  test("the summary leads with the failures; a clean run with the pass count", () => {
    const failing = toMarkdown("Unit tests", parseJunit(BUN))
    expect(failing).toContain("### ❌ Unit tests: 1 failed")
    expect(failing).toContain("| 1 | 1 | 1 | 1.50 s |")
    expect(failing).toContain("math › divides & rounds (`a.test.ts:8`)")

    const clean = toMarkdown("E2E", parseJunit(PLAYWRIGHT))
    expect(clean).toContain("### ✅ E2E: 2 passed")
    expect(clean).toContain("By file (2)")
  })

  test("annotations only for failures that know their file, with properties escaped", () => {
    expect(annotations(parseJunit(BUN))).toEqual([
      "::error file=a.test.ts,line=8,title=math › divides & rounds::expected 2, got 3",
    ])
    expect(annotations(parseJunit(PLAYWRIGHT))).toEqual([])
  })
})
