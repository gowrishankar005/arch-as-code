# Implementation Roadmap & Tracks

Status: DRAFT · Traceability: prototypes referenced below exist in session
scratchpad and are re-created as committed fixtures in their phase.

## Phase plan

```
Phase 0  Foundations (1–2 wks)
  K1  Draft node-typing-rules.md + .json + Spectral lint profile   [task #7]
  K2  Glossary workshop → ratify v1.0                              [org dep]
  P0  Real fixture pack collected (R6) + AI boundary sign-off (BR-7) [org dep]
  D0  Pin CALM 1.2 across program; governance/ repo skeleton

Phase 1  Prove the loop (1–2 wks, parallel after K1)
  D1  Hybrid prototype: N-tier → pattern + 3 Rego rules + fixtures [task #8]
      Gate: pass/fail matrix green (03-…§6)
  B1  drawio-import package: parser + T1/T2 (AWS/Azure/GCP/K8s/on-prem
      catalogs + org catalog) + CALM emit; unit suite              [task #9]
      Gate: prototype parity — sample-3tier converts, calm validate green

Phase 2  Ship migration (2–3 wks)
  B2  Studio Open-flow integration (.drawio), geometry preservation,
      history snapshot, sidecar for lossy visuals
  B3  Import Review panel + badges; T3 LLM inference behind approved endpoint
  B4  Playwright suite incl. screenshot baselines (02-…§4)
      Gate: real org files ≥70% auto-typed, e2e green

Phase 3  Enforcement rail (2 wks, parallel with Phase 2 after D1)
  D2  github-action extension: conftest step, severity merge, audit report
  D3  Graduated enforcement metadata + promotion process (BR-4)
      Gate: pilot repo runs the full gate on every PR, warn-only

Phase 4  Standards conversion at scale (4+ wks, after P0+D1)
  C1  Corpus passes: inventory, contradiction report, control canonicalization
  C2  Skill authored (IR schema, idioms, few-shots) + agent pipeline
  C3  Verification loop incl. adversarial fixtures + traceability audit
  C4  Run on fixture pack → triage UX decision → widen to corpus
      Gate: 04-…§6 acceptance

Phase 5  Studio parity for graph rules (opportunistic)
  D4  OPA-WASM evaluation in Studio validation store; FINOS upstream proposal
```

Dependencies: K1 → {B1, C2}; D1 → {D2, C2}; P0 → C4; BR-5 sponsorship → any
`block`-level enforcement.

## Testing strategy (program-wide)

| Layer | Tooling | Policy |
|---|---|---|
| Unit | Vitest (studio, drawio-import), `opa test` (policies) | every Rego file ships tests; catalogs 100% fixture-covered |
| Schema | `calm validate` in-process | every generated/imported document validated in CI |
| E2E + visual | Playwright (existing chromium project) | **every user-facing feature gets a spec; visual features get `toHaveScreenshot()` baselines** — import rendering, review panel, validation badges, severity colors; baselines committed, updated only via explicit CI job |
| Golden files | conversion fixtures | IR + bundle diffs reviewed like code |
| Perf | Playwright budget specs | 300-node import < 3s; validation < 1s on demo archs |
| Never break (CLAUDE.md) | full existing suites | CLI, calm-core, Hub integration, 513-test studio suite stay green in every phase |

## Workstream ownership map

| Track | Code home | New/changed |
|---|---|---|
| K | `governance/` + Spectral profile | new |
| B | `packages/drawio-import` + studio io/canvas | new package + Open flow |
| C | agent repo/skill + `governance/` output | new |
| D | `packages/github-action`, `governance/`, later studio validation store | extend |

## Competent-authority additions (items not previously discussed)

1. **Telemetry** (adoption metrics of §7 BRD need instrumentation): import
   auto-type rate, review-panel correction rate, rule false-positive tracking
   (drives BR-4 promotions). Anonymous, org-internal.
2. **Accessibility**: Import Review panel and severity indicators meet the
   existing a11y bar (keyboard flow, not color-only severity) — Studio has
   prior a11y commits; keep the standard.
3. **Rollback story**: pattern/policy releases are git-revertable; a bad rule
   is demoted by one-line metadata change, no redeploy.
4. **Training/enablement**: 30-min team onboarding deck + "import your
   diagram" quickstart; ship with Phase 2, not after.
5. **Licensing**: draw.io stencil *names* used in catalogs are fine; do not
   vendor draw.io shape artwork into Studio packs (Apache-2.0 repo).
6. **DCO/conventional commits** apply to governance repo too; generated PRs
   sign as the pipeline service account.
