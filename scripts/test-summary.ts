/**
 * Turns a JUnit report (bun test --reporter=junit, Playwright's junit reporter) into a GitHub
 * Actions job summary: totals, failures with their messages, and a per-file table. Failures with a
 * file and line also become `::error` annotations, which show on the pull request's diff.
 *
 *   bun scripts/test-summary.ts "Unit tests" reports/unit.xml "$GITHUB_STEP_SUMMARY"
 *
 * Appends to the summary file given (CI), else prints the markdown. A missing report (the
 * suite crashed before writing one) is reported as such; the test step's own failure fails the job.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs"

export interface TestCase {
  name: string
  classname: string
  file?: string
  line?: number
  time: number
  failure?: string
  skipped: boolean
}

export interface FileRow {
  file: string
  tests: number
  failures: number
  skipped: number
  time: number
}

export interface Report {
  tests: number
  failures: number
  skipped: number
  time: number
  cases: TestCase[]
  files: FileRow[]
}

const ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
}
const unescapeXml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m] ?? m)

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    out[m[1] as string] = unescapeXml(m[2] as string)
  }
  return out
}

const num = (v: string | undefined) => (v ? Number(v) || 0 : 0)

/** Both reporters nest <testsuite>s; the outermost one per file gives the per-file counts. */
export function parseJunit(xml: string): Report {
  const root = attrs(xml.match(/<testsuites\b[^>]*>/)?.[0] ?? "")
  const cases: TestCase[] = []
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const a = attrs(m[1] as string)
    const body = m[3] ?? ""
    const failure = body.match(/<(failure|error)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/)
    let message: string | undefined
    if (failure) {
      const fa = attrs(failure[2] as string)
      const text = unescapeXml((failure[4] ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
      message = [fa.message, text.trim()].filter(Boolean).join("\n\n") || "Failed"
    }
    cases.push({
      name: a.name ?? "",
      classname: a.classname ?? "",
      file: a.file,
      line: a.line ? Number(a.line) : undefined,
      time: num(a.time),
      failure: message,
      skipped: /<skipped\b/.test(body),
    })
  }

  const files: FileRow[] = []
  let depth = 0
  for (const m of xml.matchAll(/<(\/?)testsuite\b([^>]*?)(\/?)>/g)) {
    if (m[1]) {
      depth--
      continue
    }
    if (depth === 0) {
      const a = attrs(m[2] as string)
      files.push({
        file: a.file ?? a.name ?? "",
        tests: num(a.tests),
        failures: num(a.failures) + num(a.errors),
        skipped: num(a.skipped),
        time: num(a.time),
      })
    }
    if (!m[3]) depth++
  }

  const failures = cases.filter((c) => c.failure).length
  return {
    tests: root.tests ? num(root.tests) : cases.length,
    failures: root.failures || root.errors ? num(root.failures) + num(root.errors) : failures,
    skipped: root.skipped ? num(root.skipped) : cases.filter((c) => c.skipped).length,
    time: num(root.time),
    cases,
    files,
  }
}

const seconds = (t: number) => (t < 10 ? `${t.toFixed(2)} s` : `${t.toFixed(1)} s`)
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")
const MAX_MESSAGE = 3000

export function toMarkdown(title: string, r: Report): string {
  const passed = r.tests - r.failures - r.skipped
  const icon = r.failures > 0 ? "❌" : "✅"
  const headline = r.failures > 0 ? `${r.failures} failed` : `${passed} passed`
  const out = [
    `### ${icon} ${title}: ${headline}`,
    "",
    "| Passed | Failed | Skipped | Time |",
    "| ---: | ---: | ---: | ---: |",
    `| ${passed} | ${r.failures} | ${r.skipped} | ${seconds(r.time)} |`,
    "",
  ]
  const failed = r.cases.filter((c) => c.failure)
  if (failed.length > 0) {
    out.push("#### Failures", "")
    for (const c of failed) {
      const where = c.file ? ` (\`${c.file}${c.line ? `:${c.line}` : ""}\`)` : ""
      const name = [c.classname, c.name].filter(Boolean).join(" › ")
      const message = (c.failure ?? "").slice(0, MAX_MESSAGE)
      out.push(
        `<details><summary>${name.replace(/</g, "&lt;")}${where}</summary>`,
        "",
        "```",
        message.replace(/```/g, "ˋˋˋ"),
        "```",
        "</details>",
        "",
      )
    }
  }
  if (r.files.length > 1) {
    out.push(
      `<details><summary>By file (${r.files.length})</summary>`,
      "",
      "| File | Tests | Failed | Skipped | Time |",
      "| --- | ---: | ---: | ---: | ---: |",
      ...[...r.files]
        .sort((a, b) => b.failures - a.failures || a.file.localeCompare(b.file))
        .map(
          (f) =>
            `| ${f.failures > 0 ? "❌ " : ""}\`${cell(f.file)}\` | ${f.tests} | ${f.failures} | ${f.skipped} | ${seconds(f.time)} |`,
        ),
      "",
      "</details>",
      "",
    )
  }
  return out.join("\n")
}

/** `::error` workflow commands for failures that know their file, so they show on the diff. */
export function annotations(r: Report): string[] {
  const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")
  const prop = (s: string) => esc(s).replace(/:/g, "%3A").replace(/,/g, "%2C")
  return r.cases
    .filter((c) => c.failure && c.file)
    .map((c) => {
      const line = c.line ? `,line=${c.line}` : ""
      const title = [c.classname, c.name].filter(Boolean).join(" › ")
      return `::error file=${prop(c.file as string)}${line},title=${prop(title)}::${esc((c.failure ?? "").slice(0, MAX_MESSAGE))}`
    })
}

if (import.meta.main) {
  const [title, path, summary] = process.argv.slice(2)
  if (!title || !path) {
    console.error('Usage: bun scripts/test-summary.ts "<title>" <junit.xml> [summary.md]')
    process.exit(2)
  }
  let markdown: string
  if (existsSync(path)) {
    const report = parseJunit(readFileSync(path, "utf8"))
    markdown = toMarkdown(title, report)
    for (const a of annotations(report)) console.log(a)
  } else {
    markdown = `### ⚠️ ${title}: no report\n\nThe suite stopped before writing \`${path}\`. See the step's log.\n`
  }
  if (summary) appendFileSync(summary, `${markdown}\n`)
  else console.log(markdown)
}
