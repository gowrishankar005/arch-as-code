// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * projection.ts — Pure bidirectional projection functions between
 * CalmArchitecture (CALM 1.2 nested form) and Svelte Flow.
 *
 * calmToFlow: converts a CalmArchitecture into Svelte Flow nodes[] and edges[].
 *   - `connects` variant → 1 edge (source.node → destination.node)
 *   - `composed-of`/`deployed-in` variant → N edges (container → each child)
 *   - `interacts` variant → N edges (actor → each interacted node)
 *   - `options` variant → 0 edges (no graph topology in spec)
 *   When a multi-child variant has N>1, each derived edge gets a suffixed
 *   unique-id (`<base>#<i>`) so Svelte Flow stays 1-edge-per-row.
 *
 * flowToCalm: converts Svelte Flow nodes[] and edges[] back to
 * CalmArchitecture. Each Svelte Flow edge becomes exactly one
 * CalmRelationship; multi-child round-trips therefore split into
 * separate single-child rels (a documented, lossy-but-correct trade-off).
 *
 * IMPORTANT: This file must NOT import from .svelte.ts files (not testable
 * in vitest without additional Svelte transform setup).
 */

import type { Node, Edge } from '@xyflow/svelte';
import type {
	CalmArchitecture,
	CalmControls,
	CalmInterface,
	CalmNode,
	CalmRelationship,
	CalmRelationshipType,
	CalmRelationshipVariant
} from '@calmstudio/calm-core';
import type { EdgeRouteMap } from '$lib/layout/elkLayout';
import { resolveNodeType } from '$lib/canvas/nodeTypes';

/** CALM 1.2 `details` — { detailed-architecture?, required-pattern? }. */
type CalmNodeDetails = NonNullable<CalmNode['details']>;

/** Builds an orthogonal SVG path `d` string from ELK's ordered route points. */
function svgPathFromPoints(points: Array<{ x: number; y: number }>): string {
	if (points.length === 0) return '';
	const [first, ...rest] = points;
	return `M ${first.x},${first.y}` + rest.map((p) => ` L ${p.x},${p.y}`).join('');
}

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

/** Total length of a polyline. */
function pathLength(points: Point[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	}
	return total;
}

/** Point at fraction `t` (0..1) along a polyline, measured by arc length. */
function pointAtFraction(points: Point[], t: number): Point {
	if (points.length === 1) return points[0];
	const target = pathLength(points) * t;
	let covered = 0;
	for (let i = 1; i < points.length; i++) {
		const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
		if (covered + segLen >= target || i === points.length - 1) {
			const segT = segLen === 0 ? 0 : (target - covered) / segLen;
			return {
				x: points[i - 1].x + (points[i].x - points[i - 1].x) * segT,
				y: points[i - 1].y + (points[i].y - points[i - 1].y) * segT
			};
		}
		covered += segLen;
	}
	return points[points.length - 1];
}

/** Unit vector perpendicular to the route's direction at fraction `t` (0..1). */
function normalAtFraction(points: Point[], t: number): Point {
	if (points.length < 2) return { x: 0, y: 1 };
	const target = pathLength(points) * t;
	let covered = 0;
	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - points[i - 1].x;
		const dy = points[i].y - points[i - 1].y;
		const segLen = Math.hypot(dx, dy);
		if (covered + segLen >= target || i === points.length - 1) {
			if (segLen === 0) return { x: 0, y: 1 };
			return { x: -dy / segLen, y: dx / segLen };
		}
		covered += segLen;
	}
	return { x: 0, y: 1 };
}

/** Approximate on-screen footprint of an edge's protocol-label pill, for collision checks. */
const LABEL_WIDTH = 70;
const LABEL_HEIGHT = 20;

