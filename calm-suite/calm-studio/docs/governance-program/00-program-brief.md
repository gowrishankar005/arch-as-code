# Architecture Governance Automation Program — Business Requirements (BRD)

Status: DRAFT for review · Owner: Principal Frontend Engineer · Date: 2026-07-09
Scope basis: exploration & feasibility work recorded in this folder (see 05-implementation-roadmap.md for traceability to prototypes).

## 1. Problem Statement

Enterprise architecture governance today runs on prose standards (Confluence
pages: text + diagrams, authored by different people over many years) and
manual review (architecture review boards, draw.io diagrams, screenshots).
Consequences:

- **Latency** — review cycles measured in weeks; releases wait on meetings.
- **Inconsistency** — enforcement depends on which reviewer reads which page.
- **Staleness** — diagrams drift from reality the day after approval.
- **No audit trail** — "which standard approved this design?" is unanswerable.

## 2. Objective

Architectures are validated automatically against the org's standards, with
**no additional day-to-day burden on delivery teams** compared to the current
draw.io workflow, and with full provenance from every enforced rule back to
the source standard.

## 3. Strategic Choices (decided during exploration)

| Decision | Rationale |
|---|---|
| **CALM (FINOS) as the architecture model** | Only open design-layer validation standard; proven at Morgan Stanley scale (1,400+ deployments); fintech-native governance (FINOS) |
| **Hybrid validation: CALM patterns + OPA/Rego** | JSON Schema (patterns) cannot express cross-array/graph rules ("only services may connect to databases"). Rego handles these natively, is CNCF-graduated, and is already familiar to platform/security teams from Terraform/K8s policy work |
| **CALM Studio as the authoring surface** | draw.io-parity canvas already built; typed palette makes valid CALM a side effect of normal drawing |
| **Generated, never hand-authored, machine rules** | Patterns/policies are produced by an LLM conversion pipeline from existing Confluence standards, with automated self-verification |
| **CALM 1.2 pinned** | Repo mixes 1.0-rc2 and 1.2 artifacts; all program output targets 1.2 |

## 4. Program Tracks

- **Track A — Authoring UX (largely complete).** draw.io-parity Studio canvas:
  nearest-handle edge routing, node card styling, protocol dropdowns, inline
  editing, tooltips. Shipped on `calm-studio-validation` branch.
- **Track B — Migration: draw.io → CALM importer.** Convert existing diagram
  estates without redrawing. Feasibility proven (see 02-drawio-importer-design.md).
- **Track C — Standards conversion: Confluence → patterns + Rego + Spectral.**
  Agent pipeline with self-verification (see 04-standards-conversion-agent-design.md).
- **Track D — Enforcement & feedback.** CI gate (`calm validate` + Conftest via
  the existing `@calmstudio/github-action` package) and Studio design-time
  feedback (see 03-hybrid-validation-design.md).
- **Track K — Keystone: node-typing decision rules.** Org modeling conventions
  binding the importer, the conversion agent, and human architects
  (see 01-node-typing-rules-design.md). Blocks B and C.

## 5. Business Requirements

### BR-1 Zero-added-burden authoring
Teams draw architectures with no more effort than draw.io. No hand-written
JSON, no manual control annotation (controls apply via profiles), no forced
re-layout of imported diagrams.

### BR-2 Seamless migration
Existing draw.io files import with: original geometry preserved; ≥70% of
elements typed automatically (stencil catalogs across AWS/Azure/GCP/K8s +
on-prem/custom org shapes); remaining elements resolved via a review panel,
never silent guessing; output always passes `calm validate`.

### BR-3 Standards become enforceable with provenance
Every enforced rule traces to a verbatim quote in a source Confluence page
(page URL + version + content hash). Rules regenerate when the source page
changes; drift is detected, never silent.

### BR-4 Graduated enforcement
All rules launch as warnings. Promotion to blocking is per-rule, evidence-based
(false-positive rate below threshold), and reversible.

### BR-5 Validation replaces review (organizational prerequisite)
For architectures matching standard patterns, a green pipeline **is** the
approval. ARB review is reserved for exceptions and novel designs.
**This requires explicit sponsorship before Track D enforcement begins.**

### BR-6 Auditability
For any architecture at any commit: which pattern versions and policy versions
it was validated against, what passed/failed/warned, and which source standards
those rules came from.

### BR-7 Data handling
Confluence content and diagrams processed by LLMs stay within org-approved AI
boundaries (approved provider/endpoint). No standards content leaves the
approved processing path. (Added as competent-authority item — was missing
from exploration.)

## 6. Out of Scope (this program)

