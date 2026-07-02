<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  CalmCanvas.svelte — Main Svelte Flow canvas wrapper for CALM Studio.

  Responsibilities:
  - Mounts <SvelteFlow> with all CALM nodeTypes and edgeTypes
  - Handles HTML5 drag-and-drop from NodePalette (ondragover + ondrop)
  - Creates new nodes via screenToFlowPosition when items are dropped
  - Handles click-to-place via the onplacenode callback prop
  - Creates edges defaulting to DEFAULT_EDGE_TYPE ('connects')
  - Creates containment when deployed-in/composed-of edges are drawn
  - Detects node drag-into-container and auto-creates containment
  - Renders EdgeMarkers.svelte once (shared SVG defs for all edges)
  - Wires undo/redo (Cmd+Z/Cmd+Shift+Z), copy/paste (Cmd+C/V)
  - Wires search panel (Cmd+F), dark mode keyboard shortcut
  - Calls pushSnapshot BEFORE every mutation (RESEARCH Pitfall 6)

  Key decisions:
  - MUST use $state.raw for nodes/edges — Svelte Flow mutates arrays internally;
    deep $state() reactivity causes double-render loops (RESEARCH Pitfall 1)
  - makeContainment is called for both edge-draw and node drag-into (per user decision)
  - @svelte-put/shortcut action used for declarative keyboard shortcut binding
