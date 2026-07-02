<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 2 — Visualizer Target Specification

> Generated 2026-07-02.
> Input: Phase 0 discovery (`docs/visualizer-discovery.md`), Phase 1 audit (`docs/visualizer-audit.md`).
> Scope: Replace the graph/layout/rendering subsystem within the existing Svelte 5 + Svelte Flow + elkjs framework — not a full rewrite.

---

## 0. Design Principles

1. **Schema fidelity first.** Every CALM 1.2 field must survive a full canvas round-trip. If it can't be edited on the canvas, it must at least be preserved.
2. **Use what ELK already computes.** The layout engine produces edge routing, container sizing, and layered ordering. Stop discarding it and recomputing it client-side.
3. **Surgical changes.** Retain all existing Svelte Flow node/edge component structure, the direction mutex, the projection layer, the properties panel. Replace only the data paths that are lossy or the rendering paths that are suboptimal.
4. **No new dependencies.** elkjs + @xyflow/svelte remain the stack. No Cytoscape.js, no d3-force, no dagre.

---

## 1. Layout Engine

### 1.1 Decision: Keep elkjs layered + compound

**Rationale**: Phase 1 confirmed elkjs already handles nested containment correctly (recursive `ElkNode.children[]`, cross-child-container synthetic edges, container auto-sizing via deleted width/height). The problems are not in the layout algorithm — they are in how the layout output is consumed. Specifically, `extractPositions()` discards edge sections and the Svelte Flow edge components recompute paths from scratch.

No layout engine change is needed. The fix is downstream.

### 1.2 ELK configuration changes

Add these layout options to `buildElkGraph()`:

| Option | Value | Why |
|---|---|---|
| `elk.edgeRouting` | `'ORTHOGONAL'` | Axis-aligned edge segments. Currently implicit (layered algorithm default), make explicit for consistency. |
| `elk.hierarchyHandling` | `'INCLUDE_CHILDREN'` | Required for proper routing of edges that cross container boundaries. Default `SEPARATE_CHILDREN` computes edges per-container independently, producing broken routes for cross-hierarchy edges. |
| `elk.layered.spacing.edgeNodeBetweenLayers` | `'20'` | Minimum gap between edges and unrelated nodes in adjacent layers. Prevents edge-through-node visual overlap. |
| `elk.layered.spacing.edgeEdgeBetweenLayers` | `'15'` | Minimum gap between parallel edges. Prevents edge bundling that makes individual routes hard to follow. |

Container-level options remain as-is (layered for containers with edges, rectpacking for containers without).

### 1.3 Edge section extraction

**Current state** (`elkLayout.ts:extractPositions`): Only reads `child.x, child.y, child.width, child.height`. Discards `edges[].sections[]`.

**Change**: `extractPositions()` returns a new `EdgeRouteMap` alongside the existing `PositionMap`:

```typescript
type EdgeRoute = {
  points: Array<{ x: number; y: number }>;  // startPoint + bendPoints + endPoint, absolute coords
};

type EdgeRouteMap = Map<string, EdgeRoute>;  // keyed by edge id
```

The extraction walks the ELK output tree recursively (same as it walks nodes), accumulating parent offsets to convert section coordinates from container-relative to graph-absolute. For each `ElkExtendedEdge`:

```
absolutePoints = [
  { x: section.startPoint.x + parentOffsetX, y: section.startPoint.y + parentOffsetY },
  ...(section.bendPoints ?? []).map(bp => ({ x: bp.x + parentOffsetX, y: bp.y + parentOffsetY })),
  { x: section.endPoint.x + parentOffsetX, y: section.endPoint.y + parentOffsetY },
]
```

The web component's `edgeRenderer.ts` already does exactly this conversion (ELK sections → SVG polyline points) — confirming the approach works.

### 1.4 Web Worker

**Change**: Replace `import ELK from 'elkjs/lib/elk.bundled.js'` with the Web Worker variant.

```typescript
import ELK from 'elkjs/lib/elk-worker.js';
```

