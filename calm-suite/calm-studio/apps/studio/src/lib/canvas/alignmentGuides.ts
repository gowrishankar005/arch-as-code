// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * alignmentGuides.ts — Pure geometry for draw.io-style "snap line" hints.
 *
 * Detects when a dragged node's edges/center line up with a sibling node's
 * edges/center (within a pixel threshold) and returns the guide lines to
 * render. This only produces visual hints — it does not snap/move the
 * dragged node itself (grid snap already covers hard snapping).
 *
 * Scoped to nodes that share the same parent (or are both top-level), since
 * comparing positions across different containment coordinate frames would
 * require walking ancestor offsets — out of scope for a visual-only aid.
 *
 * IMPORTANT: This file must NOT import from .svelte.ts files (not testable
 * in vitest without additional Svelte transform setup).
 */

export type AlignmentGuide = { axis: 'x' | 'y'; pos: number };

export interface GuideNode {
	id: string;
	parentId?: string;
	position: { x: number; y: number };
	width?: number;
	height?: number;
	measured?: { width?: number; height?: number };
}

const DEFAULT_WIDTH = 180;
const DEFAULT_HEIGHT = 70;

function nodeWidth(n: GuideNode): number {
	return n.measured?.width ?? n.width ?? DEFAULT_WIDTH;
}

function nodeHeight(n: GuideNode): number {
	return n.measured?.height ?? n.height ?? DEFAULT_HEIGHT;
}

/**
 * Computes alignment guides for a node being dragged, comparing it against
 * every sibling (same parentId) currently in `nodes`.
 *
 * Checks four alignments per axis: left/left, center/center, right/right for
 * x; top/top, center/center, bottom/bottom for y. Returns one guide per
 * matching (axis, position) pair, deduplicated.
 *
 * @param dragNode - The node currently being dragged (its live position).
 * @param nodes - All nodes on the canvas.
 * @param threshold - Max pixel distance to consider a match (default 8).
 */
export function computeAlignmentGuides(
	dragNode: GuideNode,
	nodes: GuideNode[],
	threshold = 8
): AlignmentGuide[] {
	const dragW = nodeWidth(dragNode);
	const dragH = nodeHeight(dragNode);
	const dragLeft = dragNode.position.x;
	const dragRight = dragNode.position.x + dragW;
	const dragCenterX = dragNode.position.x + dragW / 2;
	const dragTop = dragNode.position.y;
	const dragBottom = dragNode.position.y + dragH;
	const dragCenterY = dragNode.position.y + dragH / 2;

	const seen = new Set<string>();
	const guides: AlignmentGuide[] = [];

	function addGuide(axis: 'x' | 'y', pos: number) {
		const key = `${axis}:${pos}`;
		if (seen.has(key)) return;
		seen.add(key);
		guides.push({ axis, pos });
	}

	for (const other of nodes) {
		if (other.id === dragNode.id) continue;
		if (other.parentId !== dragNode.parentId) continue;

		const otherW = nodeWidth(other);
		const otherH = nodeHeight(other);
		const otherLeft = other.position.x;
		const otherRight = other.position.x + otherW;
		const otherCenterX = other.position.x + otherW / 2;
		const otherTop = other.position.y;
		const otherBottom = other.position.y + otherH;
		const otherCenterY = other.position.y + otherH / 2;

		if (Math.abs(dragLeft - otherLeft) < threshold) addGuide('x', otherLeft);
		if (Math.abs(dragRight - otherRight) < threshold) addGuide('x', otherRight);
		if (Math.abs(dragCenterX - otherCenterX) < threshold) addGuide('x', otherCenterX);

		if (Math.abs(dragTop - otherTop) < threshold) addGuide('y', otherTop);
		if (Math.abs(dragBottom - otherBottom) < threshold) addGuide('y', otherBottom);
		if (Math.abs(dragCenterY - otherCenterY) < threshold) addGuide('y', otherCenterY);
	}

	return guides;
}
