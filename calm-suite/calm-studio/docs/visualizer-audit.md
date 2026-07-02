<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 1 — Architectural & Schema-Translation Audit

> Generated 2026-07-02 from code inspection.
> Reference: Phase 0 discovery report in `docs/visualizer-discovery.md`.

---

## 1. Parser → Graph Translation: Call Path & Data Loss Points

### 1.1 Call path: File Load → Render

```
User opens/imports file
  → +page.svelte: importCalmFile(content)
    → JSON.parse(content) as CalmArchitecture
    → applyFromJson(parsed)               [calmModel.svelte.ts — sets canonical model]
    → layoutCalm(parsed, new Set(), 'DOWN') [elkLayout.ts — computes PositionMap]
    → calmToFlow(parsed, positionMap)       [projection.ts — CALM → Svelte Flow nodes/edges]
    → nodes = projected.nodes; edges = projected.edges  [SvelteFlow renders]
```

### 1.2 Call path: Code Panel Edit → Render

```
User edits JSON in CodePanel
  → handleCodeChange(newValue) [+page.svelte, 400ms debounce]
    → JSON.parse(newValue) as CalmArchitecture
    → Builds positionMap from current nodes (preserves positions)
    → applyFromJson(parsed) [mutex-guarded]
    → calmToFlow(parsed, positionMap)
    → nodes = projected.nodes; edges = projected.edges
```

### 1.3 Call path: Canvas Interaction → Model

```
User drags/connects/deletes on canvas
  → CalmCanvas event handler (handleConnect, handleNodeDragStop, etc.)
    → applyFromCanvas(nodes, edges) [calmModel.svelte.ts]
      → flowToCalm(nodes, edges)   [projection.ts — Svelte Flow → CALM]
      → model = { nodes, relationships }
```

### 1.4 Data loss points in `calmToFlow` (CALM → Svelte Flow)

| CALM 1.2 Field | Status | Details |
|---|---|---|
| `nodes[].unique-id` | **Preserved** | → `node.data.calmId` |
| `nodes[].node-type` | **Preserved** | → `node.data.calmType` |
| `nodes[].name` | **Preserved** | → `node.data.label` |
| `nodes[].description` | **Preserved** | → `node.data.description` |
| `nodes[].interfaces` | **Preserved** | → `node.data.interfaces` (full array) |
| `nodes[].controls` | **Preserved** | → `node.data.controls` (full object) |
| `nodes[].metadata` | **Preserved** | → `node.data.metadata` (full object) |
| `nodes[].data-classification` | **Preserved** | → `node.data['data-classification']` |
| `nodes[].details` | **DROPPED** | Not mapped in `calmToFlow` or `flowToCalm`. The `details` property (`detailed-architecture`, `required-pattern`) silently disappears on any canvas interaction that triggers `flowToCalm`. |
| `nodes[].customMetadata` | **Preserved** | CalmStudio extension — `node.data.customMetadata` |
| `relationships[].unique-id` | **Preserved** | → `edge.id` (with `#i` suffix for multi-child expansion) |
| `relationships[].relationship-type` | **Preserved** | Nested form correctly handled via variant detection |
| `relationships[].protocol` | **Preserved** | → `edge.data.protocol` |
| `relationships[].description` | **Preserved** | → `edge.data.description` |
| `relationships[].controls` | **Preserved** | → `edge.data.controls` |
| `relationships[].metadata` | **Preserved** | → `edge.data.metadata` |
| `flows` | **Preserved in model, read-only on canvas** | Flow visualization is overlay-only. Flows are not modified by canvas interactions. However, they are NOT included in `flowToCalm` output, so any code path that round-trips through `flowToCalm` loses flows. |
| `decorators` | **Preserved in model, not on canvas** | CalmStudio extension type. Not modified by canvas. |
| Multi-child relationship grouping | **Lossy (documented)** | A `composed-of: { nodes: [a, b, c] }` relationship is expanded into 3 edges. On round-trip through `flowToCalm`, these become 3 separate single-child relationships. |

#### Finding 1: `details` property silently dropped

**Severity: Medium**. The CALM 1.2 node schema includes `details: { detailed-architecture?, required-pattern? }` — links to drill-down architectures and required patterns. This is conceptually important for multi-level architecture modelling. `calmToFlow` does not map it into `node.data`, so:

1. It is never displayed in the Properties panel.
2. Any `applyFromCanvas` call (drag, connect, delete) round-trips through `flowToCalm` which does not include `details`, silently dropping it from the canonical model.

**File**: `apps/studio/src/lib/stores/projection.ts:161-198` (calmToFlow) and `:244-273` (flowToCalm).