elkjs's `elk-worker.js` export creates a Web Worker internally. The `ELKConstructorArguments` type accepts `workerUrl` or `workerFactory` for custom worker loading if the default bundled worker doesn't work with Vite's build pipeline.

**Fallback**: If Vite's worker bundling conflicts with elkjs's internal worker, use `workerFactory`:

```typescript
const elk = new ELK({
  workerFactory: () => new Worker(
    new URL('elkjs/lib/elk-worker.min.js', import.meta.url),
    { type: 'module' }
  )
});
```

This moves layout computation off the main thread. The API is identical (`elk.layout(graph)` returns a Promise either way), so no calling code changes beyond the import.

**When**: Implement after core edge routing works. This is a performance optimization, not a correctness fix.

---

## 2. Edge Routing

### 2.1 Problem

Audit findings L1 + L6: ELK computes orthogonal edge routing with obstacle avoidance, but `extractPositions()` throws it away. Svelte Flow's `getSmoothStepPath` then recomputes paths using only source/target positions — no intermediate node awareness, no obstacle avoidance.

### 2.2 Solution: ELK-driven edge paths

Pass ELK's computed edge sections through to the Svelte Flow edge components as SVG path strings.

**Data flow**:

```
ELK layout output
  → extractPositions() + extractEdgeRoutes()   [elkLayout.ts]
  → EdgeRouteMap passed to calmToFlow()         [projection.ts]
  → edge.data.elkPath = svgPathFromPoints(...)  [projection.ts]
  → Custom edge component reads data.elkPath    [ConnectsEdge.svelte etc.]
  → BaseEdge path={data.elkPath ?? fallbackPath}
```

### 2.3 SVG path construction

Convert ELK's point array to an SVG path `d` attribute string:

```typescript
function elkPointsToSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M ${first.x},${first.y}` + rest.map(p => ` L ${p.x},${p.y}`).join('');
}
```

This produces orthogonal polyline paths. For rounded corners at bend points (matching the current visual style), replace `L` segments at right-angle bends with quadratic Bézier curves:

```typescript
// At each bend point where direction changes 90°:
// Instead of: L bx,by L nx,ny
// Use:        L (bx±r),(by±r) Q bx,by (bx±r),(by±r) L nx,ny
// where r = corner radius (e.g., 8px)
```

This is optional polish — straight orthogonal segments are correct and readable.

### 2.4 Edge component changes

Each custom edge component (`ConnectsEdge.svelte`, `DeployedInEdge.svelte`, `ComposedOfEdge.svelte`, `InteractsEdge.svelte`) currently calls `getSmoothStepPath` to compute a path. Change to:

```svelte
<script lang="ts">
  // existing props...
  const { data, sourceX, sourceY, targetX, targetY, ...rest }: EdgeProps = $props();

  // Use ELK path if available, fall back to getSmoothStepPath for manually-created edges
  const fallbackPath = $derived(getSmoothStepPath({ sourceX, sourceY, targetX, targetY, ... }));
  const edgePath = $derived(data?.elkPath ?? fallbackPath[0]);
</script>

