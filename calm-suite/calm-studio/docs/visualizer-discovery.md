<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 0 — Visualizer Discovery Report

> Generated 2026-07-02 from direct repo inspection.
> No code changes made — discovery only.

---

## 1. Repository Layout

The `finos/architecture-as-code` monorepo contains multiple independent
packages at the repo root, each with its own `package.json`. The visualizer
lives inside `calm-suite/calm-studio/`, which is itself an **npm workspaces
monorepo**:

```
architecture-as-code/              ← repo root (npm workspaces: cli, shared, calm-models, …)
├── calm-suite/calm-studio/        ← CalmStudio workspace root
│   ├── apps/studio/               ← SvelteKit web app (the visualizer)
│   ├── packages/calm-core/        ← CALM types, helpers, validation
│   ├── packages/extensions/       ← Extension packs (AWS, GCP, AI, etc.)
│   ├── packages/mcp-server/       ← MCP server (21 tools)
│   ├── packages/web-component/    ← Embeddable SVG-only diagram renderer
│   ├── packages/calmscript/       ← DSL compiler (coming soon)
│   ├── packages/github-action/    ← GitHub Action build target
│   └── packages/vscode-extension/ ← VSCode extension build target
├── calm-hub-ui/                   ← CALM Hub UI (React + React Flow — SEPARATE)
├── calm-widgets/                  ← Documentation template engine (Handlebars)
├── shared/                        ← @finos/calm-shared (CLI validation engine)
├── cli/                           ← @finos/calm-cli (calm validate, calm generate)
├── calm-models/                   ← @finos/calm-models (canonical CALM types)
└── calm/                          ← CALM schema (JSON Schema 2020-12)
```

**Two independent visualizers exist in this repo:**

| Package | Framework | Graph library | Status |
|---------|-----------|---------------|--------|
| `calm-suite/calm-studio/apps/studio` | **Svelte 5 / SvelteKit** | **@xyflow/svelte (Svelte Flow) v1.5** | Active — this is what we're upgrading |
| `calm-hub-ui/` | React 19 | reactflow v11.11.4 | Active — separate product, NOT in scope |

`calm-hub-ui` has **no dependency** on `@calmstudio/*` packages. The two
visualizers share no rendering code. Changes to the Studio visualizer cannot
break the Hub UI.

---

## 2. Tech Stack (CALM Studio — `apps/studio`)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Svelte 5 (runes API) + SvelteKit | svelte ^5.55, @sveltejs/kit ^2.53 |
| Build tool | **Vite 8** | vite ^8.0.8 |
| Canvas / graph | **@xyflow/svelte (Svelte Flow)** | ^1.5.1 |
| Layout engine | **elkjs** (bundled, synchronous in-browser) | ^0.11.1 |
| Code editor | CodeMirror 6 | ^6.x |
| Styling | Tailwind CSS 4 (Vite plugin) | ^4.0 |
| Panel layout | paneforge | ^1.0.2 |
| Test runner | **Vitest 4** (jsdom env) | ^4.1.0 |
| E2E | **Playwright** | ^1.50 |
| Coverage | V8 via @vitest/coverage-v8 | ^4.1.0 |
| Desktop | Tauri 2 (planned / partially wired) | ^2.x |
| Types | **@finos/calm-models** (re-exported via @calmstudio/calm-core) | workspace |
| Validation | **@finos/calm-shared** (AJV + Spectral, client-side) | workspace |
| Package manager | **npm** (workspaces) | — |

**Node.js requirement**: `^22.14.0 || >=24.10.0` (per `engines` in Studio root `package.json`).

---

## 3. Layout Engine — elkjs

**File**: `apps/studio/src/lib/layout/elkLayout.ts`

### Algorithm
- **Top-level**: `elk.algorithm = 'layered'` (Sugiyama-style), direction configurable (DOWN / RIGHT / UP).
- **Containers with edges between children**: `elk.algorithm = 'layered'`, direction same as root (if children include sub-containers) or perpendicular (if all leaves).
- **Containers without edges between children**: `elk.algorithm = 'rectpacking'`.
- The algorithm choice is per-container, set in `buildElkNode()`.

### Containment model (ELK-side)
ELK is used **with genuine nesting** — `ElkNode.children[]` is populated for
`deployed-in` / `composed-of` parents. This is a departure from the comment at
the top of the file ("Treat ELK graph as flat — no nested children"), which
dates from an earlier iteration but was overridden during implementation. The
containment tree is derived from CALM relationships, not from CALM node
hierarchy.

