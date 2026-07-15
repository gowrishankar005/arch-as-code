// SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file
//
// SPDX-License-Identifier: Apache-2.0

/**
 * containment.ts — Pure functions for managing CALM containment relationships.
 *
 * In CALM, 'deployed-in' and 'composed-of' edges represent containment —
 * a child node that lives inside a parent boundary. Svelte Flow models this
 * via parentId on the child node plus a 'container' type on the parent.
 * Deliberately no extent:'parent' — that would hard-clamp dragging to stay
 * inside the parent's bounds, which blocks the "drag a node back out of its
 * container" gesture CalmCanvas.svelte's handleNodeDragStop relies on.
 *
 * All functions are pure (no mutations, no side-effects) and return new arrays.
 */

import type { Node } from '@xyflow/svelte';

/** The set of CALM edge types that imply containment. */
const CONTAINMENT_EDGE_TYPES = new Set(['deployed-in', 'composed-of']);

/**
 * Returns true when the given edge type implies containment.
 * Used to decide whether to call makeContainment() after edge creation.
 *
 * @param edgeType - A CALM relationship type string.
 */
export function isContainmentType(edgeType: string): boolean {
	return CONTAINMENT_EDGE_TYPES.has(edgeType);
}

/**
 * Resolves a node's absolute canvas position by walking up its parentId
 * chain and summing each ancestor's position. Svelte Flow stores a nested
 * node's `position` relative to its immediate parent, not the canvas
 * origin (confirmed live: a node inside a container rendered at absolute
 * screen coordinates (589,236) had a `position` of (42,60)) — so any code
 * that adds or removes a parentId must convert through this, or the node
 * visually jumps the instant its containment changes.
 *
 * @param nodeId - ID of the node to resolve.
 * @param nodes  - Current nodes array.
 */
export function absolutePositionOf(nodeId: string, nodes: Node[]): { x: number; y: number } {
	let x = 0;
	let y = 0;
	let current = nodes.find((n) => n.id === nodeId);
	while (current) {
		x += current.position.x;
		y += current.position.y;
		current = current.parentId ? nodes.find((n) => n.id === current!.parentId) : undefined;
	}
	return { x, y };
}

/**
 * Establishes a containment relationship between parent and child nodes.
 *
 * - Sets parentId on the child node (Svelte Flow nesting)
 * - Converts the child's position to be relative to its new parent, so it
 *   stays exactly where it was dropped instead of jumping (see
 *   absolutePositionOf)
 * - Converts the parent to type:'container' if it isn't already
 *
 * Returns a new nodes array. Does not mutate the input.
 *
 * @param parentId - ID of the node that will become the container.
 * @param childId  - ID of the node to nest inside the container.
 * @param nodes    - Current nodes array.
 */
export function makeContainment(parentId: string, childId: string, nodes: Node[]): Node[] {
	// Compute the nesting depth of the parent so child gets a higher z-index.
	// This ensures clicking a deeply-nested child selects it, not the container.
	let depth = 1;
	let currentId: string | undefined = parentId;
	while (currentId) {
		const parent = nodes.find((n) => n.id === currentId);
		if (parent?.parentId) {
			depth++;
			currentId = parent.parentId;
		} else {
			break;
		}
	}

	const childAbsolute = absolutePositionOf(childId, nodes);
	const parentAbsolute = absolutePositionOf(parentId, nodes);
	const relativePosition = {
		x: childAbsolute.x - parentAbsolute.x,
		y: childAbsolute.y - parentAbsolute.y,
	};

	return nodes.map((node) => {
		if (node.id === parentId) {
			// Promote to container type if not already
			if (node.type === 'container') return node;
			return { ...node, type: 'container' };
		}
		if (node.id === childId) {
			return { ...node, parentId, position: relativePosition, zIndex: depth };
		}
		return node;
	});
}

/**
 * Removes a containment relationship from a child node.
 *
 * Clears parentId and converts the child's position back to absolute (see
 * absolutePositionOf) so it stays exactly where it was, instead of jumping
 * toward the canvas origin now that it's no longer relative to a parent.
 * Does not change the parent node's type (the parent may still contain
 * other children so it stays as 'container').
 *
 * Returns a new nodes array. Does not mutate the input.
 *
 * @param childId - ID of the node to un-nest.
 * @param nodes   - Current nodes array.
 */
export function removeContainment(childId: string, nodes: Node[]): Node[] {
	const absolute = absolutePositionOf(childId, nodes);
	return nodes.map((node) => {
		if (node.id !== childId) return node;
		// Spread into a new object, then delete the containment fields. extent
		// is never set going forward (see the file header), but stripped
		// defensively in case a node still carries one from before this fix
		// (e.g. state restored from an old autosave draft).
		const { parentId: _pid, extent: _ext, ...rest } = node;
		return { ...rest, position: absolute } as Node;
	});
}

/**
 * Padding around a container's children when auto-sizing, mirroring the ELK
 * container layout padding used by layoutCalm (elkLayout.ts).
 */
const CONTAINER_PADDING = { top: 48, left: 32, bottom: 32, right: 32 };

/** Fallback node dimensions when a node hasn't been measured yet, matching elkLayout.ts. */
const DEFAULT_CHILD_WIDTH = 180;
const DEFAULT_CHILD_HEIGHT = 70;

/**
 * Grows a container to fit its children's bounding box (+ padding), if the
 * current size is smaller than required. Never shrinks a container that's
 * already larger — the user (or ELK) may have sized it deliberately.
 * No-op if the container currently has no children.
 *
 * Returns a new nodes array. Does not mutate the input.
 *
 * @param containerId - ID of the container node to resize.
 * @param nodes        - Current nodes array.
 */
export function autoResizeContainer(containerId: string, nodes: Node[]): Node[] {
	const children = nodes.filter((n) => n.parentId === containerId);
	if (children.length === 0) return nodes;

	const minX = Math.min(...children.map((c) => c.position.x));
	const maxX = Math.max(
		...children.map((c) => c.position.x + (c.measured?.width ?? c.width ?? DEFAULT_CHILD_WIDTH))
	);
	const minY = Math.min(...children.map((c) => c.position.y));
	const maxY = Math.max(
		...children.map((c) => c.position.y + (c.measured?.height ?? c.height ?? DEFAULT_CHILD_HEIGHT))
	);

	const requiredWidth = CONTAINER_PADDING.left + (maxX - minX) + CONTAINER_PADDING.right;
	const requiredHeight = CONTAINER_PADDING.top + (maxY - minY) + CONTAINER_PADDING.bottom;

	return nodes.map((node) => {
		if (node.id !== containerId) return node;
		return {
			...node,
			width: Math.max(node.width ?? 0, requiredWidth),
			height: Math.max(node.height ?? 0, requiredHeight),
		};
	});
}

/**
 * Walks up the containment chain from a node and auto-resizes every
 * ancestor container in turn, so a size increase from a newly added or
 * moved child propagates up through the whole nesting chain (e.g. a subnet
 * growing to fit a new instance also grows the VPC around the subnet).
 *
 * Returns a new nodes array. Does not mutate the input.
 *
 * @param nodeId - ID of the node whose ancestors should be resized.
 * @param nodes  - Current nodes array.
 */
export function autoResizeAncestors(nodeId: string, nodes: Node[]): Node[] {
	let result = nodes;
	let current = result.find((n) => n.id === nodeId);
	while (current?.parentId) {
		const parentId = current.parentId;
		result = autoResizeContainer(parentId, result);
		current = result.find((n) => n.id === parentId);
	}
	return result;
}
