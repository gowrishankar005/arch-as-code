# CLAUDE.md — finos/architecture-as-code (CALM Studio visualizer work)

Behavioral guidelines for Claude Code on this repository, merging general
LLM-coding-pitfall guardrails with project-specific rules for the CALM Studio
visualizer refactor. These bias toward caution over speed — for a one-line fix,
use judgment and skip the ceremony; for anything touching the layout engine,
schema parsing, or CLI/Hub integration, follow this fully.

---

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly before writing code. If you're not sure which
  package is the actual visualizer entry point, which layout library is in use, or
  what a schema field means — say so and check, don't guess and proceed.
- If more than one reasonable interpretation of a request exists, present the
  options and ask which one is wanted. Don't silently pick one.
- If you think a simpler approach exists than the one implied by the request, say
  so before implementing the more complex version.
- If something in the CALM schema, the existing codebase, or the request is
  unclear, stop and name exactly what's confusing rather than working around it.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked, even if related features seem "obviously
  useful" (e.g., don't build a generic pluggable-layout-engine abstraction if the
  task only calls for integrating elkjs).
- No abstractions for single-use code, and no "configurability" that wasn't
  requested — this project's layout/rendering layer should be concrete and
  specific to CALM's node types, not generalized for hypothetical future ones.
- No error handling for scenarios that can't occur given CALM's schema
  validation guarantees.
- If a change balloons past what the task needs, stop and simplify before
  continuing.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Do not "improve" adjacent code, comments, or formatting while you're in a file
  for an unrelated reason.
- Do not refactor working code that isn't part of the current task, even if you
  notice it could be better.
- Match the existing code style in whatever package you're editing, even if you'd
  personally do it differently.
- If you notice unrelated dead code or a bug outside scope, mention it in your
  output — don't fix it inline.
- When your own change creates orphaned imports/variables/functions, remove
  those. Don't remove pre-existing dead code you didn't just orphan.
- Every changed line should be traceable to the specific request or phase you're
  executing.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified — don't declare done without proof.

For any non-trivial step, state a brief plan in this form before executing:

```
1. [Step] → verify: [exact command / check]
2. [Step] → verify: [exact command / check]
```

Examples for this repo:
- "Add compound layout support" → verify: run the layout unit tests / render a
  3-level nested sample and confirm parent bounds resize correctly.
- "Preserve `controls` metadata through the parser" → verify: round-trip a
  sample CALM JSON through the parser and diff the `controls` field against the
  original.
- "Fix a rendering bug" → verify: write or run a test that reproduces it first,
  then confirm it passes after the fix.

Weak criteria ("make the visualizer better") aren't executable — always convert
to something checkable before starting.

---

## Project-specific context — CALM Studio visualizer refactor

Before Phase 1, run `calm init-ai -p claude` (from `@finos/calm-cli`) if not already
done — it generates Claude-specific, schema-accurate CALM tooling from this repo's
current schema version. Prefer it over general knowledge of the CALM schema when
creating or validating nodes, relationships, controls, or interfaces.

This work follows the phased plan in `docs/visualizer-refactor-prompt.md`, which
also contains a Reference Materials section (CALM schema docs, layout engine
references for elkjs/Cytoscape.js, and links to prior visualizer attempts/issues
in this repo) — consult it during the relevant phase rather than relying on
training-data recall of library APIs, which may be stale.
(Phase 0 discovery → Phase 1 audit → Phase 2 design → Phase 3 implementation →
Phase 4 verification). Do not skip ahead of the current phase without explicit
confirmation.

**Tech stack (confirmed in Phase 0):** Svelte 5 (runes) + SvelteKit, @xyflow/svelte
v1.5 (Svelte Flow), elkjs v0.11 (layered + rectpacking), Vite 8, Vitest 4 +
Playwright, Tailwind CSS 4, npm workspaces. Discovery report:
`calm-suite/calm-studio/docs/visualizer-discovery.md`.

**Never break, without being asked to:**
- The CALM CLI (`calm generate` / `calm validate` / related commands).
- CALM Hub backend integration.
- Existing test suite pass rate or coverage.
- Schema validation — every code path that can produce or mutate a CALM JSON
  document must still produce schema-valid output.

**Confirmed commands** (Phase 0 verified — run from repo root):
- Install: `npm ci`
- Build (dep order): `npm run build --workspace=@finos/calm-models && npm run build --workspace=@calmstudio/calm-core && npm run build --workspace=@calmstudio/extensions && npm run build --workspace=@calmstudio/studio`
- Dev server: `npm run dev --workspace=@calmstudio/studio`
- Test (studio): `npm run test --workspace=@calmstudio/studio`
- Test (calm-core): `npm run test --workspace=@calmstudio/calm-core`
- Test (all): `npm run test --workspaces --if-present`
- E2E: `npm run test:e2e --workspace=@calmstudio/studio`
- Typecheck: `npm run typecheck --workspace=@calmstudio/studio`
- Lint: `npm run lint --workspace=@calmstudio/studio`
- Coverage: `npm run test:coverage --workspace=@calmstudio/studio`

**CALM AI tool prompts** (generated by `calm init-ai -p claude`):
- Location: `.claude/skills/calm/calm-prompts/` (14 files)
- Use these schema-accurate references for node, relationship, control,
  interface, flow, pattern, metadata, and decorator creation instead of
  relying on training-data recall.

**Commit discipline:** small, independently reviewable commits. Each commit
message should reference which phase/finding it addresses. Do not squash audit
or design documentation into the same commit as implementation code.

**When in doubt about a design tradeoff** (e.g., elkjs vs. Cytoscape.js, how
much of a drag interaction should write back to JSON) — stop and ask rather
than picking silently. This is a schema-fidelity-critical system; a wrong
silent choice here can produce architecture diagrams that misrepresent real
systems.

---