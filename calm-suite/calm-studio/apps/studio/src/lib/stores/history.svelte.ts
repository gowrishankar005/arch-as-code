// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * history.svelte.ts — Undo/redo snapshot store for CalmCanvas.
 *
 * Two-stack design (undoStack + redoStack), not a single array + pointer.
 *
 * pushSnapshot() is always called BEFORE a mutation with the state about to
 * be left behind — it never sees the state a mutation produces. A
 * single-array-with-pointer design (the previous implementation) has no
 * entry anywhere for "the current, most recent state" — only for the
 * states before each change — so redo() had nothing correct to restore
 * once it moved past the latest pre-mutation entry. undo()/redo() take the
 * live current nodes/edges as parameters specifically to solve this: each
 * one pushes the state it's leaving onto the *other* stack before
 * returning, so the two stacks always have exactly what's needed to walk
 * back and forth across arbitrarily many steps, including undo-after-redo.
 */

import type { Node, Edge } from '@xyflow/svelte';

export interface Snapshot {
	nodes: Node[];
	edges: Edge[];
}

function clone(nodes: Node[], edges: Edge[]): Snapshot {
	return {
		nodes: JSON.parse(JSON.stringify(nodes)),
		edges: JSON.parse(JSON.stringify(edges)),
	};
}

// Module-level Svelte 5 rune state
let undoStack = $state<Snapshot[]>([]);
let redoStack = $state<Snapshot[]>([]);

/**
 * Push a deep-cloned snapshot of the current nodes/edges onto the undo
 * stack. Call this BEFORE applying any mutation. Starting a new action
 * invalidates any pending redo history, matching standard undo/redo UX
 * (e.g. a text editor: typing after an undo drops the redone-away future).
 */
export function pushSnapshot(nodes: Node[], edges: Edge[]): void {
	undoStack = [...undoStack, clone(nodes, edges)];
	redoStack = [];
}

/**
 * Move back one step in history. `currentNodes`/`currentEdges` are the live
 * state being left — pushed onto the redo stack so a subsequent redo() can
 * restore it. Returns the previous snapshot, or null if there's nothing to
 * undo to.
 */
export function undo(currentNodes: Node[], currentEdges: Edge[]): Snapshot | null {
	if (undoStack.length === 0) {
		return null;
	}
	const previous = undoStack[undoStack.length - 1];
	undoStack = undoStack.slice(0, -1);
	redoStack = [...redoStack, clone(currentNodes, currentEdges)];
	return previous;
}

/**
 * Move forward one step in history. `currentNodes`/`currentEdges` are the
 * live state being left — pushed onto the undo stack so a subsequent undo()
 * can return to it. Returns the next snapshot, or null if there's nothing
 * to redo to.
 */
export function redo(currentNodes: Node[], currentEdges: Edge[]): Snapshot | null {
	if (redoStack.length === 0) {
		return null;
	}
	const next = redoStack[redoStack.length - 1];
	redoStack = redoStack.slice(0, -1);
	undoStack = [...undoStack, clone(currentNodes, currentEdges)];
	return next;
}

/** True when there is a previous snapshot to undo to. */
export function canUndo(): boolean {
	return undoStack.length > 0;
}

/** True when there is a future snapshot to redo to. */
export function canRedo(): boolean {
	return redoStack.length > 0;
}

/**
 * Reset history to initial empty state.
 * Used in tests to ensure clean state between test runs.
 */
export function resetHistory(): void {
	undoStack = [];
	redoStack = [];
}