<BaseEdge path={edgePath} {markerEnd} ... />
```

**Why fallback?** When a user manually creates an edge by dragging a handle, there's no ELK layout for that edge yet. The fallback keeps the edge visible until the next layout pass incorporates it.

### 2.5 Edge path persistence after drag

When a user drags a node, all ELK-computed edge paths become stale (the endpoints moved). Two strategies:

**Option A — Clear and re-layout**: After `handleNodeDragStop`, clear `elkPath` on all affected edges and trigger a localized re-layout. Edges snap to newly computed routes.

**Option B — Clear and fallback**: After drag, clear `elkPath` on affected edges. They fall back to `getSmoothStepPath` until the user explicitly re-layouts.

**Recommendation: Option B** for normal drags (no jank from synchronous re-layout), with an explicit "Auto-layout" button that runs full ELK layout to recompute all paths. This matches draw.io behavior where dragging doesn't auto-reroute every edge.

---

## 3. Containment Model

### 3.1 Current state

ELK auto-sizes containers during initial `layoutCalm()`. After that, container size is manual (Svelte Flow `NodeResizer`). Dragging a child into a container (`makeContainment`) does not resize the parent.

### 3.2 Container auto-resize on child mutation

After any operation that changes a container's children (drag-in, drag-out, delete child, add child via properties), compute the minimum bounding box:

```typescript
function autoResizeContainer(containerId: string, nodes: Node[]): void {
  const children = nodes.filter(n => n.parentId === containerId);
  if (children.length === 0) return;

  const parent = nodes.find(n => n.id === containerId);
  if (!parent) return;

  const PADDING = { top: 48, left: 32, bottom: 32, right: 32 };  // match ELK container padding

  const minX = Math.min(...children.map(c => c.position.x));
  const maxX = Math.max(...children.map(c => c.position.x + (c.measured?.width ?? c.width ?? 180)));
  const minY = Math.min(...children.map(c => c.position.y));
  const maxY = Math.max(...children.map(c => c.position.y + (c.measured?.height ?? c.height ?? 70)));

  const requiredWidth = PADDING.left + (maxX - minX) + PADDING.right;
  const requiredHeight = PADDING.top + (maxY - minY) + PADDING.bottom;

  // Only grow, never shrink below current size (user may have manually sized larger)
  parent.width = Math.max(parent.width ?? 0, requiredWidth);
  parent.height = Math.max(parent.height ?? 0, requiredHeight);
}
```

**Integration points**:
- `makeContainment()` in `containment.ts` — call after setting `parentId`
- `handleNodeDragStop` in `CalmCanvas.svelte` — call when a child node is dragged within its parent
- `removeContainment()` — optional: recalculate after child removal

### 3.3 Nested containment depth

ELK handles arbitrary nesting (confirmed: aws-multi-tier demo has 3 levels). The auto-resize function must propagate upward — resizing a container may require resizing its grandparent. Walk up the `parentId` chain:

```typescript
function autoResizeAncestors(nodeId: string, nodes: Node[]): void {
  let current = nodes.find(n => n.id === nodeId);
  while (current?.parentId) {
    autoResizeContainer(current.parentId, nodes);
    current = nodes.find(n => n.id === current!.parentId);
  }
}
```

---

## 4. Bi-directional Sync Contract

### 4.1 Problem: S1 — `applyFromCanvas` discards top-level fields

`applyFromCanvas` does `model = { nodes, relationships }`, losing `flows`, `$schema`, `$id`, `decorators`.

### 4.2 Fix: Merge instead of replace

```typescript
export function applyFromCanvas(nodes: Node[], edges: Edge[]): boolean {
  return withMutex(() => {
    const arch = flowToCalm(nodes, edges);
    model = { ...model, nodes: [...arch.nodes], relationships: [...arch.relationships] };
  });
}
```

This preserves all existing top-level fields while updating only what the canvas can produce.

### 4.3 Problem: F1 — `details` property dropped

`calmToFlow` does not map `details` into `node.data`. `flowToCalm` does not reconstruct it.

### 4.4 Fix: Pass `details` through the projection

In `calmToFlow`, add to the node data mapping:

```typescript
data: {
  // ... existing fields ...
  details: calmNode.details,  // { detailed-architecture?, required-pattern? }
}
```

In `flowToCalm`, reconstruct it:

```typescript
const node: CalmNode = {
  // ... existing fields ...
  ...(data.details && { details: data.details }),
};
```

The `details` property is read-only on the canvas (no inline editing of architecture drill-down links). It will be displayed in the Properties panel and as a metadata badge on nodes (see Section 5).

### 4.5 Sync contract summary

After these changes, the following contract holds:

| CALM 1.2 field | Canvas can edit? | Round-trip preserved? | Displayed? |
|---|---|---|---|
| `nodes[].unique-id` | No (read-only) | Yes | Properties panel |
| `nodes[].name` | Yes | Yes | Node label + properties |
| `nodes[].description` | Yes | Yes | Properties panel |
| `nodes[].node-type` | Yes | Yes | Node visual + properties |
| `nodes[].interfaces` | Yes | Yes | Handles + properties |
| `nodes[].controls` | Yes | Yes | Properties + badge (new) |
| `nodes[].metadata` | Yes | Yes | Properties panel |
| `nodes[].data-classification` | Yes | Yes | Badge (extended) |
| `nodes[].details` | No (read-only) | Yes (new) | Badge + properties (new) |
| `relationships[].controls` | Yes | Yes | Properties + badge (new) |
| `flows` | No | Yes (fixed via merge) | Overlay (existing) |
| `$schema`, `$id` | No | Yes (fixed via merge) | N/A |
| `decorators` | No | Yes (fixed via merge) | N/A |

### 4.6 Collapse state persistence

**Problem** (S3): `ContainerNode.svelte` emits `node:toggle-collapse` but nothing listens.

**Fix**: Store collapse state in `node.data.collapsed` (Svelte Flow node data). This survives re-projection because `calmToFlow` can read it from the existing position map and carry it forward. The collapse toggle handler in `CalmCanvas.svelte`:

```typescript
function handleToggleCollapse(event: CustomEvent<{ nodeId: string; collapsed: boolean }>) {
  const { nodeId, collapsed } = event.detail;
  nodes = nodes.map(n =>
    n.id === nodeId ? { ...n, data: { ...n.data, collapsed } } : n
  );
  applyFromCanvas(nodes, edges);
}
```

Wire this as a listener on the SvelteFlow component or on the container node wrapper.

**Not persisted in CALM JSON**: Collapse state is a UI concern, not architectural data. It lives in Svelte Flow node data only and is reset on fresh file load.

---

## 5. Metadata Overlays

### 5.1 Design approach

Metadata that cannot be edited inline on the canvas (controls, data-classification, details) should be visible as non-intrusive badges or indicators without cluttering the node body. The canvas serves as a wayfinding layer; the Properties panel remains the editing surface.

### 5.2 Node badges

Add a badge strip to the bottom-right or top-right of each node component:

| Badge | Trigger | Visual | Component |
|---|---|---|---|
| Controls count | `node.data.controls` has entries | Pill: `⚙ N` (count of control entries) | All node types |
| Data classification | `node.data['data-classification']` is set | Pill: classification value (e.g., `Public`, `Confidential`) | All node types (currently only 2) |
| Details link | `node.data.details` exists | Icon: `↗` (indicates drill-down available) | All node types |
| Validation severity | Node has validation issues | Existing colored border — no change needed | All node types |

Implementation: A shared `<NodeBadges>` Svelte component that reads `data` and renders applicable pills. Each node type component includes `<NodeBadges {data} />` in its template.

### 5.3 Edge badges

For edges with `controls`:

| Badge | Trigger | Visual |
|---|---|---|
| Controls | `edge.data.controls` has entries | Small `⚙` icon on edge label area |

### 5.4 Properties panel extensions

| Field | Panel section | Behavior |
|---|---|---|
| `details.detailed-architecture` | Node Properties → Details | Read-only link, click opens referenced architecture |
| `details.required-pattern` | Node Properties → Details | Read-only link, click opens referenced pattern |
| `controls[].config-url` | Controls list item | Displayed as link (currently hidden) |
| `controls[].config` | Controls list item | Displayed as expandable JSON (currently hidden) |
| `data-classification` | Node Properties | Dropdown selector (currently not in panel) |

---

## 6. Canvas Interaction: Draw.io Parity

The sections below address interaction gaps identified by comparing the proposed design against draw.io's hassle-free editing experience. These are additive — they don't change any of the layout/routing/sync work in Sections 1–5.

### 6.1 Inline label editing

**Problem**: In draw.io, double-clicking a node immediately lets you edit its label. In Studio, the user must select the node, find the Properties panel, locate the "name" field, and type there. This is the single biggest friction point for quick diagramming.

**Solution**: On double-click of a non-readonly node, render an inline text input directly over the node label.

```svelte
<!-- Inside each node component (ActorNode, SystemNode, etc.) -->
<script lang="ts">
  let editing = $state(false);
  let editValue = $state('');

  function startEdit() {
    editing = true;
    editValue = String(data.label ?? data.calmId);
  }

  function commitEdit() {
    editing = false;
    if (editValue.trim() && editValue !== data.label) {
      // Dispatch a custom event that +page.svelte handles
      node.dispatchEvent(new CustomEvent('node:rename', {
        detail: { nodeId: data.calmId, name: editValue.trim() },
        bubbles: true,
      }));
    }
  }