Key layout options for containers:
```
elk.padding = [top=48,left=32,bottom=32,right=32]
elk.spacing.nodeNode = 50
elk.layered.spacing.nodeNodeBetweenLayers = 60
elk.layered.considerModelOrder.strategy = NODES_AND_EDGES
```

Container width/height is deleted from the ELK input (`delete elkNode.width` /
`delete elkNode.height`), so **ELK auto-sizes containers around their children**.

### Edge routing at multiple levels
- **Inner edges**: edges where both endpoints are direct children of the same
  container are placed in `elkNode.edges[]`.
- **Cross-child-container edges**: edges between descendants in different direct
  children are synthesized as container→container edges so ELK can order
  sub-containers correctly.
- **Top-level edges**: edges not consumed by any container are lifted to the root
  graph, with endpoints mapped to their top-level ancestor.
- **Synthetic chain edges**: unconnected container children are chained in model
  order to preserve the architect's intended flow.

### Edge rendering (Svelte Flow side)
All five edge types use `getSmoothStepPath()` from `@xyflow/svelte` — this
produces **smooth step (Manhattan/orthogonal)** paths with rounded corners. No
custom edge routing is implemented; Svelte Flow's built-in path computation
handles the routing. There is **no grid snap** for edges.

### Position extraction
`extractPositions()` walks the laid-out ELK tree recursively and produces a
`PositionMap` (Map<string, {x, y, width?, height?}>). Container positions
include the ELK-computed width/height for the Svelte Flow parent node.

### Tests
5 test cases in `apps/studio/src/tests/elkLayout.test.ts` covering basic
layout, pinned nodes, and direction modes. Does not test nested layout or
edge routing.

---

## 4. Graph / Canvas Rendering — @xyflow/svelte (Svelte Flow)

**File**: `apps/studio/src/lib/canvas/CalmCanvas.svelte`

### Node types
12 registered node types mapped from CALM `node-type`:

| Svelte Flow type | CALM node-type(s) | Component |
|---|---|---|
| `actor` | `actor` | ActorNode.svelte |
| `system` | `system` | SystemNode.svelte |
| `service` | `service` | ServiceNode.svelte |
| `database` | `database` | DatabaseNode.svelte |
| `network` | `network` | NetworkNode.svelte |
| `webclient` | `webclient` | WebclientNode.svelte |
| `ecosystem` | `ecosystem` | EcosystemNode.svelte |
| `ldap` | `ldap` | LdapNode.svelte |
| `data-asset` | `data-asset` | DataAssetNode.svelte |
| `generic` | (unknown types) | GenericNode.svelte |
| `container` | parent of deployed-in/composed-of | ContainerNode.svelte |
| `extension` | `pack:type` (e.g., `aws:lambda`) | ExtensionNode.svelte |

### Containment on the Svelte Flow side
- **`containment.ts`**: Pure functions `makeContainment()` and `removeContainment()`.
- Parent → sets node `type: 'container'`.
- Child → sets `parentId`, `extent: 'parent'`, `zIndex: depth`.
- `ContainerNode.svelte` uses `NodeResizer` for manual resize, dashed border,
  header bar with collapse/expand toggle.
- Collapse emits a `node:toggle-collapse` custom event (bubbles up to document).

### Edge types
5 custom edge components, one per CALM relationship variant:

| Type | Component | Visual |
|---|---|---|
| `connects` | ConnectsEdge.svelte | Solid + filled arrowhead |
| `interacts` | InteractsEdge.svelte | Dashed |
| `deployed-in` | DeployedInEdge.svelte | Dotted |
| `composed-of` | ComposedOfEdge.svelte | Dotted |
| `options` | OptionsEdge.svelte | Dash-dot |

All use `getSmoothStepPath` (orthogonal with rounded corners). Edge markers
are defined in `EdgeMarkers.svelte` (shared SVG `<defs>`).

### Canvas features
- DnD from palette + click-to-place at viewport center
- Node drag-into-container auto-detection (`isInsideBounds` → `makeContainment`)
- Edge context menu (right-click) for changing relationship type
- Undo/redo (snapshot-based via `history.svelte`)
- Copy/paste, search (Cmd+F), keyboard shortcuts via `@svelte-put/shortcut`
- Selection → drives PropertiesPanel + CodePanel scroll-to
- Validation badges (error/warning counts on nodes, severity colors on edges)
- Flow visualization (animated dot overlays, sequence badges, node dimming)
- C4 view mode (context/container/component filtering with breadcrumb nav)
- File drop import (.calm.json)

