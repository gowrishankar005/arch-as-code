# CALM Studio — Pattern/Standards/Controls Validation: Migration & Resume Doc

> **Purpose:** Hand-off document to resume this work in a fresh Claude Code session.
> **Created:** 2026-06-16. **Working dir for the new session:** `/Users/gowri/spaceclub/Architecture/architecture-as-code`
> **Status:** Planning complete + repo cloned & analyzed. No code written yet. Ready to start Phase 1.

---

## 0. How to resume (read this first)
1. `cd /Users/gowri/spaceclub/Architecture/architecture-as-code`
2. Read this whole file — it contains every fact already discovered so you don't re-derive it.
3. The repo is the FINOS monorepo `finos/architecture-as-code` (shallow clone, `--depth 1`, branch `main`).
4. Start at **Phase 1** in §7. Decisions are already locked (§2).

---

## 1. Objective
Bring **CLI-grade validation** (Patterns, Standards, Controls, Spectral semantic rules) into **CALM Studio's UI**, so non-CLI users can visually validate a drawn architecture against a pattern/standard before publishing. Target parity with:
```
calm validate -p patterns/reference-web-service-pattern.json -a architectures/reference-app.calm.json -f pretty
```
Studio today only does basic JSON-schema validation.

---

## 2. LOCKED DECISIONS (from user)
- **Code location:** Extend the existing `@calmstudio/calm-core` package (add a new function + a browser/Tauri DocumentLoader). Depend on `@finos/calm-shared`. Do NOT fork the validation core. Do NOT contribute upstream first.
- **First target:** **Tauri desktop** build of Studio (offline-first). Use Tauri fs/dialog for pattern files. Web/Vercel build comes later.
- **Run location:** **Client-side** (in the renderer). No backend service. Spectral + AJV are browser-safe (see §4).

---

## 3. KEY FINDING — two divergent engines exist
"CALM Studio" = a **Svelte 5 (runes) + Tauri** desktop app at `calm-suite/calm-studio/`. It is **NOT React** and currently does **NOT** use the CLI engine.

| | `@finos/calm-shared` (CLI engine) | `@calmstudio/calm-core` (Studio today) |
|---|---|---|
| Entry | `validate(arch, patternOrSchema, timeline, schemaDirectory, debug) → ValidationOutcome` | `validateCalmArchitecture(arch) → ValidationIssue[]` |
| Spectral linting | ✅ rules-architecture / rules-pattern / rules-timeline | ❌ none |
| Pattern composition | ✅ `JsonSchemaValidator` + `SchemaDirectory` | ❌ AJV vs fixed meta-schema only |
| Controls/Standards | ✅ (a standard = a curated pattern; controls enforced via composed schema + spectral) | ❌ hand-rolled semantic rules only |
| Schema loading | pluggable `DocumentLoader` | vendored JSON imports |

**The job = make Studio call `@finos/calm-shared.validate()` with a browser/Tauri `DocumentLoader`, then map its output back to Studio's `ValidationIssue[]`.**

---

## 4. CRITICAL TECHNICAL FACTS (verified by reading source)
- `validate()` takes **plain JS objects** + a `SchemaDirectory`. No filesystem coupling in the core. → `shared/src/commands/validate/validate.ts:119`
- `SchemaDirectory` constructor takes a **pluggable `DocumentLoader`** → `shared/src/schema-directory.ts:22`. CLI uses `FileSystemDocumentLoader`; we write a `BundledDocumentLoader`.
- Spectral rules import `@stoplight/spectral-core` + `@stoplight/spectral-functions` (BOTH browser-safe). **Only `@stoplight/spectral-cli` is Node-only, and `validate()` does NOT use it.** → client-side is viable. Confirm with a jsdom/browser Vitest spike in Phase 1.
- `runSpectralValidations()` at `validate.ts:69`. Rulesets imported at `validate.ts:4-6` from `shared/src/spectral/rules-{pattern,architecture,timeline}`.
- Output types (`shared/src/commands/validate/validation.output.ts`):
  - `ValidationOutput { code, severity:string, message, path, schemaPath?, line_start?, line_end?, character_start?, character_end?, source? }`
  - `ValidationOutcome { jsonSchemaValidationOutputs[], spectralSchemaValidationOutputs[], hasErrors, hasWarnings }` (+ a getter merging both arrays at ~line 44).