</script>

{#if editing}
  <input
    class="inline-label-edit"
    bind:value={editValue}
    onblur={commitEdit}
    onkeydown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { editing = false; } }}
    autofocus
  />
{:else}
  <span class="label" ondblclick={startEdit}>{data.label ?? data.calmId}</span>
{/if}
```

**Integration**: `CalmCanvas.svelte` currently only fires `ondblclicknode` in `readonly` mode (for C4 drill-down). In non-readonly mode, the double-click should be handled by the node component itself — no change needed to CalmCanvas since the `ondblclick` is on the `<span>` inside the node, not on the SvelteFlow event.

The `node:rename` event handler in `+page.svelte` calls `updateNodeProperty(nodeId, 'name', newValue)` — the same path the Properties panel uses, so undo/redo and model sync work automatically.

### 6.2 Edge reconnection

**Problem**: In draw.io, you can drag an edge endpoint from one node to another. In Studio, you must delete the edge and recreate it — a multi-step operation that breaks flow.

**Solution**: Svelte Flow natively supports edge reconnection via the `edgesReconnectable` prop and `onreconnect` event.

Add to `CalmCanvas.svelte`:

```svelte
<SvelteFlow
  ...
  edgesReconnectable={!readonly}
  onreconnect={handleReconnect}