---

## 5. Data Model & Projection

### CALM model store (`stores/calmModel.svelte.ts`)
- Single `$state<CalmArchitecture>` — source of truth.
- **Direction mutex**: `applyFromJson()` and `applyFromCanvas()` use a `syncing`
  boolean to prevent infinite canvas→model→canvas loops.
- Mutation functions (updateNodeProperty, interfaces, custom metadata) bypass
  mutex — they're called from UI handlers, not sync paths.

### Projection layer (`stores/projection.ts`)

**`calmToFlow(arch, positionMap?)`**: CALM → Svelte Flow
- Builds containment map from `deployed-in` / `composed-of` relationships.
- Creates Svelte Flow `Node[]` with `data.calmId`, `data.calmType`,
  `data.interfaces`, `data.controls`, `data.metadata`, etc.
- Applies `parentId` / `extent: 'parent'` for contained nodes.
- Sorts nodes by depth (parents before children — Svelte Flow requirement).
- Expands multi-child relationships into N edges with `#i` suffixed IDs.
- Tags each edge with `data.calmRelId` and `data.calmVariant`.

**`flowToCalm(nodes, edges)`**: Svelte Flow → CALM
- Rebuilds `CalmNode[]` from `node.data`, preserving interfaces, controls,
  custom metadata, data-classification, metadata.
- Rebuilds `CalmRelationship[]` from edges, using `data.calmVariant` to
  reconstruct the nested `relationship-type` form.
- **Multi-child round-trip trade-off**: A single CALM relationship with N
  children (e.g., `composed-of: { nodes: [a, b, c] }`) is expanded into N
  edges on canvas → when projected back, each edge becomes a separate
  single-child relationship. Documented as intentional.

### What IS preserved through the round-trip
- `unique-id`, `node-type`, `name`, `description`
- `interfaces` (full array)
- `controls` (full object)
- `data-classification`
- `metadata` (full object)
- `customMetadata` (CalmStudio extension)
- `relationship-type` (nested form, all variants)
- `protocol`, `description` on relationships

### What is NOT preserved / lossy
- **Multi-child grouping**: collapsed into separate single-child rels (documented).
- **`flows`**: preserved in the CALM model but NOT round-tripped through
  `flowToCalm` (flow transitions are read-only overlays, not editable via
  canvas interaction).
- **`decorators`**: preserved in the model (CalmStudio extension type) but not
  editable via canvas.
- **Node position**: not part of CALM spec, so not stored in JSON. Positions
  are computed by ELK on import, then live in Svelte Flow state.

---

## 6. JSON Code Panel Sync

### Forward sync (model → code panel)
- `calmJson = $derived(getModelJson())` — reactive JSON string from the model
  store, rendered in CodeMirror.

### Reverse sync (code panel → model → canvas)
- `handleCodeChange(newValue)` — 400ms debounce, then:
  1. `JSON.parse(newValue)` → if error, `codeParseError` is set, canvas unchanged.
  2. Builds position map from current nodes to preserve positions.
  3. `applyFromJson(parsed)` (mutex-guarded).
  4. `calmToFlow(parsed, positionMap)` → updates `nodes` and `edges`.
  5. Preserves node selection state across the re-projection.

### Code panel → canvas element location
- `useJsonSync.ts` uses `jsonpos` to find character offset ranges for nodes
  and relationships by unique-id. Used for scroll-to-highlight when a canvas
  element is selected.

---

## 7. CLI / Hub Backend Integration

### CLI (`@finos/calm-cli`)
- Lives in `cli/` at repo root. Has **no dependency** on `@calmstudio/*`.
- CALM Studio's validation engine (`@calmstudio/calm-core/pattern-validation`)
  imports from `@finos/calm-shared` (the shared validation library that the CLI
  also uses). Changes to `shared/` affect both CLI and Studio, but Studio
  does not modify `shared/`.

### CALM Hub UI
- Lives in `calm-hub-ui/`. Uses React 19 + reactflow v11. Has **no dependency**
  on `@calmstudio/*`. Completely independent rendering stack.
- Uses `@dagrejs/dagre` for layout (not elkjs).

### Web component (`packages/web-component/`)
- `@calmstudio/diagram` — an embeddable SVG-only renderer that uses elkjs.
- Has its own `elkRender.ts` that is independent of the Studio's `elkLayout.ts`.
- Used by the MCP server's `render` tool and the GitHub Action.