- `SpectralResult { errors, warnings, spectralIssues }` → `shared/src/commands/validate/spectral.result.ts`.
- `shared/src/index.ts` already EXPORTS: `validate`, `ValidationOutcome`, `ValidationOutput`, `SchemaDirectory`, `DocumentLoader`, `FileSystemDocumentLoader`, `buildDocumentLoader`. So no API changes needed in shared.
- Studio's current engine: `validateCalmArchitecture(arch): ValidationIssue[]` at `calm-suite/calm-studio/packages/calm-core/src/validation.ts`. Uses `Ajv2020` + vendored schemas under `calm-core/src/schemas/` (core.json, control.json, control-requirement.json, interface.json, flow.json, evidence.json, units.json, calm.json). Has hand-rolled semantic rules (dangling refs, dupes, orphans, self-loops).
- `ValidationIssue { severity:'error'|'warning'|'info', message, nodeId?, relationshipId?, path? }` — the UI contract to preserve.
- Studio UI wiring: `calm-suite/calm-studio/apps/studio/src/lib/stores/validation.svelte.ts`. On-demand `runValidation()` reads `getModel()` (from `calmModel.svelte.ts`), populates `issues`, opens panel. Has `panelOpen`, `scrollToId` (used to pan/zoom canvas to an element), `getIssuesByElementId(id)`. Store READS model, never writes (avoids an infinite loop). `+page.svelte` injects validation data into `node.data` for canvas display.
- Studio also runs `runAIGFRules(model)` from `$lib/validation/aigf-rules` and merges those issues.

---

## 5. KEY FILE PATHS (relative to architecture-as-code/)
- CLI engine: `shared/src/commands/validate/{validate.ts, json-schema-validator.ts, spectral.result.ts, validation.output.ts, validation-enrichment.ts}`
- Schema/loader: `shared/src/schema-directory.ts`, `shared/src/document-loader/{document-loader.ts, file-system-document-loader.ts, multi-strategy-document-loader.ts}`
- Spectral rules: `shared/src/spectral/rules-architecture.ts`, `rules-pattern.ts`, `rules-timeline.ts`, `functions/`
- Studio app: `calm-suite/calm-studio/apps/studio/` (Svelte+Tauri; src-tauri/ has the Rust shell)
- Studio core pkg: `calm-suite/calm-studio/packages/calm-core/src/{validation.ts, types.ts, helpers.ts, schemas/}`
- Studio store: `calm-suite/calm-studio/apps/studio/src/lib/stores/validation.svelte.ts`
- Studio examples (test fixtures): `calm-suite/calm-studio/examples/{architecture_calm.json, aws_multi_tier_calm.json}`
- Studio docs: `calm-suite/calm-studio/docs/CALM_1.2_CONTROLS_SCHEMA.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`

---

## 6. DESIGN SUMMARY (agreed plan)
**Reuse seam:** add `@finos/calm-shared` as a dep of `@calmstudio/calm-core`; add `validateAgainstPattern()` next to `validateCalmArchitecture()`. Keep the existing function as the "no pattern selected" fast path; route to `shared.validate()` when a pattern/standard is chosen.

**New files to create in `calm-core/src/`:**
1. `bundled-document-loader.ts` — implements `DocumentLoader` from `@finos/calm-shared`, backed by the already-vendored `./schemas/*.json`; `fetch()` fallback for remote (CALM Hub) schemas. (Verify exact interface methods in `shared/src/document-loader/document-loader.ts`.)
2. `validation-with-pattern.ts` — `validateAgainstPattern(arch, pattern): Promise<ValidationIssue[]>`. Builds `SchemaDirectory(new BundledDocumentLoader())`, `await dir.loadSchemas()`, `dir.loadCurrentPatternAsSchema(pattern)` if pattern given, calls `validate(arch, pattern, undefined, dir, false)`, maps result via `toValidationIssues()`.
3. Adapter `toValidationIssues(outcome)` + `elementIdFromPath(path)` — map `ValidationOutput[]` → `ValidationIssue[]`, deriving `nodeId`/`relationshipId` from JSON Pointer paths (e.g. `/relationships/4/.../protocol`, `/nodes/3/unique-id`) so canvas highlighting works.