-->
<script lang="ts">
	import {
		SvelteFlow,
		Background,
		BackgroundVariant,
		MiniMap,
		ViewportPortal,
		useSvelteFlow,
		type Node,
		type Edge,
		type Connection,
		type Viewport,
	} from '@xyflow/svelte';
	import { shortcut } from '@svelte-put/shortcut';
	import { nanoid } from 'nanoid';

	import { nodeTypes, resolveNodeType } from './nodeTypes';
	import { edgeTypes, DEFAULT_EDGE_TYPE } from './edgeTypes';
	import { makeContainment, removeContainment, autoResizeAncestors, isContainmentType } from './containment';
	import { computeAlignmentGuides, type AlignmentGuide } from './alignmentGuides';
	import AlignmentGuides from './AlignmentGuides.svelte';
	import { layoutSubtree } from '$lib/layout/elkLayout';
	import type { CalmArchitecture } from '@calmstudio/calm-core';
	import { resolvePackNode } from '@calmstudio/extensions';
	import EdgeMarkers from './edges/EdgeMarkers.svelte';
	import NodeSearch from '$lib/search/NodeSearch.svelte';
	import LayersPanel from './LayersPanel.svelte';
	import { pushSnapshot, undo, redo } from '$lib/stores/history.svelte';
	import { copy, paste } from '$lib/stores/clipboard.svelte';
	import { applyFromCanvas } from '$lib/stores/calmModel.svelte';

	import '@xyflow/svelte/dist/style.css';

	/**
	 * Real payload shape for onnodedrag/onnodedragstart/onnodedragstop per
	 * NodeWrapper.svelte's actual dispatch: `{ event, targetNode, nodes }`.
	 * There is no `NodeDragEvent` export in this @xyflow/svelte version (1.6.0)
	 * — a stale import previously typed these handlers as `NodeDragEvent` and
	 * read `event.node`, which is always undefined on the real payload
	 * (`targetNode`, not `node`), silently no-op'ing drag-stop entirely
	 * (no position sync, no drag-into-container detection).
	 */
	type NodeDragPayload = { event: MouseEvent | TouchEvent; targetNode: Node | null; nodes: Node[] };

	// ─── Container scaffold helper ──────────────────────────────────────────
	// When a container with defaultChildren is placed, auto-create child nodes
	// inside it with composed-of edges. Positions start from a fixed 2-column
	// grid, then get replaced by an ELK-computed layoutSubtree pass scoped to
	// just this new container — the grid is only a fallback if that fails.

	async function scaffoldChildren(
		parentNode: Node,
		childTypes: string[],
	): Promise<{ childNodes: Node[]; childEdges: Edge[] }> {
		const cols = 2;
		const padX = 30;
		const padY = 50;
		const cellW = 200;
		const cellH = 80;
		const gapX = 20;
		const gapY = 20;

		const childNodes: Node[] = [];
		const childEdges: Edge[] = [];

		for (let i = 0; i < childTypes.length; i++) {
			const calmType = childTypes[i];
			const col = i % cols;
			const row = Math.floor(i / cols);
			const childId = nanoid();
			const childResolvedType = resolveNodeType(calmType);

			childNodes.push({
				id: childId,
				type: childResolvedType,
				position: {
					x: padX + col * (cellW + gapX),
					y: padY + row * (cellH + gapY),
				},
				parentId: parentNode.id,
				extent: 'parent',
				data: {
					label: `New ${calmType}`,
					calmId: childId,
					calmType,
				},
			});

			childEdges.push({
				id: nanoid(),
				source: parentNode.id,
				target: childId,
				type: 'composed-of',
				data: { protocol: '', description: '' },
			});
		}

		try {
			const subArch: CalmArchitecture = {
				nodes: [
					{ 'unique-id': parentNode.id, 'node-type': 'container', name: 'New Container', description: '' },
					...childNodes.map((n) => ({
						'unique-id': n.id,
						'node-type': (n.data as Record<string, unknown>).calmType as string,
						name: n.data.label as string,
						description: '',
					})),
				],
				relationships: childNodes.map((n) => ({
					'unique-id': `${parentNode.id}-${n.id}`,
					'relationship-type': {
						'composed-of': { container: parentNode.id, nodes: [n.id] },
					},
				})),
			};
			const { positions } = await layoutSubtree(subArch, parentNode.id);
			for (const child of childNodes) {
				const pos = positions.get(child.id);
				if (pos) child.position = { x: pos.x, y: pos.y };
			}
		} catch {
			// ELK failed for some reason — keep the fixed grid fallback positions.
		}

		return { childNodes, childEdges };
	}

	// ─── Props ────────────────────────────────────────────────────────────────

	let {
		nodes = $bindable<Node[]>([]),
		edges = $bindable<Edge[]>([]),
		onplacenode,
		onselectionchange,
		onfileimport,
		oncanvaschange,
		readonly = false,
		ondblclicknode,
		onrenamenode,
		zoomPercent = $bindable(100),
	}: {
		nodes?: Node[];
		edges?: Edge[];
		/** Called by parent when a palette item is clicked — places node at viewport center. */
		onplacenode?: (type: string) => void;
		/** Called when canvas selection changes. nodeId and edgeId are the IDs of the first selected items (or null). */
		onselectionchange?: (nodeId: string | null, edgeId: string | null) => void;
		/** Called when a .json file is dropped onto the canvas. Receives file content and filename. */
		onfileimport?: (content: string, filename: string) => void;
		/** Called when canvas content changes (node drag, edge create, delete, etc.) for dirty tracking. */
		oncanvaschange?: () => void;
		/** When true, disables dragging, connecting, delete keys, and all mutation handlers. Used for C4 navigation mode. */
		readonly?: boolean;
		/** Called when a node is double-clicked in readonly mode. Used for C4 drill-down navigation. */
		ondblclicknode?: (node: Node) => void;
		/** Called when a node label is renamed via inline double-click editing (EditableLabel). Receives the CALM unique-id and the new name. */
		onrenamenode?: (calmId: string, newName: string) => void;
		/** Current zoom level as a whole percentage (e.g. 100). Kept in sync via onmove; parent can read it for a zoom-level display widget. */
		zoomPercent?: number;
	} = $props();

	/**
	 * Notify parent of canvas changes. Guards against readonly mode to prevent
	 * isDirty from becoming true during C4 browsing (Pitfall 2).
	 */
	function notifyChange() {
		if (!readonly) oncanvaschange?.();
	}

	// ─── Svelte Flow context ─────────────────────────────────────────────────

	const { screenToFlowPosition, fitView, setCenter, getViewport, setViewport } = useSvelteFlow();

	/**
	 * Fit all nodes into view. Called by parent after import or layout.
	 */
	export function fitViewport() {
		fitView({ duration: 300, maxZoom: 1.2, padding: 0.2 });
	}

	const ZOOM_STEP = 1.2;
	const MIN_ZOOM_PERCENT = 10;
	const MAX_ZOOM_PERCENT = 400;

	/**
	 * Zoom in/out one step around the viewport center.
	 *
	 * Deliberately implemented via getViewport()/setViewport() rather than the
	 * useSvelteFlow() zoomIn/zoomOut helpers: those call into
	 * @xyflow/svelte's internal panZoom.scaleBy(), which resolves to a no-op
	 * (Promise<false>) in this app's actual mounted-pane setup even though the
	 * identical scaleExtent-respecting d3-zoom instance responds correctly to
	 * both wheel-zoom and fitView/setViewport calls — confirmed by direct
	 * console instrumentation in a live browser session, not just code
	 * inspection. setViewport() is the same primitive fitViewport() already
	 * relies on, so it's a proven-working code path here.
	 */
	function zoomBy(factor: number) {
		const vp = getViewport();
		const nextZoomPercent = Math.min(
			MAX_ZOOM_PERCENT,
			Math.max(MIN_ZOOM_PERCENT, Math.round(vp.zoom * factor * 100))
		);
		const nextZoom = nextZoomPercent / 100;
		// Keep the viewport center fixed while changing zoom (matches scaleBy's pointer-centered behavior closely enough for a toolbar button).
		const el = document.querySelector('.svelte-flow') as HTMLElement | null;
		const centerX = (el?.clientWidth ?? window.innerWidth) / 2;
		const centerY = (el?.clientHeight ?? window.innerHeight) / 2;
		const flowX = (centerX - vp.x) / vp.zoom;
		const flowY = (centerY - vp.y) / vp.zoom;
		setViewport(
			{ x: centerX - flowX * nextZoom, y: centerY - flowY * nextZoom, zoom: nextZoom },
			{ duration: 150 }
		);
	}

	/** Zoom in one step, centered on the viewport. Used by the zoom widget and desktop menu. */
	export function zoomInViewport() {
		zoomBy(ZOOM_STEP);
	}

	/** Zoom out one step, centered on the viewport. Used by the zoom widget and desktop menu. */
	export function zoomOutViewport() {
		zoomBy(1 / ZOOM_STEP);
	}

	/** Current zoom level as a percentage (e.g. 100 at zoom 1.0), rounded for display. */
	export function currentZoomPercent(): number {
		return Math.round(getViewport().zoom * 100);
	}

	/** Keeps the bindable zoomPercent prop in sync as the user pans/zooms. */
	function handleMove(_event: MouseEvent | TouchEvent | null, viewport: Viewport) {
		zoomPercent = Math.round(viewport.zoom * 100);
	}

	/**
	 * Save the current viewport state (position + zoom).
	 * Called by parent before entering C4 mode so it can be restored on exit.
	 */
	export function saveViewport(): Viewport {
		return getViewport();
	}

	/**
	 * Restore a previously saved viewport state with animation.
	 * Called by parent after exiting C4 mode.
	 */
	export function restoreViewport(vp: Viewport): void {
		setViewport(vp, { duration: 300 });
	}

	/**
	 * Center the viewport on the node or edge identified by calmId.
	 * Called by parent (+page.svelte) in response to ValidationPanel row clicks.
	 */
	export function navigateToNode(calmId: string) {
		const node = nodes.find((n) => (n.data?.calmId as string) === calmId || n.id === calmId);
		if (node) {
			const x = node.position.x + (node.measured?.width ?? 120) / 2;
			const y = node.position.y + (node.measured?.height ?? 60) / 2;
			setCenter(x, y, { zoom: 1.2, duration: 400 });
			// Select the node
			nodes = nodes.map((n) => ({ ...n, selected: n.id === node.id }));
		}
	}

	// ─── Search state ─────────────────────────────────────────────────────────

	let searchOpen = $state(false);

	function handleSearchResults(ids: string[]) {
		if (ids.length === 0) return;
		// Highlight matching nodes by setting selected: true
		nodes = nodes.map((n) => ({
			...n,
			selected: ids.includes(n.id),
		}));
	}

	function closeSearch() {
		searchOpen = false;
		// Deselect all nodes when search closes
		nodes = nodes.map((n) => ({ ...n, selected: false }));
	}

	// ─── Layers panel (draw.io-style outline of the containment tree) ───────

	let layersOpen = $state(false);
	let layersSelectedId = $state<string | null>(null);

	function handleLayerSelect(calmId: string) {
		layersSelectedId = calmId;
		navigateToNode(calmId);
	}

	// ─── DnD drop handler ────────────────────────────────────────────────────

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();

		// In readonly mode, only allow file imports — no new node drops
		if (readonly) return;

		// Check for file drop first (JSON file import)
		const file = event.dataTransfer?.files[0];
		if (file && (file.name.endsWith('.json') || file.name.endsWith('.calm.json'))) {
			const content = await file.text();
			onfileimport?.(content, file.name);
			return;
		}

		const calmType = event.dataTransfer?.getData('application/calm-node-type');
		if (!calmType) return;

		pushSnapshot(nodes, edges);

		const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		const id = nanoid();
		const resolvedType = resolveNodeType(calmType);

		const packMeta = calmType.includes(':') ? resolvePackNode(calmType) : null;
		const hasScaffold = resolvedType === 'container' && packMeta?.defaultChildren?.length;

		const newNode: Node = {
			id,
			type: resolvedType,
			position,
			data: {
				label: `New ${calmType}`,
				calmId: id,
				calmType,
			},
		};
		if (resolvedType === 'container') {
			newNode.width = hasScaffold ? 480 : 300;
			newNode.height = hasScaffold ? 280 : 200;
		}

		if (hasScaffold) {
			const { childNodes, childEdges } = await scaffoldChildren(newNode, packMeta.defaultChildren!);
			nodes = [...nodes, newNode, ...childNodes];
			edges = [...edges, ...childEdges];
		} else {
			nodes = [...nodes, newNode];
		}
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	// ─── Click-to-place ──────────────────────────────────────────────────────

	/**
	 * Place a node at the viewport center.
	 * Called by parent (+page.svelte) in response to NodePalette's placenode event.
	 */
	export async function placeNodeAtCenter(calmType: string) {
		const position = screenToFlowPosition({
			x: window.innerWidth / 2,
			y: window.innerHeight / 2,
		});
		const id = nanoid();
		const resolvedType = resolveNodeType(calmType);

		pushSnapshot(nodes, edges);

		const packMeta = calmType.includes(':') ? resolvePackNode(calmType) : null;
		const hasScaffold = resolvedType === 'container' && packMeta?.defaultChildren?.length;

		const newNode: Node = {
			id,
			type: resolvedType,
			position,
			data: {
				label: `New ${calmType}`,
				calmId: id,
				calmType,
			},
		};
		if (resolvedType === 'container') {
			newNode.width = hasScaffold ? 480 : 300;
			newNode.height = hasScaffold ? 280 : 200;
		}

		if (hasScaffold) {
			const { childNodes, childEdges } = await scaffoldChildren(newNode, packMeta.defaultChildren!);
			nodes = [...nodes, newNode, ...childNodes];
			edges = [...edges, ...childEdges];
		} else {
			nodes = [...nodes, newNode];
		}
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	// ─── Edge creation ───────────────────────────────────────────────────────

	function handleConnect(connection: Connection) {
		if (readonly) return;

		pushSnapshot(nodes, edges);

		// Svelte Flow may auto-add an edge via bind:edges before this callback fires.
		// Check if an edge already exists for this connection.
		const existing = edges.find(
			(e) =>
				(e.source === connection.source && e.target === connection.target) ||
				(e.source === connection.target && e.target === connection.source)
		);

		if (existing) {
			// Edge was auto-added by Svelte Flow — ensure it has our type and data
			edges = edges.map((e) =>
				e.id === existing.id
					? { ...e, type: e.type || DEFAULT_EDGE_TYPE, data: { protocol: '', description: '', ...e.data } }
					: e
			);
		} else {
			// No auto-added edge — create one ourselves
			const newEdge: Edge = {
				id: nanoid(),
				source: connection.source,
				target: connection.target,
				sourceHandle: connection.sourceHandle ?? undefined,
				targetHandle: connection.targetHandle ?? undefined,
				type: DEFAULT_EDGE_TYPE,
				data: {
					protocol: '',
					description: '',
				},
			};
			edges = [...edges, newEdge];
		}

		const edgeType = DEFAULT_EDGE_TYPE;
		if (isContainmentType(edgeType)) {
			nodes = makeContainment(connection.source, connection.target, nodes);
		}
		// Always sync to model so relationships appear in CALM JSON
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	/**
	 * Change the type of an existing edge (e.g. connects -> deployed-in).
	 * Handles containment side-effects when switching to/from containment types.
	 */
	function changeEdgeType(edgeId: string, newType: string) {
		pushSnapshot(nodes, edges);

		const edge = edges.find((e) => e.id === edgeId);
		if (!edge) return;

		edges = edges.map((e) =>
			e.id === edgeId ? { ...e, type: newType } : e
		);

		// If changing TO a containment type, establish containment
		if (isContainmentType(newType)) {
			nodes = makeContainment(edge.source, edge.target, nodes);
			nodes = autoResizeAncestors(edge.target, nodes);
		}
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	// ─── Edge reconnection (drag an endpoint to a different node) ───────────

	/**
	 * Gates edge reconnection behind readonly mode. EdgeReconnectAnchor calls
	 * this before committing the endpoint change to Svelte Flow's internal
	 * edges store — returning a falsy value aborts the reconnect entirely, so
	 * this is the correct hook point for readonly (there's no per-edge
	 * `reconnectable` flag in this @xyflow/svelte version).
	 */
	function handleBeforeReconnect(newEdge: Edge): Edge | false {
		return readonly ? false : newEdge;
	}

	/**
	 * Fired after EdgeReconnectAnchor has already updated the edge's
	 * source/target in Svelte Flow's internal store (which `bind:edges`
	 * mirrors back into our `edges` prop). Syncs the change to the CALM model
	 * and re-establishes containment when a deployed-in/composed-of edge's
	 * child endpoint moved to a different node.
	 */
	function handleReconnect(oldEdge: Edge, newConnection: Connection) {
		if (readonly) return;

		pushSnapshot(nodes, edges);

		if (isContainmentType(oldEdge.type ?? '')) {
			// Container (source) is unchanged in the common case; child (target)
			// moving to a different node means the old child must be un-nested
			// before the new pairing is established.
			if (oldEdge.target !== newConnection.target) {
				nodes = removeContainment(oldEdge.target, nodes);
			}
			nodes = makeContainment(newConnection.source, newConnection.target, nodes);
			nodes = autoResizeAncestors(newConnection.target, nodes);
		}

		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	// ─── Edge context menu (right-click to change type) ─────────────────────

	let edgeMenu = $state<{ x: number; y: number; edgeId: string } | null>(null);

	const EDGE_TYPE_OPTIONS = [
		{ value: 'connects', label: 'Connects' },
		{ value: 'interacts', label: 'Interacts' },
		{ value: 'deployed-in', label: 'Deployed In' },
		{ value: 'composed-of', label: 'Composed Of' },
		{ value: 'options', label: 'Options' },
	];

	function handleEdgeContextMenu(event: { event: MouseEvent; edge: Edge }) {
		if (readonly) return;
		event.event.preventDefault();
		edgeMenu = {
			x: event.event.clientX,
			y: event.event.clientY,
			edgeId: event.edge.id,
		};
	}

	function selectEdgeType(type: string) {
		if (edgeMenu) {
			changeEdgeType(edgeMenu.edgeId, type);
			edgeMenu = null;
		}
	}

	function closeEdgeMenu() {
		edgeMenu = null;
	}

	// ─── Node context menu (right-click for duplicate/delete) ───────────────

	let nodeMenu = $state<{ x: number; y: number; nodeId: string } | null>(null);

	function handleNodeContextMenu(event: { event: MouseEvent; node: Node }) {
		if (readonly) return;
		event.event.preventDefault();
		nodeMenu = {
			x: event.event.clientX,
			y: event.event.clientY,
			nodeId: event.node.id,
		};
	}

	function duplicateNodeFromMenu() {
		if (!nodeMenu) return;
		const target = nodes.find((n) => n.id === nodeMenu!.nodeId);
		nodeMenu = null;
		if (!target) return;
		copy([{ ...target, selected: true }]);
		const newNodes = paste(nodes);
		if (newNodes.length > 0) {
			pushSnapshot(nodes, edges);
			nodes = [...nodes, ...newNodes];
			applyFromCanvas(nodes, edges);
			notifyChange();
		}
	}

	function deleteNodeFromMenu() {
		if (!nodeMenu) return;
		const nodeId = nodeMenu.nodeId;
		nodeMenu = null;
		pushSnapshot(nodes, edges);
		nodes = nodes.filter((n) => n.id !== nodeId && n.parentId !== nodeId);
		edges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	function closeNodeMenu() {
		nodeMenu = null;
	}

	// ─── Alignment guides (draw.io-style snap-line hints) ────────────────────

	let alignmentGuides = $state<AlignmentGuide[]>([]);

	function handleNodeDrag(event: NodeDragPayload) {
		if (readonly || !event.targetNode) return;
		alignmentGuides = computeAlignmentGuides(event.targetNode, nodes);
	}

	// ─── Node drag-into-container ────────────────────────────────────────────

	/**
	 * Checks whether point a is inside the bounding box of b.
	 */
	function isInsideBounds(
		a: { x: number; y: number },
		b: { x: number; y: number; width?: number; height?: number }
	): boolean {
		const bw = b.width ?? 200;
		const bh = b.height ?? 150;
		return (
			a.x >= b.x &&
			a.x <= b.x + bw &&
			a.y >= b.y &&
			a.y <= b.y + bh
		);
	}

	function handleNodeDragStop(event: NodeDragPayload) {
		if (readonly) return;

		alignmentGuides = [];

		const draggedNode = event.targetNode;
		if (!draggedNode) return;
		// Don't reparent nodes that are already parented or are containers
		if (draggedNode.type === 'container' || draggedNode.parentId) return;

		// Find any large node whose bounds contain the dragged node's position.
		// Any node type can become a container when something is dropped into it.
		for (const candidate of nodes) {
			if (candidate.id === draggedNode.id) continue;
			if (candidate.type === 'container' || (candidate.measured?.width && candidate.measured.width > 100)) {
				const bounds = {
					x: candidate.position.x,
					y: candidate.position.y,
					width: candidate.measured?.width ?? candidate.width ?? 200,
					height: candidate.measured?.height ?? candidate.height ?? 150,
				};
				if (isInsideBounds(draggedNode.position, bounds)) {
					pushSnapshot(nodes, edges);
					nodes = makeContainment(candidate.id, draggedNode.id, nodes);
					nodes = autoResizeAncestors(draggedNode.id, nodes);
					applyFromCanvas(nodes, edges);
					notifyChange();
					return;
				}
			}
		}
		// Regular drag stop (position change only)
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	// ─── Keyboard shortcuts ───────────────────────────────────────────────────

	function handleUndo() {
		if (readonly) return;
		const snapshot = undo();
		if (snapshot) {
			nodes = snapshot.nodes;
			edges = snapshot.edges;
			applyFromCanvas(nodes, edges);
		}
	}

	function handleRedo() {
		if (readonly) return;
		const snapshot = redo();
		if (snapshot) {
			nodes = snapshot.nodes;
			edges = snapshot.edges;
			applyFromCanvas(nodes, edges);
		}
	}

	function handleCopy() {
		if (readonly) return;
		copy(nodes);
	}

	function handlePaste() {
		if (readonly) return;
		const newNodes = paste(nodes);
		if (newNodes.length > 0) {
			pushSnapshot(nodes, edges);
			nodes = [...nodes, ...newNodes];
			applyFromCanvas(nodes, edges);
		}
	}

	function handleSelectAll() {
		nodes = nodes.map((n) => ({ ...n, selected: true }));
	}

	/**
	 * Nudge every selected node by (dx, dy) — bound to arrow keys (1px) and
	 * Shift+arrow (10px) for pixel-precise positioning, matching draw.io.
	 * Skips entirely if nothing is selected so plain arrow-key presses don't
	 * interfere with typing inside inputs (shortcut action only fires when
	 * the canvas wrapper has focus-within, not while editing text elsewhere).
	 */
	function nudgeSelected(dx: number, dy: number) {
		if (readonly) return;
		// Skip while typing (inline label rename input, search box) so arrow
		// keys move the text cursor instead of the node — the shortcut action
		// is scoped to this canvas wrapper, so events from any focused
		// descendant (including EditableLabel's edit input) reach it.
		const tag = document.activeElement?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.closest('[contenteditable]')) return;
		const hasSelection = nodes.some((n) => n.selected);
		if (!hasSelection) return;
		pushSnapshot(nodes, edges);
		nodes = nodes.map((n) =>
			n.selected ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n
		);
		applyFromCanvas(nodes, edges);
		notifyChange();
	}

	function handleToggleSearch() {
		searchOpen = !searchOpen;
		if (!searchOpen) {
			// Clear search highlights when closing
			nodes = nodes.map((n) => ({ ...n, selected: false }));
		}
	}

	// ─── Selection change ─────────────────────────────────────────────────────

	function handleSelectionChange({ nodes: selectedNodes, edges: selectedEdges }: { nodes: Node[]; edges: Edge[] }) {
		const nodeId = selectedNodes.length > 0 ? (selectedNodes[0].data?.calmId as string ?? selectedNodes[0].id) : null;
		const edgeId = selectedEdges.length > 0 ? selectedEdges[0].id : null;
		onselectionchange?.(nodeId, edgeId);
	}

	// ─── Container collapse/expand (S3) ──────────────────────────────────────

	/**
	 * ContainerNode.svelte dispatches this on `document` when its collapse
	 * toggle is clicked. Collapse state lives only in Svelte Flow node data
	 * (never written to the CALM model) — it's a canvas display concern, not
	 * architectural data, so it resets on fresh file load but survives
	 * re-projection within a session (see handleCodeChange/handlePropertyMutation
	 * in +page.svelte, which now carry it forward like selection state).
	 */
	function handleToggleCollapse(event: Event) {
		const { nodeId, collapsed } = (event as CustomEvent<{ nodeId: string; collapsed: boolean }>).detail;
		nodes = nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, collapsed } } : n));
	}

	$effect(() => {
		document.addEventListener('node:toggle-collapse', handleToggleCollapse);
		return () => document.removeEventListener('node:toggle-collapse', handleToggleCollapse);
	});

	// ─── Inline label rename (draw.io-parity double-click editing) ──────────

	/**
	 * EditableLabel.svelte dispatches this on `document` when a node label
	 * edit is committed. Unlike collapse state, a rename mutates the CALM
	 * model, so it's gated on readonly here — this is the single place that
	 * decides whether a rename is allowed, instead of threading a readonly
	 * flag into all 12 node type components.
	 */
	function handleRenameNode(event: Event) {
		if (readonly) return;
		const { nodeId, name } = (event as CustomEvent<{ nodeId: string; name: string }>).detail;
		onrenamenode?.(nodeId, name);
	}

	$effect(() => {
		document.addEventListener('node:rename', handleRenameNode);
		return () => document.removeEventListener('node:rename', handleRenameNode);
	});
</script>

<!--
  Full-size canvas wrapper. ondragover + ondrop handle palette drops.
  The wrapper div must fill its parent (h-full w-full) so SvelteFlow
  has a proper measurement context.

  Keyboard shortcuts are bound via @svelte-put/shortcut action on the wrapper div.
-->
<div
	class="relative h-full w-full"
	ondragover={handleDragOver}
	ondrop={handleDrop}
	role="main"
	aria-label="CALM diagram canvas"
	use:shortcut={{
		trigger: [
			{ key: 'z', modifier: ['meta'], callback: handleUndo },
			{ key: 'z', modifier: ['meta', 'shift'], callback: handleRedo },
			{ key: 'c', modifier: ['meta'], callback: handleCopy },
			{ key: 'v', modifier: ['meta'], callback: handlePaste },
			{ key: 'a', modifier: ['meta'], callback: handleSelectAll },
			{ key: 'f', modifier: ['meta'], callback: handleToggleSearch },
			{ key: 'ArrowUp', callback: () => nudgeSelected(0, -1) },
			{ key: 'ArrowDown', callback: () => nudgeSelected(0, 1) },
			{ key: 'ArrowLeft', callback: () => nudgeSelected(-1, 0) },
			{ key: 'ArrowRight', callback: () => nudgeSelected(1, 0) },
			{ key: 'ArrowUp', modifier: ['shift'], callback: () => nudgeSelected(0, -10) },
			{ key: 'ArrowDown', modifier: ['shift'], callback: () => nudgeSelected(0, 10) },
			{ key: 'ArrowLeft', modifier: ['shift'], callback: () => nudgeSelected(-10, 0) },
			{ key: 'ArrowRight', modifier: ['shift'], callback: () => nudgeSelected(10, 0) },
		],
	}}
>
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{edgeTypes}
		deleteKey={readonly ? [] : ['Delete', 'Backspace']}
		nodesDraggable={!readonly}
		nodesConnectable={!readonly}
		selectionKey="Shift"
		multiSelectionKey="Meta"
		snapToGrid={!readonly}
		snapGrid={[16, 16]}
		fitView
		fitViewOptions={{ maxZoom: 1.2, padding: 0.2 }}
		zoomOnScroll={true}
		panOnDrag={true}
		panOnScroll={false}
		onconnect={handleConnect}
		onbeforereconnect={handleBeforeReconnect}
		onreconnect={handleReconnect}
		onnodedrag={handleNodeDrag}
		onnodedragstop={handleNodeDragStop}
		onedgecontextmenu={handleEdgeContextMenu}
		onnodecontextmenu={handleNodeContextMenu}
		onmove={handleMove}
		onselectionchange={handleSelectionChange}
		onnodedblclick={(e) => {
			if (readonly && ondblclicknode) {
				ondblclicknode(e.node);
			}
		}}
	>
		<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
		<MiniMap pannable zoomable />
		<EdgeMarkers />
		<ViewportPortal target="front">
			<AlignmentGuides guides={alignmentGuides} />
		</ViewportPortal>
	</SvelteFlow>

	<!-- Floating search panel — shown when Cmd+F is pressed -->
	{#if searchOpen}
		<NodeSearch
			{nodes}
			onresults={handleSearchResults}
			onclose={closeSearch}
		/>
	{/if}

	<!-- Layers/outline panel toggle — draw.io-style containment tree for navigating large diagrams -->
	{#if !readonly}
		{#if layersOpen}
			<LayersPanel
				{nodes}
				selectedNodeId={layersSelectedId}
				onselect={handleLayerSelect}
				onclose={() => (layersOpen = false)}
			/>
		{:else}
			<button
				type="button"
				class="layers-toggle-btn"
				onclick={() => (layersOpen = true)}
				aria-label="Show layers panel"
				title="Layers"
			>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<polygon points="12 2 2 7 12 12 22 7 12 2" />
					<polyline points="2 17 12 22 22 17" />
					<polyline points="2 12 12 17 22 12" />
				</svg>
			</button>
		{/if}
	{/if}

	<!-- Edge type context menu — right-click an edge to change its type -->
	{#if edgeMenu}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="edge-menu-backdrop" onclick={closeEdgeMenu}>
			<div
				class="edge-menu"
				style="left: {edgeMenu.x}px; top: {edgeMenu.y}px;"
				onclick={(e) => e.stopPropagation()}
			>
				<div class="edge-menu-header">Edge Type</div>
				{#each EDGE_TYPE_OPTIONS as opt}
					<button
						type="button"
						class="edge-menu-item"
						onclick={() => selectEdgeType(opt.value)}
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Node context menu — right-click a node to duplicate/delete it -->
	{#if nodeMenu}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="edge-menu-backdrop" onclick={closeNodeMenu}>
			<div
				class="edge-menu"
				style="left: {nodeMenu.x}px; top: {nodeMenu.y}px;"
				onclick={(e) => e.stopPropagation()}
			>
				<button type="button" class="edge-menu-item" onclick={duplicateNodeFromMenu}>
					Duplicate
				</button>
				<button type="button" class="edge-menu-item edge-menu-item-danger" onclick={deleteNodeFromMenu}>
					Delete
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.edge-menu-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
	}

	.edge-menu {
		position: fixed;
		z-index: 101;
		min-width: 140px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
		padding: 4px;
		font-family: var(--font-sans);
	}

	:global(.dark) .edge-menu {
		background: #111827;
		border-color: #334155;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.edge-menu-header {
		padding: 4px 8px;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
	}

	.edge-menu-item {
		display: block;
		width: 100%;
		padding: 6px 8px;
		border: none;
		background: none;
		border-radius: 5px;
		font-size: 12px;
		font-family: inherit;
		color: var(--color-text-primary);
		text-align: left;
		cursor: pointer;
		transition: background 0.1s;
	}

	.edge-menu-item:hover {
		background: var(--color-surface-tertiary);
	}

	:global(.dark) .edge-menu-item {
		color: #e2e8f0;
	}

	:global(.dark) .edge-menu-item:hover {
		background: #1e293b;
	}

	.edge-menu-item-danger {
		color: #dc2626;
	}

	.edge-menu-item-danger:hover {
		background: rgba(220, 38, 38, 0.08);
	}

	.layers-toggle-btn {
		position: absolute;
		left: 12px;
		top: 12px;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: 9px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
		transition: all 0.15s ease;
	}

	.layers-toggle-btn:hover {
		background: var(--color-surface-tertiary);
		color: var(--color-text-primary);
	}

	:global(.dark) .layers-toggle-btn:hover {
		background: #1e293b;
	}

</style>