**Conclusion**: The Studio visualizer's layout/rendering layer can be modified
without affecting the CLI, Hub UI, or web component. The only shared surface is
the type system (`@finos/calm-models` → `@calmstudio/calm-core` → Studio).

---

## 8. Test Infrastructure

### Test runner
- **Vitest 4** with jsdom environment.
- Coverage: V8 provider, 60% thresholds (lines/functions/branches/statements).

### Test suites (Studio app)
| Area | Files | Command |
|------|-------|---------|
| Unit/integration | `apps/studio/src/tests/**/*.test.ts` | `npm test --workspace=@calmstudio/studio` |
| E2E (Playwright) | `apps/studio/src/tests/e2e/**/*.spec.ts` | `npm run test:e2e --workspace=@calmstudio/studio` |
| calm-core | `packages/calm-core/src/**/*.test.ts` | `npm test --workspace=@calmstudio/calm-core` |

### Coverage thresholds
| Package | Threshold |
|---------|-----------|
| calm-core | 90% |
| extensions | 80% |
| mcp-server | 80% |
| studio app | 60% |

### CI
- `.github/workflows/build-calm-studio.yml`:
  - **Job 1** (build-lint-test): Build in dep order → lint → typecheck → test.
  - **Job 2** (e2e-tests): Install Playwright Chromium → build → run E2E.
  - Triggered on PRs and pushes to `main` / `release*` for paths under
    `calm-suite/calm-studio/`, `calm-models/`, and lockfile.

---

## 9. Confirmed Commands

From the repo root:

| Action | Command |
|--------|---------|
| Install | `npm ci` (or `npm install` for first time) |
| Build calm-models | `npm run build --workspace=@finos/calm-models` |
| Build calm-core | `npm run build --workspace=@calmstudio/calm-core` |
| Build extensions | `npm run build --workspace=@calmstudio/extensions` |
| Build studio | `npm run build --workspace=@calmstudio/studio` |
| Dev server | `npm run dev --workspace=@calmstudio/studio` |
| Test (studio) | `npm run test --workspace=@calmstudio/studio` |
| Test (calm-core) | `npm run test --workspace=@calmstudio/calm-core` |
| Test (all) | `npm run test --workspaces --if-present` |
| E2E | `npm run test:e2e --workspace=@calmstudio/studio` |
| Typecheck | `npm run typecheck --workspace=@calmstudio/studio` |
| Lint | `npm run lint --workspace=@calmstudio/studio` |
| Coverage | `npm run test:coverage --workspace=@calmstudio/studio` |

---

## 10. Sample Architectures (for performance testing)

| File | Nodes | Relationships | Containment rels | Lines |
|------|-------|---------------|-------------------|-------|
| `static/demos/aws-multi-tier.calm.json` | 26 | 32 | 18 | 652 |
| `static/demos/ecommerce.calm.json` | 14 | ~20 | ~6 | 393 |
| `calm/architecture/calm-1.json` | ~5 | ~4 | 0 | 145 |
| `calm/architecture/calm-2.json` | ~8 | ~10 | ~3 | 239 |

The largest available demo is `aws-multi-tier` with 26 nodes and 3 levels of
nesting (VPC → subnets → services). For enterprise-scale testing, a synthetic
50+ node graph should be created.

---

## 11. Prior Art / Known Issues

Per the task prompt, these issues should be reviewed before Phase 2 design:

- **Issue #42**: Mermaid-based visualizer prototype — understand adoption outcome.
- **Issue #610**: "CALM UI/UX Hack Day" — merged PRs #487, #568, #570, #564 (earlier visualizer work).
- **Issue #778**: Visualizer styling inconsistency with CALM Hub.
- **Issues #780, #781**: Known gaps (test coverage, save-as capability).

These should be read from GitHub during Phase 1 (audit) to avoid re-litigating
settled decisions.

---

## Summary

The CALM Studio visualizer is a **Svelte 5 + SvelteKit** app rendering on
**@xyflow/svelte (Svelte Flow) v1.5** with **elkjs v0.11** for layout. The
ELK integration already supports nested containment with auto-sized containers,
cross-container edge lifting, and model-order-aware layered/rectpacking. Edges
use `getSmoothStepPath` (orthogonal with rounded corners). The projection layer
(`calmToFlow` / `flowToCalm`) handles bidirectional conversion with full
metadata preservation (interfaces, controls, data-classification, metadata)
and a documented multi-child grouping trade-off. The codebase is well-structured
with a direction mutex for sync, snapshot-based undo/redo, C4 view filtering,
flow visualization overlays, and comprehensive node/edge type coverage.