**Store changes (`validation.svelte.ts`):** add `selectedPattern` state, `setPattern()/getSelectedPattern()`, make `runValidation()` async, branch to `validateAgainstPattern` when a pattern is set else `validateCalmArchitecture`. Lazy `await import()` the pattern path to keep bundle lean.

**UI/UX:**
- Toolbar "Validate against…" popover: bundled Standards dropdown + "Upload pattern (.json)" via Tauri dialog + optional "from CALM Hub URL". Active pattern shown as dismissible chip.
- Canvas: node error/warn/info badges (red/amber/blue); relationship protocol violations color the EDGE red w/ tooltip (e.g. HTTP-vs-HTTPS control); missing required node → dashed ghost node.
- Validation Panel: counts (errors/warnings/✓), filter by severity + by source (`json-schema` vs `spectral`), click-to-reveal via `scrollToId`. Mirrors `-f pretty`.

**Controls/Standards note:** In CALM these are NOT separate engines. A standard = a curated pattern file; controls are enforced through the composed JSON schema + spectral rules. One mechanism (validate-against-pattern) covers all three of patterns/standards/controls.

---

## 7. EXECUTION PLAN (4 phases)
- **Phase 1 — Spike/de-risk:** Add `@finos/calm-shared` to calm-core. Write a Vitest (jsdom/browser env) test that constructs `SchemaDirectory` + a stub `DocumentLoader` and runs `validate(arch, pattern, undefined, dir)`. Prove no Node-only API is hit; measure bundle delta. Confirm exact `DocumentLoader` interface. GO/NO-GO on client-side.
- **Phase 2 — Loader + delegation:** Implement `BundledDocumentLoader`, `validateAgainstPattern()`, `toValidationIssues()`/`elementIdFromPath()`. Unit tests reuse fixtures from `shared/.../validate.spec.ts` and Studio's `validation.test.ts`. Parity smoke test: reference pattern + reference app should match `calm validate` output.
- **Phase 3 — UI integration:** Extend store; build toolbar popover + active-pattern chip; canvas highlighting (node badges, edge coloring, ghost nodes); Validation Panel filters + click-to-reveal. Lazy-load validation module.
- **Phase 4 — Testing/hardening:** Playwright e2e (config exists in app) — load example arch, select pattern, Validate, assert HTTPS-control edge highlight + ghost node for missing required node. Offline test (no network → bundled loader resolves all $refs). CI parity test Studio vs CLI on a fixture matrix. Update `calm-studio/README.md`.

---

## 8. OPEN ITEMS / TO VERIFY in next session

### ✅ RESOLVED in session 2 (2026-06-16) — verified against source
- **`DocumentLoader` interface — CONFIRMED.** 3 async/sync methods (`shared/src/document-loader/document-loader.ts:14`):
  - `initialise(schemaDirectory: SchemaDirectory): Promise<void>`
  - `loadMissingDocument(documentId: string, type: CalmDocumentType): Promise<object>`
  - `resolvePath(reference: string): string | undefined`
  - `CalmDocumentType = 'architecture' | 'pattern' | 'schema' | 'timeline'`. Helper `assertJsonObject()` + `DocumentLoadError {name, message, cause?, recoverable}` exported from same file. `buildDocumentLoader(opts)` composes a `MultiStrategyDocumentLoader`. Our `BundledDocumentLoader` must implement these 3 methods; `resolvePath` may return `undefined` (we have no real fs in renderer).