- Code-level conformance (ArchUnit-family) and deployed-IaC policy (Checkov
  etc.) — complementary layers, separate initiatives.
- CALM Hub backend changes; CALM CLI changes (hard constraint: never break).
- Authoring *new* standards (program converts existing ones; new standards
  authored CALM-first is a follow-on).

## 7. Success Metrics

| Metric | Target (12 months) |
|---|---|
| Import automation rate (elements typed without human touch) | ≥ 70% at launch, ≥ 85% after glossary tuning |
| Standards corpus converted with verification green | ≥ 60% of active pages |
| Conversion HITL touch rate | ≤ 30% initial, trending ≤ 15% |
| Median time from architecture submission to approval | Weeks → same day (for pattern-conforming designs) |
| False-positive rate on blocking rules | < 5% (else rule demoted to warning) |
| Team satisfaction (survey) vs draw.io baseline | No regression |

## 8. Risks (register)

| ID | Risk | Mitigation | Owner |
|---|---|---|---|
| R1 | Ontology inconsistency (open node-type system) | Track K rules bind tools *and* humans; lint enforces | Track K |
| R2 | Controls explosion (per-instance attachment × large catalogs) | Control profiles/baselines; corpus dedup; decorators for mappings | Track C |
| R3 | Enforcement without sponsorship → adoption death | BR-5 sign-off gate before any blocking rule | Program |
| R4 | LLM misreads prose → verified-but-wrong rules | Adversarial fixture verification + 10% human QA sample + provenance quotes | Track C |
| R5 | Studio can't evaluate Rego (CI-only graph rules) | Accepted initially; OPA-WASM in Studio on roadmap; possible FINOS contribution | Track D |
| R6 | Real corpus differs from public proxies used in exploration | Fixture pack of 3–5 real pages + 2–3 real draw.io files required before Track C build | Program |
| R7 | Pattern version churn breaks previously-green architectures | Pattern semver + architectures pin versions + migration report | Track D |
| R8 | LLM data-boundary violation | BR-7 approved-endpoint-only; no third-party calls in pipeline | Track C |

## 9. Cost Annex — LLM Token Budget

Pricing basis: Claude API list prices as of mid-2026 (Opus $5/$25 per MTok
in/out, Sonnet $3/$15, Haiku $1/$5; prompt-cache reads ~0.1×; Batch API −50%).
All LLM processing routes through the org-approved endpoint (BR-7).

**Structural principle: validation costs zero tokens.** All runtime engines —
`calm validate` (AJV), OPA/Rego, Spectral, CI gates, Studio drawing — are
deterministic. LLM spend occurs only at conversion/import time.

| Stream | LLM role | Est. volume | Est. cost |
|---|---|---|---|
| Studio authoring (A) / Validation runtime (D) | none | — | $0 |
| Typing rules (K) | one-time drafting aid | negligible | ~$0 |
| draw.io importer (B) | Tier-3 inference + description drafting only (Tiers 1–2 deterministic) | ~5K tokens/diagram; ~500 diagrams ≈ 2.5M tokens | single-digit dollars, one-time |
| Conversion agent (C), per page | IR extraction, artifact generation, adversarial fixtures, repair loop | 80–150K tokens/page | ~$1–2 raw; ~$0.40–0.80 with caching + Batch API |
| Conversion, corpus one-time (≈200 pages) | as above | 25–30M tokens | **~$80–160** (pessimistic ceiling < $400) |
| Corpus passes (dedup, contradictions) | one-time | 5–10M tokens | ~$25–50 |
| Ongoing (page-edit re-runs, imports) | incremental, content-hash-gated | few pages/month | near-zero, declining |

Cost-control levers (built into the design): prompt caching of the stable
skill context (~15–20K token shared prefix → ~0.1× on every page after the
first); Batch API for corpus conversion (−50%, latency-insensitive workload);
model tiering (Haiku classify / Opus extract-generate); incremental re-runs;
and determinism-first — every stencil-catalog or glossary improvement
permanently converts Tier-3 LLM calls into free deterministic lookups, so
marginal spend declines over time.

**Framing:** a one-time batch job in the low hundreds of dollars, replacing
architect-days of hand-authoring; no material operating cost.

## 10. Organizational Dependencies

1. **BR-5 sponsorship decision** (exec/ARB) — required before Track D blocking.
2. **Glossary & typing workshop** (half-day, lead architects) — validates Track K draft.
3. **Real fixture pack** (R6) — 3–5 Confluence pages + 2–3 draw.io files, various vintages.
4. **AI data-boundary approval** (BR-7) — security sign-off on the LLM processing path.
