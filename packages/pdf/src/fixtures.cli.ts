/**
 * Writes the fixture PDFs to /fixtures: `bun run fixtures` (from the repo root).
 * Commit the result; fixtures.test.ts fails if the files drift from the builders.
 */
import path from "node:path"
import { buildFixture, FIXTURES } from "./fixtures"

const outDir = path.resolve(import.meta.dir, "../../../fixtures")

for (const f of FIXTURES) {
  const bytes = await buildFixture(f)
  await Bun.write(path.join(outDir, f.file), bytes)
  console.log(`${f.file.padEnd(20)} ${String(bytes.byteLength).padStart(7)} B  ${f.description}`)
}
