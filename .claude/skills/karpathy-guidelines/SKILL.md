---
name: karpathy-guidelines
description: Guidelines against the usual LLM coding mistakes, in the spirit of Andrej Karpathy's notes: overcomplication, unrequested changes, silent assumptions and goals nobody can check. Use when writing, reviewing or refactoring code in this repository, and as the checklist of the CI Claude review (.github/workflows/claude-review.yml).
---

# Karpathy guidelines

Four habits that keep a change small, correct and easy to review. Each one has what to do when
writing code and what to flag when reviewing it. They sit next to the golden rules in AGENTS.md;
when they disagree, AGENTS.md wins.

## 1. Think before coding

**Writing:** before you write, state what you're assuming: about the input, the caller, the data
already in the database, the user's intent. If a request can be read two ways, say so and pick one
deliberately, or ask. Don't fill a gap with a guess and move on.

**Reviewing, flag:**
- Behaviour that relies on an assumption the code never checks or states: a list that "can't be
  empty", an id that "always belongs to this workspace", a status that "can only be X here".
- A change that settles an ambiguous requirement without saying how, where a reasonable reader of
  the PR description would expect the other reading.
- Edge cases the change creates and doesn't handle: empty, missing, duplicate, concurrent, past
  the last page.

## 2. Simplicity first

**Writing:** write the least code that does what was asked. No speculative options, no
abstraction for a second caller that doesn't exist, no configuration nobody asked for. Reuse what
the repository already has (`@sahihi/core` helpers, shared components) before adding something new.
Three plain lines beat a clever one.

**Reviewing, flag:**
- New abstractions, parameters, flags or generic helpers used once, or "for later".
- Code that duplicates an existing helper or component (name the existing one).
- Indirection that makes the change harder to follow without making it safer: wrapper layers,
  needless generics, state that can be derived.
- Defensive code for cases that can't happen, when a type or an earlier check already rules them
  out.

## 3. Surgical changes

**Writing:** touch only what the request needs. Match the style, naming and comment density of
the surrounding code. Unrelated dead code, odd naming or a bug you notice is mentioned, not fixed in
passing, unless fixing it is the task.

**Reviewing, flag:**
- Edits unrelated to the PR's stated purpose: drive-by refactors, renames, reformatting,
  dependency bumps. Ask for them to move to their own PR.
- Deleted or rewritten code the change didn't need to touch, especially comments that explained
  a constraint.
- Style that doesn't match the file around it.

## 4. Goal-driven execution

**Writing:** turn the task into goals you can check: a test that fails before and passes after, a
command whose output proves it, a screen that shows it. For a multi-step change, check each step
before building on it. Done means the checks in AGENTS.md's Definition of done pass, not "it should
work".

**Reviewing, flag:**
- Behaviour changes without a test that would fail if the change were reverted, when this
  repository can test it (`*.test.ts` in core and web lib, `*.itest.ts` for API routes).
- Tests that only restate the implementation or can't fail.
- Claims in the PR description ("handles X", "no behaviour change") the diff doesn't support.
- Docs in `docs/` that the change makes wrong, and a roadmap item it finishes but doesn't tick.

## How to report (reviews)

- One finding per comment, on the line it's about. Say what's wrong, why it matters here, and the
  smallest fix.
- Start each comment with `blocking:` (a bug, a security or data problem, a broken golden rule or a
  missing test for changed behaviour) or `nit:` (anything the PR can merge without).
- Name the guideline when it's the reason: "Simplicity: …", "Surgical: …".
- Don't flag what Biome or TypeScript already reject, and don't praise. If nothing is wrong, say so
  in one line.