>
```

The handler updates the CALM relationship's source or destination:

```typescript
function handleReconnect(oldEdge: Edge, newConnection: Connection) {
  // Update the edge in Svelte Flow state
  edges = edges.map(e =>
    e.id === oldEdge.id
      ? { ...e, source: newConnection.source, target: newConnection.target }
      : e
  );
  // Sync back to CALM model
  applyFromCanvas(nodes, edges);
}
```

**CALM model impact**: `flowToCalm` already reads `edge.source` / `edge.target` to reconstruct `connects.source.node` / `connects.destination.node`. Changing these in the Svelte Flow edge and round-tripping through `applyFromCanvas` updates the relationship correctly. For `deployed-in` / `composed-of` containment edges, reconnection also needs to update the containment relationship (move the child to a different container) — this requires calling `removeContainment` on the old parent and `makeContainment` on the new one.

### 6.3 Minimap

**Problem**: For large architectures (50+ nodes), users lose spatial context when zoomed in. draw.io shows a minimap overview in the corner.

**Solution**: Svelte Flow provides a `<MiniMap />` component out of the box. Single addition to `CalmCanvas.svelte`:

```svelte
<script>
  import { MiniMap } from '@xyflow/svelte';
</script>

<SvelteFlow ...>
  <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
  <MiniMap
    pannable
    zoomable
    style="bottom: 12px; right: 12px;"
  />
  <EdgeMarkers />
