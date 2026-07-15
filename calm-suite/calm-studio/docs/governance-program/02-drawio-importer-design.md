# Track B — draw.io → CALM Importer (Solution Design)

Status: DRAFT · Depends on: Track K · Task ref: #9
Feasibility: PROVEN — scratchpad prototype (`drawio2calm.py`) converted a
mixed-stencil diagram to CALM 1.2 passing `calm validate` (0 errors/warnings),
6 of 8 elements typed deterministically.

## 1. User story

> As a team with an existing draw.io estate, I open my `.drawio` file in CALM
> Studio and see my diagram exactly as I drew it, already typed and connected
> as a valid CALM architecture, with only genuinely ambiguous shapes asking me
> to confirm a type.

## 2. Architecture

New package: `packages/drawio-import` (pure TS, no Svelte imports — same
testability rule as `projection.ts`). Studio consumes it in the Open flow.

```
.drawio file
  → parse: DOMParser; pako.inflateRaw for legacy base64+deflate diagrams
  → mxGraph model: vertices (id, value, style, geometry, parent), edges (source, target, label)
  → tiered type inference:
      T1 stencil catalogs   (deterministic, HIGH confidence)
      T2 label heuristics + org glossary from node-typing-rules.json  (MEDIUM)
      T3 LLM context inference (label + neighbours + edge protocols)  (scored)
  → CALM draft: nodes / relationships (connects, deployed-in from parent attr,
    interacts per Track K actor rule) + preserved geometry sidecar
  → confidence report → Import Review panel
  → user confirms low-confidence items → final .calm.json (must pass calm validate)
```

### Stencil catalogs (T1) — multi-CSP and on-prem from day one
One mechanism, several catalog files (JSON: style-regex → type + confidence):
`aws4`, `azure`, `gcp2`, `kubernetes`, `cisco`/network (on-prem), `citrix`,
`mscae`, plus **org-custom catalog** for internal shape libraries (same file
format; deployable without code change). Unknown stencil families degrade to
T2/T3 — never fail.

### Invariants (the "seamless" contract)
- **Geometry preserved**: imported nodes keep original x/y/w/h; auto-layout is
  an explicit button afterwards, never applied on import.
- **Nothing dropped silently**: non-protocol edge labels → `description`;
  unmappable visual properties recorded in the CalmStudio sidecar
  (existing `sidecar.ts` mechanism).
- **Required fields synthesized honestly**: CALM requires `description`;
  generated as flagged placeholders (or T3 LLM one-liners), marked for review.
- **Output always schema-valid**: import that cannot produce valid CALM fails
  loudly with a per-element error report, never a corrupt document.
- **Undo-able**: import pushes one history snapshot (existing `history.svelte.ts`).

### Edge semantics
- direction from mxCell source/target; dangling endpoints → review panel.
- label ∈ CALM protocol enum → `protocol`; else `description`.
- containment: `parent` = container cell → `deployed-in`; **visual-only
  overlap is NOT containment** (explicit rule; overlap detection flagged only).
- multi-page files: each page offered as a separate architecture.

## 3. UI: Import Review panel

Reuses validation-panel interaction patterns. Lists only LOW/MEDIUM-confidence
items: element name, inferred type, confidence, reason ("stencil aws4.waf" /
"label matched 'db'" / "LLM: connects webclient→database"), type dropdown to
correct. Node badges on canvas link to panel entries. "Accept all HIGH+MEDIUM"
one-click path.

## 4. Test plan

### Unit (Vitest, `packages/drawio-import`)
- parser: uncompressed + compressed fixtures; multi-page; malformed XML.
- T1 catalogs: every catalog entry has a fixture shape → expected type.
- T2: glossary hits, casing, negative cases fall through to T3.
- graph building: containment, dangling edges, actor→interacts, protocol mapping.
- output of every fixture passes CALM 1.2 schema validation in-process.

### E2E / visual (Playwright — `src/tests/e2e/drawio-import.spec.ts`)
Extends the existing suite (8 specs, chromium project, dev-server webServer):

| Spec | Assertion |
|---|---|
| `import opens and renders` | Open sample-3tier.drawio via file chooser → canvas shows 7 nodes; **screenshot diff vs the same diagram rendered in draw.io export PNG (layout parity)** |
| `geometry preserved` | node positions equal source mxGeometry (±1px) via canvas DOM inspection |
| `review panel flow` | low-confidence badge visible on `orders-api`; panel lists 1 item; select `service` → badge clears; **screenshot of panel state** |
| `containment` | `production-vpc` renders as container with 4 children inside its bounds |
| `validation green` | after accept-all, validation store reports 0 schema errors |
| `undo` | Cmd+Z removes imported elements entirely |
| `large file budget` | 300-node synthetic file imports < 3s, no dropped elements (perf regression gate) |

Visual testing uses Playwright `toHaveScreenshot()` with committed baselines
(new: add `snapshotDir` to playwright.config.ts; CI updates via explicit
`--update-snapshots` job only).

## 5. Acceptance criteria (Definition of Done)
- Real-file gate: 2–3 actual org draw.io files (risk R6 fixture pack) import
  with ≥70% elements auto-typed and zero schema errors.
- All Playwright specs green in CI; screenshot baselines reviewed.
- No modification to CLI, calm-core validation, or Hub integration.