#### Finding 2: `flows` lost on canvas round-trip

**Severity: Low** (currently). Flows are preserved in the CALM model store and rendered as overlays, but `flowToCalm` (`:236-309`) reconstructs the CalmArchitecture from only nodes + edges, omitting top-level `flows`. Any code path that calls `applyFromCanvas` → `flowToCalm` as the sole source of truth would lose flows. Currently this is mitigated because `applyFromCanvas` only replaces `model.nodes` and `model.relationships` (not the entire model), but the contract is fragile — a future change to `applyFromCanvas` that naively does `model = flowToCalm(...)` would silently discard flows.

#### Finding 3: `control-detail` partially rendered

**Severity: Low-Medium**. The CALM 1.2 `control-detail` schema requires `requirement-url` and exactly one of `config-url` or `config`. The `ControlsList.svelte` UI only exposes `requirement-url`. The `config-url` and `config` fields are:
- **Not displayed** in the Properties panel.
- **Not editable** via the UI.
- **Preserved** through the round-trip (because controls are stored as opaque objects in `node.data.controls` / `edge.data.controls`), so they are not lost — just invisible.

This means an architect cannot view or edit the compliance configuration of a control through the Studio UI; they must use the JSON code panel.

#### Finding 4: `data-classification` only rendered on Extension/Generic nodes

**Severity: Low**. The `data-classification` field is correctly projected through `calmToFlow`/`flowToCalm`, but the visual badge is only rendered in `ExtensionNode.svelte` and `GenericNode.svelte`. The 9 built-in node types (actor, system, service, database, network, webclient, ecosystem, ldap, data-asset) and the `ContainerNode` do not render a data-classification badge. The Properties panel also does not display it.

#### Finding 5: Interface-level endpoint references not connected to edges

**Severity: Low**. CALM 1.2 `connects.source` and `connects.destination` can include `interfaces: [...]` referencing specific interface unique-ids. The projection correctly creates per-interface `Handle` elements on nodes (right-side handles with `id={iface['unique-id']}`), but edge creation in `handleConnect` does not wire `sourceHandle` / `targetHandle` to interface IDs. This means the visual diagram does not show which specific interface a connection uses. The data is round-tripped through the `connects.source.node` / `connects.destination.node` path, but the `interfaces` array on the endpoint is not populated from canvas interactions.

---

## 2. Layout Engine Limitations

### 2.1 Current ELK configuration

The layout engine (`elkLayout.ts`) is well-implemented with genuine nested containment. It correctly:

- Builds a recursive `ElkNode` tree from `deployed-in` / `composed-of` relationships
- Auto-sizes containers (deletes fixed width/height from ELK input)
- Routes inner edges within containers
- Synthesizes cross-child-container edges for correct sub-container ordering
- Chains unconnected container children in model order
- Lifts top-level edges to ancestor nodes

### 2.2 Specific limitations

#### L1: No orthogonal edge routing control

**Current state**: Edges use Svelte Flow's `getSmoothStepPath` which produces orthogonal-ish paths with rounded corners. This is purely client-side path computation based on source/target positions — it has **no awareness of intermediate nodes**. Edges can and do overlap nodes they don't connect to.

**Why it fails**: `getSmoothStepPath` only considers the source/target positions and a fixed border radius. It does not:
- Route around intermediate nodes (no obstacle avoidance)
- Use ELK's computed edge routing (ELK computes edge bend points via its `sections` output, but `layoutCalm` discards them — only node positions are extracted)
- Support port constraints (edges connect to generic top/bottom/left/right handles, not specific ports)

**File**: `elkLayout.ts:356-374` — `extractPositions()` only reads `child.x, child.y, child.width, child.height` from ELK output; edge `sections` (with computed bend points) are ignored.

**File**: `ConnectsEdge.svelte:28-30` — uses `getSmoothStepPath` with only source/target coordinates.

#### L2: No grid snap

**Current state**: Nodes can be dragged to any pixel position. There is no snap-to-grid or alignment guide. After manual repositioning, nodes may be misaligned, creating an untidy appearance.

**File**: `CalmCanvas.svelte:547-565` — `SvelteFlow` component has no `snapToGrid` or `snapGrid` prop set.

#### L3: Container resize is manual only after initial layout

**Current state**: ELK auto-sizes containers during `layoutCalm`. But after initial layout, container sizes are managed by Svelte Flow's `NodeResizer` component (manual drag resize). If a user adds a new child node to a container by dragging it in, the container does **not** automatically grow. The child is clipped by `extent: 'parent'` and may overlap siblings.