</SvelteFlow>
```

The minimap is pannable (click to navigate) and zoomable (scroll to zoom). Node colors in the minimap can be customized via a `nodeColor` callback to match node type colors.

### 6.4 Alignment guides

**Problem**: Grid snap (Section 7) aligns to a fixed 16px grid. draw.io also shows dynamic alignment lines when dragging a node near another node's edge or center — "snap to neighbors" in addition to "snap to grid."

**Solution**: Use the `onNodeDrag` event to detect proximity to other nodes and render temporary guide lines.

```typescript
function handleNodeDrag(event: { node: Node }) {
  const dragNode = event.node;
  const THRESHOLD = 8; // px proximity to trigger guide
  const guides: Array<{ axis: 'x' | 'y'; pos: number }> = [];

  for (const other of nodes) {
    if (other.id === dragNode.id || other.parentId !== dragNode.parentId) continue;

    const otherCenterX = other.position.x + (other.width ?? 180) / 2;
    const otherCenterY = other.position.y + (other.height ?? 70) / 2;
    const dragCenterX = dragNode.position.x + (dragNode.width ?? 180) / 2;
    const dragCenterY = dragNode.position.y + (dragNode.height ?? 70) / 2;

    // Vertical center alignment
    if (Math.abs(dragCenterX - otherCenterX) < THRESHOLD) {
      guides.push({ axis: 'x', pos: otherCenterX });
    }
    // Horizontal center alignment
    if (Math.abs(dragCenterY - otherCenterY) < THRESHOLD) {
      guides.push({ axis: 'y', pos: otherCenterY });
    }
    // Left edge alignment
    if (Math.abs(dragNode.position.x - other.position.x) < THRESHOLD) {
      guides.push({ axis: 'x', pos: other.position.x });
    }
    // Top edge alignment
    if (Math.abs(dragNode.position.y - other.position.y) < THRESHOLD) {
      guides.push({ axis: 'y', pos: other.position.y });
    }
  }

  alignmentGuides = guides; // reactive state → renders SVG lines
}

function handleNodeDragStop() {
  alignmentGuides = []; // clear guides when drag ends
  // ... existing drag stop logic
}
```

Guide lines are rendered as an SVG overlay within the SvelteFlow viewport — thin dashed lines spanning the canvas at the alignment position. The `alignmentGuides` state is a reactive array that a `<AlignmentGuides>` component reads to render `<line>` elements.

This is a medium-effort feature. It does not snap the node to the guide line — it only shows the guide. Actual snapping to neighbors (in addition to grid snap) can be added later by adjusting `dragNode.position` during the `onNodeDrag` callback.

---

## 7. Grid Snap

### 7.1 Change

Add snap-to-grid to the SvelteFlow component:

```svelte
<SvelteFlow
  {nodes}
  {edges}
  snapGrid={[16, 16]}
  ...