function labelRectAt(x: number, y: number): Rect {
	return { x: x - LABEL_WIDTH / 2, y: y - LABEL_HEIGHT / 2, width: LABEL_WIDTH, height: LABEL_HEIGHT };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
	return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Places an edge label along its ELK route. Starts at the true (arc-length)
 * midpoint, then searches for the nearest clear spot — first by sliding
 * along the route, then by nudging perpendicular to it at each point —
 * that doesn't overlap a node's bounding box or an already-placed label.
 * Sliding alone handles a label sitting on top of a node it passes behind;
 * the perpendicular nudge is what separates labels on near-parallel edges,
 * which sliding along either route can't do since both routes run the same
 * direction. Falls back to the plain midpoint if nothing is clear (a rare
 * overlap beats a label detached from its edge).
 */
function placeLabel(points: Point[], nodeRects: Rect[], placedLabelRects: Rect[]): Point {
	const candidateFractions = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
	const perpendicularOffsets = [0, 14, -14, 28, -28];
	for (const t of candidateFractions) {
		const base = pointAtFraction(points, t);
		const normal = normalAtFraction(points, t);
		for (const off of perpendicularOffsets) {
			const p = { x: base.x + normal.x * off, y: base.y + normal.y * off };
			const rect = labelRectAt(p.x, p.y);
			const blocked =
				nodeRects.some((r) => rectsOverlap(rect, r)) ||
				placedLabelRects.some((r) => rectsOverlap(rect, r));
			if (!blocked) {
				placedLabelRects.push(rect);
				return p;
			}
		}
	}
	const fallback = pointAtFraction(points, 0.5);
	placedLabelRects.push(labelRectAt(fallback.x, fallback.y));
	return fallback;
}

/** ELK layout node dimensions — must match elkLayout.ts constants. */
const NODE_WIDTH = 80;
const NODE_HEIGHT = 70;

/**
 * Resolve a node's absolute top-left origin by walking up the containment
 * chain. ELK stores child positions relative to their parent container, so
 * we accumulate ancestor offsets to get graph-absolute coordinates.
 */
function absoluteOrigin(
	nodeId: string,
	positionMap: Map<string, { x: number; y: number; width?: number; height?: number }>,
	childToParent: Map<string, string>
): Point | undefined {
	const pos = positionMap.get(nodeId);
	if (!pos) return undefined;

	let ax = pos.x;
	let ay = pos.y;
	let current = nodeId;
	while (childToParent.has(current)) {
		const pid = childToParent.get(current)!;
		const pp = positionMap.get(pid);
		if (!pp) break;
		ax += pp.x;
		ay += pp.y;
		current = pid;
	}
	return { x: ax, y: ay };
}

function absoluteCenter(
	nodeId: string,
	positionMap: Map<string, { x: number; y: number; width?: number; height?: number }>,
	childToParent: Map<string, string>,
	containerIds: ReadonlySet<string>
): { x: number; y: number } | undefined {
	const origin = absoluteOrigin(nodeId, positionMap, childToParent);
	if (!origin) return undefined;

	const pos = positionMap.get(nodeId)!;
	const isContainer = containerIds.has(nodeId);
	return {
		x: origin.x + (isContainer ? (pos.width ?? 300) / 2 : NODE_WIDTH / 2),
		y: origin.y + (isContainer ? (pos.height ?? 200) / 2 : NODE_HEIGHT / 2),
	};
}

/** Resolve a node's absolute bounding box, for edge-label collision checks. */
function absoluteRect(
	nodeId: string,
	positionMap: Map<string, { x: number; y: number; width?: number; height?: number }>,
	childToParent: Map<string, string>,
	containerIds: ReadonlySet<string>
): Rect | undefined {
	const origin = absoluteOrigin(nodeId, positionMap, childToParent);
	if (!origin) return undefined;

	const pos = positionMap.get(nodeId)!;
	const isContainer = containerIds.has(nodeId);
	return {
		x: origin.x,
		y: origin.y,
		width: isContainer ? (pos.width ?? 300) : NODE_WIDTH,
		height: isContainer ? (pos.height ?? 200) : NODE_HEIGHT,
	};
}

/**
 * Choose the best source/target handle pair based on the dominant direction
 * between two node centers. This makes edges connect to the nearest side
 * of each node (like draw.io) instead of always using bottom→top.
 */
function bestHandlePair(
	srcCenter: { x: number; y: number },
	tgtCenter: { x: number; y: number }
): { sourceHandle: string; targetHandle: string } {
	const dx = tgtCenter.x - srcCenter.x;
	const dy = tgtCenter.y - srcCenter.y;

	if (Math.abs(dy) >= Math.abs(dx)) {
		return dy >= 0
			? { sourceHandle: 'bottom-source', targetHandle: 'top-target' }
			: { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
	}
	return dx >= 0
		? { sourceHandle: 'right-source', targetHandle: 'left-target' }
		: { sourceHandle: 'left-source', targetHandle: 'right-target' };
}

/** The set of CALM variant keys that imply containment. */
const CONTAINMENT_VARIANTS: ReadonlySet<CalmRelationshipVariant> = new Set([
	'deployed-in',
	'composed-of'
]);

/**
 * Discover the variant key actually present on a relationship-type object.
 * Returns null when the variant is malformed (no recognised key).
 */
function variantOf(rt: CalmRelationshipType): CalmRelationshipVariant | null {
	if ('connects' in rt) return 'connects';
	if ('composed-of' in rt) return 'composed-of';
	if ('interacts' in rt) return 'interacts';
	if ('deployed-in' in rt) return 'deployed-in';
	if ('options' in rt) return 'options';
	return null;
}

/**
 * Returns one or more (source, target) pairs derived from a single CALM
 * relationship. For composed-of/deployed-in/interacts, expands to N pairs
 * — one per child/peer node.
 */
function expandEdgePairs(
	rel: CalmRelationship,
): Array<{ source: string; target: string; variant: CalmRelationshipVariant }> {
	const rt = rel['relationship-type'];
	if ('connects' in rt) {
		return [
			{
				source: rt.connects.source.node,
				target: rt.connects.destination.node,
				variant: 'connects'
			}
		];
	}
	if ('composed-of' in rt) {
		return rt['composed-of'].nodes.map((child) => ({
			source: rt['composed-of'].container,
			target: child,
			variant: 'composed-of' as const
		}));
	}
	if ('deployed-in' in rt) {
		return rt['deployed-in'].nodes.map((child) => ({
			source: rt['deployed-in'].container,
			target: child,
			variant: 'deployed-in' as const
		}));
	}
	if ('interacts' in rt) {
		return rt.interacts.nodes.map((peer) => ({
			source: rt.interacts.actor,
			target: peer,
			variant: 'interacts' as const
		}));
	}
	// `options` has no graph topology; skip.
	return [];
}

/**
 * Build a CALM 1.2 nested `relationship-type` from a flat (source, target,
 * variant) triple. Used when projecting Svelte Flow edges back to CALM.
 */
function buildRelationshipType(
	variant: CalmRelationshipVariant,
	source: string,
	target: string
): CalmRelationshipType {
	switch (variant) {
		case 'connects':
			return { connects: { source: { node: source }, destination: { node: target } } };
		case 'composed-of':
			return { 'composed-of': { container: source, nodes: [target] } };
		case 'deployed-in':
			return { 'deployed-in': { container: source, nodes: [target] } };
		case 'interacts':
			return { interacts: { actor: source, nodes: [target] } };
		case 'options':
			return { options: [] };
	}
}

/**
 * Converts a CalmArchitecture into Svelte Flow nodes and edges.
 */
export function calmToFlow(
	arch: CalmArchitecture,
	positionMap?: Map<string, { x: number; y: number; width?: number; height?: number }>,
	edgeRoutes?: EdgeRouteMap
): { nodes: Node[]; edges: Edge[] } {
	// Build containment map from CALM relationships.
	//   composed-of: container is parent of each child
	//   deployed-in: container is parent of each child
	const childToParent = new Map<string, string>();
	const parentChildren = new Map<string, Set<string>>();

	for (const rel of arch.relationships) {
		const v = variantOf(rel['relationship-type']);
		if (!v || !CONTAINMENT_VARIANTS.has(v)) continue;

		for (const pair of expandEdgePairs(rel)) {
			const parentId = pair.source; // container
			const childId = pair.target;  // each child
			childToParent.set(childId, parentId);
			if (!parentChildren.has(parentId)) parentChildren.set(parentId, new Set());
			parentChildren.get(parentId)!.add(childId);
		}
	}

	function getDepth(nodeId: string): number {
		let depth = 0;
		let current = nodeId;
		while (childToParent.has(current)) {
			depth++;
			current = childToParent.get(current)!;
		}
		return depth;
	}

	const parentIds = new Set(parentChildren.keys());

	const nodes: Node[] = arch.nodes.map((cn: CalmNode, idx: number) => {
		const isParent = parentIds.has(cn['unique-id']);
		const parentId = childToParent.get(cn['unique-id']);
		const depth = getDepth(cn['unique-id']);

		const posEntry = positionMap?.get(cn['unique-id']);
		const position = posEntry ? { x: posEntry.x, y: posEntry.y } : { x: 100 + idx * 160, y: 100 };

		const type = isParent ? 'container' : resolveNodeType(cn['node-type']);

		// For non-container nodes with ELK positions, shift x to the ELK cell
		// center (x + NODE_WIDTH/2 = x + 40) and use origin [0.5, 0] so Svelte
		// Flow interprets x as the node's horizontal center. This ensures all
		// nodes in the same ELK column are perfectly center-aligned.
		const useCenter = type !== 'container' && posEntry;
		if (useCenter) position.x += 40;

		const node: Node = {
			id: cn['unique-id'],
			type,
			position,
			...(useCenter && { origin: [0.5, 0] as [number, number] }),
			data: {
				label: cn.name,
				calmId: cn['unique-id'],
				calmType: cn['node-type'],
				description: cn.description ?? '',
				interfaces: cn.interfaces ?? [],
				customMetadata: cn.customMetadata ?? {},
				controls: cn.controls,
				'data-classification': cn['data-classification'],
				metadata: cn.metadata,
				details: cn.details
			}
		};

		if (parentId) {
			node.parentId = parentId;
			node.extent = 'parent';
			node.zIndex = depth;
		}

		if (type === 'container') {
			node.width = posEntry?.width ?? 300;
			node.height = posEntry?.height ?? 200;
		}
		return node;
	});

	// Svelte Flow requires parents before children.
	nodes.sort((a, b) => getDepth(a.id) - getDepth(b.id));

	// Node bounding boxes, for keeping edge labels off of nodes below.
	const nodeRects: Rect[] = positionMap
		? arch.nodes
				.map((cn) => absoluteRect(cn['unique-id'], positionMap, childToParent, parentIds))
				.filter((r): r is Rect => r !== undefined)
		: [];
	// Accumulates as labels are placed below, so later edges avoid earlier labels too.
	const placedLabelRects: Rect[] = [];

	// Expand each CALM relationship into one or more Svelte Flow edges.
	// We tag each edge with its source CalmRelationship's unique-id and variant
	// in `data.calm` so flowToCalm can reconstruct the nested form losslessly
	// for the common 1:1 case and as separate single-child rels for the
	// multi-child case (documented trade-off).
	const edges: Edge[] = [];
	for (const cr of arch.relationships) {
		const pairs = expandEdgePairs(cr);
		if (pairs.length === 0) continue;
		// Skip containment edges — spatial nesting already communicates containment
		if (CONTAINMENT_VARIANTS.has(pairs[0].variant)) continue;
		const multi = pairs.length > 1;
		pairs.forEach((pair, i) => {
			const edgeId = multi ? `${cr['unique-id']}#${i}` : cr['unique-id'];
			const route = edgeRoutes?.get(edgeId);
			const label = route ? placeLabel(route.points, nodeRects, placedLabelRects) : undefined;

			// Select nearest handles based on relative node positions
			const srcCenter = positionMap
				? absoluteCenter(pair.source, positionMap, childToParent, parentIds)
				: undefined;
			const tgtCenter = positionMap
				? absoluteCenter(pair.target, positionMap, childToParent, parentIds)
				: undefined;
			const handles = srcCenter && tgtCenter
				? bestHandlePair(srcCenter, tgtCenter)
				: undefined;

			edges.push({
				id: edgeId,
				source: pair.source,
				target: pair.target,
				...(handles && {
					sourceHandle: handles.sourceHandle,
					targetHandle: handles.targetHandle,
				}),
				type: pair.variant,
				data: {
					calmRelId: cr['unique-id'],
					calmVariant: pair.variant,
					protocol: cr.protocol,
					description: cr.description,
					controls: cr.controls,
					metadata: cr.metadata,
					...(route && {
						elkPath: svgPathFromPoints(route.points),
						elkLabelX: label!.x,
						elkLabelY: label!.y
					})
				}
			});
		});
	}

	return { nodes, edges };
}

/**
 * Converts Svelte Flow nodes and edges back to a CalmArchitecture.
 */
export function flowToCalm(nodes: Node[], edges: Edge[]): CalmArchitecture {
	// Build a lookup from Svelte Flow node ID to CALM unique-id (calmId).
	const flowIdToCalmId = new Map<string, string>();
	for (const n of nodes) {
		const calmId = (n.data as { calmId?: string })?.calmId;
		if (calmId) flowIdToCalmId.set(n.id, calmId);
	}

	const calmNodes: CalmNode[] = nodes.map((n: Node) => {
		const d = n.data as {
			calmId: string;
			calmType: string;
			label: string;
			description?: string;
			interfaces?: CalmInterface[];
			customMetadata?: Record<string, string>;
			controls?: CalmControls;
			'data-classification'?: string;
			metadata?: Record<string, unknown>;
			details?: CalmNodeDetails;
		};

		const node: CalmNode = {
			'unique-id': d.calmId,
			'node-type': d.calmType,
			name: d.label
		};

		if (d.description) node.description = d.description;
		if (d.interfaces && d.interfaces.length > 0) node.interfaces = d.interfaces;
		if (d.customMetadata && Object.keys(d.customMetadata).length > 0) {
			node.customMetadata = d.customMetadata;
		}
		if (d.controls && Object.keys(d.controls).length > 0) node.controls = d.controls;
		if (d['data-classification']) node['data-classification'] = d['data-classification'];
		if (d.metadata && Object.keys(d.metadata).length > 0) node.metadata = d.metadata;
		if (d.details && Object.keys(d.details).length > 0) node.details = d.details;

		return node;
	});

	const calmRelationships: CalmRelationship[] = edges.map((e: Edge) => {
		const edgeData = (e.data ?? {}) as {
			calmRelId?: string;
			calmVariant?: CalmRelationshipVariant;
			protocol?: string;
			description?: string;
			controls?: CalmControls;
			metadata?: Record<string, unknown>;
		};

		const variant =
			edgeData.calmVariant ??
			((e.type as CalmRelationshipVariant | undefined) ?? 'connects');
		const sourceId = flowIdToCalmId.get(e.source) ?? e.source;
		const targetId = flowIdToCalmId.get(e.target) ?? e.target;

		const rel: CalmRelationship = {
			'unique-id': e.id,
			'relationship-type': buildRelationshipType(variant, sourceId, targetId)
		};

		if (edgeData.protocol) rel.protocol = edgeData.protocol;
		if (edgeData.description) rel.description = edgeData.description;
		if (edgeData.controls && Object.keys(edgeData.controls).length > 0) {
			rel.controls = edgeData.controls;
		}
		if (edgeData.metadata && Object.keys(edgeData.metadata).length > 0) {
			rel.metadata = edgeData.metadata;
		}

		return rel;
	});

	return { nodes: calmNodes, relationships: calmRelationships };
}