- **`validate` IS exported from `shared/src/index.ts`** (line 2, inside a multi-line `export { … } from './commands/validate/validate.js'` block — easy to miss with a one-line grep). Signature: `export async function validate(...)` at `validate.ts:119` → `Promise<ValidationOutcome>`. Also exported: `ValidationOutput` (output.js:31), `ValidationOutcome` (output:53), `SchemaDirectory` (:33), `buildDocumentLoader`/`DocumentLoader`/`DocumentLoaderOptions` (:56), `FileSystemDocumentLoader` (:57), `OutputFormat`/`ValidateOutputFormat` (:8). **No API changes needed in shared.**
- **calm-core build = tsup** (`calm-suite/calm-studio/packages/calm-core/tsup.config.ts`): entry `src/index.ts`, formats `['esm','cjs']`, `dts:true`, `external:['ajv','ajv-formats']` ONLY. → if we add `@finos/calm-shared` as a (non-external) dep, **tsup will bundle it (and spectral) into the renderer build** — which is what we want client-side. `onSuccess` copies meta-schemas from `calm/release/1.2/meta` into `dist/schemas/` (calm.json, core.json, control.json, control-requirement.json, interface.json, flow.json, evidence.json, units.json) — same vendored set the BundledDocumentLoader will serve.
- **Studio run command:** `npm run tauri dev` (scripts: `dev=vite dev`, `tauri=tauri`, `test=vitest run`, `test:e2e=playwright test`). `@calmstudio/calm-core` is a `file:../../packages/calm-core` dep of the studio app.
- **Workspace:** root `package.json` declares `workspaces` (npm@11.12.1); `calm-suite/calm-studio/package.json` ALSO declares its own workspaces. calm-core already consumes `@finos/calm-models` via `file:../../../../calm-models`. → link `@finos/calm-shared` the same way (`file:../../../../shared` — VERIFY the exact relative depth from calm-core).

### ⚠️ STILL OPEN — handle at start of Phase 2
- **`@finos/calm-shared` is NOT pre-built — there is no `shared/dist/`.** Its build is `tsc -p ./tsconfig.build.json` + a template-copy script. So before calm-core can resolve a `file:` link to shared's `main: dist/index.js`, **`shared` must be built first** (`cd shared && npm run build`), OR configure tsup/tsconfig paths to bundle shared from `src`. Decide in Phase 1 spike.
- **`@stoplight/spectral-cli` (Node-only) IS a direct dep of shared** (`package.json`), alongside the browser-safe `-core` and `-functions`. `validate()` does NOT import `-cli` (confirmed in doc §4), but verify tree-shaking actually drops it from the renderer bundle — if not, mark it `external` or alias it out. This is the #1 client-side risk for the Phase 1 GO/NO-GO.
- Bundle-size impact of spectral on the (later) Vercel web build — defer.

---

## 9. ENV NOTES
- Repo moved out of the e-magazine project to avoid polluting that git repo. New home: `/Users/gowri/spaceclub/Architecture/`.
- **Private working fork (session 2):** This clone's `origin` now points at **`https://github.com/gowrishankar005/arch-as-code`** (private). `upstream` = `finos/architecture-as-code` (for fetching/diffing finos). History was re-rooted to a single snapshot commit (orphan) of finos @ `f2a3d2d` because the original `--depth 1` shallow clone could not be pushed. Working branch: **`calm-studio-validation`**. This doc lives at `docs/calm-studio-validation/MIGRATION.md`.
- **To resume cleanly:** `cd /Users/gowri/spaceclub/Architecture/architecture-as-code && claude` — so the session's primary cwd, git status, and PR tooling all point at this repo (otherwise the status bar shows the unrelated `van-valaroli`/e-magazine repo).
- This is the user's general dev machine (macOS, zsh). The e-magazine CLAUDE.md/memory in the old project is UNRELATED to this CALM work — ignore it for this task. `gh` CLI installed via brew this session (v2.94); the stored github.com token has `repo, workflow, write:packages` scopes but lacks `read:org`, so `gh auth login` fails — use the GitHub REST API with the token (from `git credential fill`) for repo-level operations.
