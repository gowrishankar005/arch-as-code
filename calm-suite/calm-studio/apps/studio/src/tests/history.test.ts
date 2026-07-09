// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/svelte';
import { pushSnapshot, undo, redo, canUndo, canRedo, resetHistory } from '$lib/stores/history.svelte';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeNode(id: string): Node {
	return {
		id,
		type: 'service',
		position: { x: 0, y: 0 },
		data: { label: id, calmId: `calm-${id}`, calmType: 'service' },
	};
}

const noEdges: Edge[] = [];

// Real call sites always call pushSnapshot(current) BEFORE mutating, then
// mutate afterward — pushSnapshot never sees the state a mutation produces.
// These fixtures model that: `before` is what gets pushed, `after` is what
// the live nodes/edges become post-mutation (and what undo()/redo() must be
// given as their "current" argument).

// ─── History tests ────────────────────────────────────────────────────────────

describe('history - undo/redo', () => {
	beforeEach(() => {
		resetHistory();
	});

	test('pushSnapshot adds snapshot to history stack — canUndo becomes true', () => {
		pushSnapshot([makeNode('n1')], noEdges); // before mutating to n1+n2
		expect(canUndo()).toBe(true);
		expect(canRedo()).toBe(false);
	});

	test('undo returns the pre-mutation snapshot', () => {
		const before = [makeNode('n1')];
		const after = [makeNode('n1'), makeNode('n2')];
		pushSnapshot(before, noEdges);
		const snapshot = undo(after, noEdges);
		expect(snapshot).not.toBeNull();
		expect(snapshot!.nodes).toHaveLength(1);
	});

	test('undo with nothing pushed returns null', () => {
		const snapshot = undo([makeNode('n1')], noEdges);
		expect(snapshot).toBeNull();
	});

	test('redo restores the state that was live when undo was called', () => {
		const before = [makeNode('n1')];
		const after = [makeNode('n1'), makeNode('n2')];
		pushSnapshot(before, noEdges);
		undo(after, noEdges); // now displaying `before`
		const redoSnapshot = redo(before, noEdges);
		expect(redoSnapshot).not.toBeNull();
		expect(redoSnapshot!.nodes).toHaveLength(2);
	});

	test('redo with nothing to redo returns null', () => {
		const snapshot = redo([makeNode('n1')], noEdges);
		expect(snapshot).toBeNull();
	});

	test('multi-step undo walks back through several checkpoints', () => {
		const state0 = [makeNode('n0')]; // before 1st mutation
		const state1 = [makeNode('n1')]; // before 2nd mutation
		const state2 = [makeNode('n2')]; // live after 2nd mutation
		pushSnapshot(state0, noEdges);
		pushSnapshot(state1, noEdges);

		const firstUndo = undo(state2, noEdges);
		expect(firstUndo!.nodes[0].id).toBe('n1');

		const secondUndo = undo(state1, noEdges);
		expect(secondUndo!.nodes[0].id).toBe('n0');

		expect(canUndo()).toBe(false);
	});

	test('undo then redo then undo again returns to the same state each time', () => {
		const before = [makeNode('n1')];
		const after = [makeNode('n1'), makeNode('n2')];
		pushSnapshot(before, noEdges);

		const undone = undo(after, noEdges);
		expect(undone!.nodes).toHaveLength(1);

		const redone = redo(before, noEdges);
		expect(redone!.nodes).toHaveLength(2);

		const undoneAgain = undo(after, noEdges);
		expect(undoneAgain!.nodes).toHaveLength(1);
	});

	test('pushSnapshot after undo drops future (redo) history', () => {
		const before = [makeNode('n1')];
		const after = [makeNode('n1'), makeNode('n2')];
		const branch = [makeNode('n3')];
		pushSnapshot(before, noEdges);
		undo(after, noEdges); // go back to `before`, `after` now redoable
		expect(canRedo()).toBe(true);

		pushSnapshot(before, noEdges); // branch off before a new mutation
		expect(canRedo()).toBe(false);
		const snapshot = redo(branch, noEdges);
		expect(snapshot).toBeNull();
	});
});

// ─── canUndo/canRedo state tests ──────────────────────────────────────────────

describe('history - canUndo/canRedo', () => {
	beforeEach(() => {
		resetHistory();
	});

	test('canUndo is false with no snapshots', () => {
		expect(canUndo()).toBe(false);
	});

	test('canRedo is false with no snapshots', () => {
		expect(canRedo()).toBe(false);
	});

	test('canUndo is true once a snapshot has been pushed', () => {
		pushSnapshot([makeNode('n1')], noEdges);
		expect(canUndo()).toBe(true);
	});

	test('canRedo becomes true after undo', () => {
		pushSnapshot([makeNode('n1')], noEdges);
		undo([makeNode('n2')], noEdges);
		expect(canRedo()).toBe(true);
	});

	test('canRedo becomes false again after a subsequent redo', () => {
		const before = [makeNode('n1')];
		const after = [makeNode('n2')];
		pushSnapshot(before, noEdges);
		undo(after, noEdges);
		redo(before, noEdges);
		expect(canRedo()).toBe(false);
		expect(canUndo()).toBe(true);
	});

	test('snapshots are deep-cloned — mutations to the original do not affect the stored snapshot', () => {
		const before = [makeNode('n1')];
		pushSnapshot(before, noEdges);
		// Mutate original node after pushing
		before[0].data.label = 'mutated';
		const snapshot = undo([makeNode('n2')], noEdges);
		expect(snapshot!.nodes[0].data.label).toBe('n1');
	});
});