**Specific scenario**: User has a VPC container with 2 subnets. They drag a third subnet into the VPC. `makeContainment` sets `parentId` and `extent: 'parent'`, but does not resize the VPC to accommodate the new child. The user must manually drag the VPC's resize handle.

**File**: `containment.ts:44-70` — `makeContainment` only sets `parentId`/`extent`/`zIndex`; it does not adjust parent dimensions. `CalmCanvas.svelte:432-463` — `handleNodeDragStop` calls `makeContainment` but does not trigger re-layout.

#### L4: No incremental layout

**Current state**: `layoutCalm` recomputes positions for ALL non-pinned nodes. There is no incremental layout for single-node additions or local repositioning. After adding a node, the user must either:
- Accept the node appearing at a default offset position (100 + idx*160, 100)
- Run full auto-layout (which moves all unpinned nodes)

**File**: `elkLayout.ts:101-105` — `layoutCalm` takes the full architecture and a pinned set; no incremental mode.

#### L5: Web Worker not used

**Current state**: ELK runs on the main thread via `elk.bundled.js`. For the current demo sizes (26 nodes max), this is not a problem. For enterprise architectures (100+ nodes), ELK layout computation could freeze the UI.

**Consideration**: elkjs supports `elk.worker.js` for Web Worker execution. The current `elk.bundled.js` import is synchronous (bundled wasm/JS, no worker).

**File**: `elkLayout.ts:18` — `import ELK from 'elkjs/lib/elk.bundled.js'`

#### L6: ELK edge bend points discarded

**Current state**: ELK's layered algorithm computes orthogonal edge routing with bend points (available via `edge.sections[].startPoint`, `bendPoints[]`, `endPoint`). These are discarded by `extractPositions()` which only reads node positions. Svelte Flow then recomputes edge paths from scratch using `getSmoothStepPath`, ignoring the high-quality routing ELK already computed.

This is the root cause of L1 (no obstacle avoidance). If ELK's edge sections were used, edges would route around nodes properly.

**File**: `elkLayout.ts:356-374` — only node positions extracted; no edge section data returned.

---

## 3. State Synchronization

### 3.1 Architecture

The sync system uses a **direction mutex** pattern:

```
                    ┌──────────────────┐
                    │  Canonical Model  │ ← $state<CalmArchitecture>
                    │  calmModel.svelte │
                    └────┬────────┬────┘
                         │        │
              applyFromJson()  applyFromCanvas()
              (mutex-guarded)  (mutex-guarded)
                         │        │
                    ┌────┴────┐ ┌─┴────────┐
                    │CodePanel│ │CalmCanvas │
                    │(reverse │ │(two-way   │
                    │ sync)   │ │ bind)     │
                    └─────────┘ └───────────┘
```

### 3.2 Forward sync: Model → CodePanel

- **Mechanism**: `calmJson = $derived(getModelJson())` in `+page.svelte`. Reactive — any model change immediately updates the CodeMirror value.
- **Performance**: `JSON.stringify(model, null, 2)` runs on every model mutation. For large models this could cause jank, but at current sizes (26 nodes) it's fast.

### 3.3 Reverse sync: CodePanel → Model → Canvas

- **Mechanism**: `handleCodeChange(newValue)` with 400ms debounce.
- **Position preservation**: Builds a `positionMap` from current node positions before re-projection, so editing JSON doesn't scatter the diagram.
- **Selection preservation**: Maintains a `selectionMap` across re-projection.
- **Error handling**: Parse errors set `codeParseError`; canvas keeps last valid state.
- **Mutex**: `applyFromJson` checks the `syncing` flag to prevent re-entrant model→code→model loops.

### 3.4 Canvas → Model sync

- **Mechanism**: `applyFromCanvas(nodes, edges)` called after every mutation (drag stop, connect, delete, paste, undo/redo).
- **Projection**: `flowToCalm(nodes, edges)` converts Svelte Flow state back to CalmArchitecture.
- **Mutex**: `applyFromCanvas` checks the `syncing` flag.

### 3.5 Properties Panel → Model → Canvas

- **Mechanism**: `updateNodeProperty()` / `updateEdgeProperty()` directly mutate the model store. Then `handlePropertyMutation()` in `+page.svelte` re-projects via `calmToFlow(model, positionMap)`.
- **Edge update strategy**: Edges are updated in-place (map over existing array) rather than replaced, to preserve Svelte Flow internal state (selection, animation, hover).

### 3.6 Sync gaps and risks

#### S1: `flowToCalm` is lossy for top-level architecture fields

As noted in Finding 2, `flowToCalm` only produces `{ nodes, relationships }`. The canonical model store's `applyFromCanvas` currently mitigates this by only updating those two fields:

```typescript
// calmModel.svelte.ts:64-69
export function applyFromCanvas(nodes: Node[], edges: Edge[]): boolean {
    return withMutex(() => {
        const arch = flowToCalm(nodes, edges);
        model = { nodes: [...arch.nodes], relationships: [...arch.relationships] };
    });
}
```

**Risk**: This replaces the entire model with a new object containing only `nodes` and `relationships`. Any top-level fields beyond these two (`flows`, `decorators`, `$schema`, `$id`, etc.) are discarded on every canvas interaction. This means:
- `flows` are lost on any canvas interaction.
- `$schema` and `$id` are lost on any canvas interaction.
- Any future top-level CALM fields would also be lost.

The fix would be to merge rather than replace: `model = { ...model, nodes: [...arch.nodes], relationships: [...arch.relationships] }`.

**File**: `calmModel.svelte.ts:64-69`.

#### S2: No debounce on canvas→model sync

Every `handleNodeDragStop` call triggers `applyFromCanvas` → `flowToCalm` → model update → reactive `calmJson` update → CodeMirror re-render. During rapid drag operations, this could cause frame drops. Currently tolerable at small scale.

#### S3: Collapse state not synchronized

`ContainerNode.svelte` manages collapse state locally (`let collapsed = $state(data.collapsed ?? false)`). It emits a `node:toggle-collapse` CustomEvent, but there is no listener for this event anywhere in the codebase. Collapse state is:
- Not persisted in the CALM model
- Not round-tripped through `calmToFlow`/`flowToCalm`
- Lost on re-projection (e.g., after code panel edit)
- Not part of undo/redo history

**File**: `ContainerNode.svelte:11-18` — emits event, no handler found.

---

## 4. Summary of Findings

### Critical (blocks enterprise-grade visualization)

| ID | Finding | Impact |
|---|---|---|
| L1 | Edge routing has no obstacle avoidance | Edges cross through unrelated nodes, making complex diagrams unreadable |
| L6 | ELK edge bend points discarded | Root cause of L1 — ELK already computes proper routing but it's thrown away |
| S1 | `applyFromCanvas` discards top-level fields | `flows`, `$schema`, `$id`, and any additional CALM fields silently lost on every canvas interaction |

### Important (significant UX or fidelity issues)

| ID | Finding | Impact |
|---|---|---|
| F1 | `details` property dropped | Multi-level architecture links (`detailed-architecture`, `required-pattern`) silently lost |
| L3 | No auto-resize of containers on child add | Users must manually resize containers after drag-in |
| L4 | No incremental layout | Adding a single node requires full re-layout or manual positioning |
| F3 | `control-detail` partially rendered | `config-url` and `config` invisible in Properties panel |
| S3 | Collapse state not persisted | Container collapse/expand lost on re-projection |

### Minor (polish or edge cases)

| ID | Finding | Impact |
|---|---|---|
| L2 | No grid snap | Nodes can be misaligned after manual drag |
| L5 | ELK on main thread | Could freeze UI on very large architectures |
| F4 | `data-classification` badge only on 2 node types | 9 built-in types don't show the badge |
| F5 | Interface-level connects endpoints not wired | Edge handles exist but aren't connected to specific interfaces |
| S2 | No debounce on canvas→model sync | Could cause frame drops during rapid drag |
| F2 | Flows lost on canvas round-trip | Currently mitigated but fragile contract |

---

## 5. Recommendations for Phase 2 Design

Based on this audit, the Phase 2 design proposal should address:

1. **Edge routing**: Use ELK's computed edge sections (bend points) instead of Svelte Flow's `getSmoothStepPath`. This is the single highest-impact change — it eliminates L1 and L6 simultaneously without changing the layout algorithm.

2. **Container auto-resize**: After `makeContainment`, trigger a localized ELK re-layout for the affected container subtree, or compute minimum bounding box from children + padding.

3. **Model merge in `applyFromCanvas`**: Change from full replacement to `{ ...model, nodes, relationships }` to preserve `flows`, `$schema`, `$id`, decorators, and future top-level fields.

4. **`details` property round-trip**: Add `details` to `calmToFlow` data mapping and `flowToCalm` reconstruction.

5. **Grid snap**: Enable `snapToGrid` and `snapGrid` on the SvelteFlow component.

6. **Web Worker for layout**: Switch from `elk.bundled.js` to `elk-worker.js` for non-blocking layout on large graphs.

7. **Metadata overlays**: Design how `controls`, `data-classification`, `config-url`/`config`, and `details` are surfaced on the canvas (badges, hover panels, header annotations) without cluttering the base node rendering.