/>
```

Grid size of 16px provides alignment without being too coarse. This is a single-prop change on `CalmCanvas.svelte`.

### 7.2 Visual grid (optional)

Add a `<Background variant="dots" gap={16} />` component from `@xyflow/svelte` to show alignment dots. This is cosmetic and can be toggled via a toolbar button.

---

## 8. Performance

### 8.1 Targets

| Metric | Current | Target |
|---|---|---|
| Initial layout (26 nodes) | ~50ms | <50ms (no regression) |
| Initial layout (100 nodes) | Not tested | <500ms |
| Initial layout (250 nodes) | Not tested | <2s |
| Node drag frame rate | 60fps | 60fps (no regression) |
| Canvas→model sync | ~5ms | <10ms |

### 8.2 Approach

1. **Web Worker** (Section 1.4): Moves ELK computation off main thread. Layout time is unchanged but UI remains responsive.

2. **Incremental layout**: For single-node additions, instead of re-laying-out the entire graph, compute a local bounding box insert:
   - Place the new node adjacent to the most-recently-selected node or at a default position.
   - If inside a container, run ELK layout only on that container's subtree.
   - Defer full re-layout to an explicit user action ("Auto-layout" button).

3. **Debounced canvas→model sync**: Add a 100ms trailing debounce to `applyFromCanvas` during drag sequences. The `handleNodeDragStop` event already fires once at drag end, so this mainly affects rapid sequential operations (multi-select drag, paste multiple nodes).

4. **Lazy edge path computation**: Only compute `elkPointsToSvgPath` for edges whose source or target node is in the current viewport. Off-screen edges use no path (Svelte Flow already culls them from DOM).

---

## 9. Implementation Plan (Phase 3 Ordering)

Changes are ordered by dependency and impact. Each step is independently committable and testable. Steps are grouped into three tiers: **correctness** (data fidelity), **interaction** (draw.io parity), and **performance** (scale).

### Tier 1 — Correctness & Core Rendering

### Step 1: Fix `applyFromCanvas` merge (S1)
- File: `calmModel.svelte.ts`
- Change: `model = { ...model, nodes, relationships }`
- Test: Round-trip a CALM file with flows/$schema/$id, verify they survive a canvas drag
- Risk: Lowest — single line change, fixes the highest-severity sync bug

### Step 2: Preserve `details` in projection (F1)
- Files: `projection.ts` (calmToFlow + flowToCalm)
- Change: Map `details` into `node.data.details`, reconstruct in `flowToCalm`
- Test: Load a CALM file with `details`, drag a node, verify `details` survives in JSON output

### Step 3: Extract ELK edge routes (L1/L6)
- File: `elkLayout.ts`
- Change: `extractPositions` → returns `{ positions: PositionMap, edgeRoutes: EdgeRouteMap }`
- Change: Add ELK options (`elk.edgeRouting: ORTHOGONAL`, `elk.hierarchyHandling: INCLUDE_CHILDREN`)
- Test: Unit test that ELK output for aws-multi-tier sample contains edge routes with >2 points

### Step 4: Pipe edge routes to edge components
- Files: `projection.ts`, `+page.svelte`, all edge Svelte components
- Change: `calmToFlow` accepts `EdgeRouteMap`, sets `edge.data.elkPath`
- Change: Edge components use `data.elkPath ?? getSmoothStepPath(...)` fallback
- Test: Visual — load aws-multi-tier, edges route around nodes instead of through them

### Tier 2 — Canvas Interaction (draw.io parity)

### Step 5: Grid snap (L2)
- File: `CalmCanvas.svelte`
- Change: Add `snapGrid={[16, 16]}` prop
- Test: Drag a node, verify it snaps to 16px grid

### Step 6: Minimap (Section 6.3)
- File: `CalmCanvas.svelte`
- Change: Import and add `<MiniMap pannable zoomable />` inside `<SvelteFlow>`
- Test: Minimap appears in bottom-right corner, clicking it navigates the viewport
- Risk: Trivial — single component addition, no side effects

### Step 7: Edge reconnection (Section 6.2)
- File: `CalmCanvas.svelte`
- Change: Add `edgesReconnectable={!readonly}` prop and `onreconnect` handler
- Change: Handler updates edge source/target in Svelte Flow state, calls `applyFromCanvas`
- Change: For containment edges, also call `removeContainment` / `makeContainment`
- Test: Drag an edge endpoint from node A to node B, verify CALM JSON updates correctly

### Step 8: Container auto-resize (L3)
- Files: `containment.ts`, `CalmCanvas.svelte`
- Change: `autoResizeContainer` + `autoResizeAncestors` called after `makeContainment` and child drag
- Test: Drag a node into a container, verify container grows to fit

### Step 9: Collapse state persistence (S3)
- Files: `CalmCanvas.svelte`, `ContainerNode.svelte`
- Change: Listen for `node:toggle-collapse`, store in `node.data.collapsed`, survive re-projection
- Test: Collapse a container, edit JSON, verify container stays collapsed

### Step 10: Inline label editing (Section 6.1)
- Files: All node type components (`ActorNode.svelte`, `SystemNode.svelte`, `ServiceNode.svelte`, `DatabaseNode.svelte`, `NetworkNode.svelte`, `WebclientNode.svelte`, `EcosystemNode.svelte`, `LdapNode.svelte`, `DataAssetNode.svelte`, `ExtensionNode.svelte`, `GenericNode.svelte`, `ContainerNode.svelte`)
- Change: Replace static `<span class="label">` with inline-editable component (double-click → `<input>`, Enter/blur commits, Escape cancels)
- Change: `node:rename` event dispatched, handled in `+page.svelte` via `updateNodeProperty`
- Test: Double-click a node label, type a new name, blur — verify name updates in JSON and Properties panel
- Note: Could extract a shared `<EditableLabel>` component to avoid duplicating the logic across 12 node types

### Step 11: Metadata badges (F3, F4, new)
- Files: New `NodeBadges.svelte`, all node type components, `ControlsList.svelte`
- Change: Badge strip for controls/data-classification/details, expose config-url/config in properties
- Test: Load a CALM file with controls and data-classification, verify badges appear

### Step 12: Alignment guides (Section 6.4)
- Files: `CalmCanvas.svelte`, new `AlignmentGuides.svelte`
- Change: `onNodeDrag` callback detects proximity to sibling node edges/centers, sets reactive `alignmentGuides` state
- Change: `AlignmentGuides` component renders dashed SVG lines at guide positions, cleared on drag stop
- Test: Drag a node near another node's center line, verify a guide line appears
- Risk: Medium — requires careful coordinate math in Svelte Flow viewport space

### Tier 3 — Performance & Scale

### Step 13: Web Worker (L5)
- File: `elkLayout.ts`
- Change: Switch import to `elkjs/lib/elk-worker.js`
- Test: Layout still produces correct positions; main thread stays responsive during layout

### Step 14: Incremental layout (L4)
- File: `elkLayout.ts`, `+page.svelte`
- Change: `layoutSubtree(containerId)` function for localized re-layout
- Test: Add a node to a container, only that container's children move

---

## 10. What This Design Does NOT Change

- **Properties panel structure**: Existing property editing workflows are unchanged. New fields are additive. Inline label editing supplements (does not replace) the Properties panel — complex fields still go through the panel.
- **Code panel**: No changes to CodeMirror integration or JSON editing.
- **Flow visualization**: The overlay system for flows remains as-is.
- **C4 view mode**: Untouched. It uses its own compact layout path.
- **CLI/Hub integration**: No changes. These are independent systems.
- **CALM schema version**: No changes to schema parsing or validation. The fix is in the projection layer, not the schema.
- **Undo/redo**: Existing undo/redo system remains. New data fields (details, elkPath, collapsed) and new interactions (reconnect, rename) flow through the same `nodes`/`edges` state and `applyFromCanvas` that undo/redo already snapshots.
- **Manual edge waypoints**: Deferred to a future phase. ELK orthogonal routing provides good automatic paths; manual waypoint dragging conflicts with auto-layout and requires a persistent override system. If needed later, it would store user bend point overrides in `edge.data` and skip ELK routing for those edges.
- **Align/distribute toolbar**: Toolbar actions for "align left", "distribute horizontally", etc. on multi-selected nodes. Useful but lower priority than the core interaction improvements. Can be added as a follow-up without architectural changes.

---

## 11. Exit Criteria for Phase 2

- [ ] This design document is reviewed and approved
- [ ] No open questions on trade-offs (edge path persistence strategy, grid size, badge placement, inline editing scope)
- [ ] Phase 3 implementation order is agreed upon

---

## Appendix A: ELK API Types (Reference)

From `elkjs/lib/elk-api.d.ts` (confirmed via unpkg):

```typescript
interface ElkPoint { x: number; y: number }

interface ElkExtendedEdge extends ElkEdge {
  sources: string[];
  targets: string[];
  sections?: ElkEdgeSection[];
}

interface ElkEdgeSection extends ElkGraphElement {
  id: string;
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
  incomingShape?: string;
  outgoingShape?: string;
  incomingSections?: string[];
  outgoingSections?: string[];
}
```

Edge sections for nested edges are in container-relative coordinates. Must add ancestor `x`/`y` offsets to get graph-absolute coordinates for Svelte Flow.

## Appendix B: Svelte Flow BaseEdge (Reference)

`BaseEdge` accepts a `path` prop — raw SVG path `d` string. No requirement to use `getSmoothStepPath`/`getBezierPath`. Confirmed from svelteflow.dev API docs and existing usage in `ConnectsEdge.svelte`.

## Appendix C: Existing Precedent

The web component package (`packages/web-component/src/render/edgeRenderer.ts`) already converts ELK edge sections to SVG polylines:

```typescript
export function renderEdgeSvg(edge: RenderEdgeInput): string {
  const pointsStr = edge.points.map((p) => `${p.x},${p.y}`).join(' ');
  return `<polyline points="${pointsStr}" ... />`;
}
```

This confirms the approach works and has been validated in the project.
