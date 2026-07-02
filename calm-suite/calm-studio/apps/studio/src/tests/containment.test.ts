// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest';
import type { Node } from '@xyflow/svelte';
import {
	makeContainment,
	removeContainment,
	autoResizeContainer,
	autoResizeAncestors,
	isContainmentType,
} from '$lib/canvas/containment';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeNode(
	id: string,
	type = 'service',
	extra: Partial<Node> = {}
): Node {
	return {
		id,
		type,
		position: { x: 0, y: 0 },
		data: { label: id },
		...extra,
	} as Node;
}

// ─── makeContainment ─────────────────────────────────────────────────────────

describe('makeContainment', () => {
	test('sets parentId on child node', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service');
		const nodes = [parent, child];

		const result = makeContainment('parent-1', 'child-1', nodes);

		const updatedChild = result.find((n) => n.id === 'child-1')!;
		expect(updatedChild.parentId).toBe('parent-1');
	});

	test('sets extent:"parent" on child node', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service');

		const result = makeContainment('parent-1', 'child-1', [parent, child]);

		const updatedChild = result.find((n) => n.id === 'child-1')!;
		expect(updatedChild.extent).toBe('parent');
	});

	test('converts parent to container type if not already a container', () => {
		const parent = makeNode('parent-1', 'system');
		const child = makeNode('child-1', 'service');

		const result = makeContainment('parent-1', 'child-1', [parent, child]);

		const updatedParent = result.find((n) => n.id === 'parent-1')!;
		expect(updatedParent.type).toBe('container');
	});

	test('leaves parent type unchanged when already a container', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service');

		const result = makeContainment('parent-1', 'child-1', [parent, child]);

		const updatedParent = result.find((n) => n.id === 'parent-1')!;
		expect(updatedParent.type).toBe('container');
	});

	test('sets zIndex on child for click-through in nested containers', () => {
		const vpc = makeNode('vpc', 'container');
		const subnet = makeNode('subnet', 'service');

		const result = makeContainment('vpc', 'subnet', [vpc, subnet]);

		const child = result.find((n) => n.id === 'subnet')!;
		expect(child.zIndex).toBe(1);
	});

	test('sets higher zIndex for deeply nested children', () => {
		const vpc = makeNode('vpc', 'container');
		const subnet = makeNode('subnet', 'container', { parentId: 'vpc', extent: 'parent' as const });
		const ec2 = makeNode('ec2', 'extension');

		const result = makeContainment('subnet', 'ec2', [vpc, subnet, ec2]);

		const child = result.find((n) => n.id === 'ec2')!;
		expect(child.zIndex).toBe(2);
	});

	test('does not mutate the original nodes array', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service');
		const nodes = [parent, child];
		const original = [...nodes];

		makeContainment('parent-1', 'child-1', nodes);

		// Array reference and contents should be unchanged
		expect(nodes).toHaveLength(original.length);
		expect(nodes[0]).toBe(parent);
		expect(nodes[1]).toBe(child);
	});
});

// ─── removeContainment ───────────────────────────────────────────────────────

describe('removeContainment', () => {
	test('clears parentId from child node', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service', { parentId: 'parent-1', extent: 'parent' });
		const nodes = [parent, child];

		const result = removeContainment('child-1', nodes);

		const updatedChild = result.find((n) => n.id === 'child-1')!;
		expect(updatedChild.parentId).toBeUndefined();
	});

	test('clears extent from child node', () => {
		const parent = makeNode('parent-1', 'container');
		const child = makeNode('child-1', 'service', { parentId: 'parent-1', extent: 'parent' });

		const result = removeContainment('child-1', [parent, child]);

		const updatedChild = result.find((n) => n.id === 'child-1')!;
		expect(updatedChild.extent).toBeUndefined();
	});

	test('does not affect other nodes', () => {
		const parent = makeNode('parent-1', 'container');
		const child1 = makeNode('child-1', 'service', { parentId: 'parent-1', extent: 'parent' });
		const child2 = makeNode('child-2', 'service', { parentId: 'parent-1', extent: 'parent' });

		const result = removeContainment('child-1', [parent, child1, child2]);

		const updatedChild2 = result.find((n) => n.id === 'child-2')!;
		expect(updatedChild2.parentId).toBe('parent-1');
		expect(updatedChild2.extent).toBe('parent');
	});
});

// ─── autoResizeContainer ──────────────────────────────────────────────────────

describe('autoResizeContainer', () => {
	test('is a no-op when the container has no children', () => {
		const container = makeNode('vpc', 'container', { width: 300, height: 200 });
		const result = autoResizeContainer('vpc', [container]);
		const updated = result.find((n) => n.id === 'vpc')!;
		expect(updated.width).toBe(300);
		expect(updated.height).toBe(200);
	});

	test('grows the container to fit a child that exceeds current bounds', () => {
		const container = makeNode('vpc', 'container', { width: 100, height: 100 });
		const child = makeNode('subnet', 'service', {
			parentId: 'vpc',
			position: { x: 50, y: 50 },
			width: 180,
			height: 70,
		});

		const result = autoResizeContainer('vpc', [container, child]);
		const updated = result.find((n) => n.id === 'vpc')!;

		// requiredWidth = 32 (left) + (230 - 50) + 32 (right) = 244
		// requiredHeight = 48 (top) + (120 - 50) + 32 (bottom) = 150
		expect(updated.width).toBe(244);
		expect(updated.height).toBe(150);
	});

	test('never shrinks a container below its current size', () => {
		const container = makeNode('vpc', 'container', { width: 1000, height: 1000 });
		const child = makeNode('subnet', 'service', {
			parentId: 'vpc',
			position: { x: 0, y: 0 },
			width: 180,
			height: 70,
		});

		const result = autoResizeContainer('vpc', [container, child]);
		const updated = result.find((n) => n.id === 'vpc')!;

		expect(updated.width).toBe(1000);
		expect(updated.height).toBe(1000);
	});

	test('fits the bounding box of multiple children', () => {
		const container = makeNode('vpc', 'container', { width: 50, height: 50 });
		const childA = makeNode('a', 'service', {
			parentId: 'vpc',
			position: { x: 0, y: 0 },
			width: 100,
			height: 50,
		});
		const childB = makeNode('b', 'service', {
			parentId: 'vpc',
			position: { x: 200, y: 0 },
			width: 100,
			height: 50,
		});

		const result = autoResizeContainer('vpc', [container, childA, childB]);
		const updated = result.find((n) => n.id === 'vpc')!;

		// bbox: minX=0, maxX=300 (childB.x + width), width = 32+300+32 = 364
		expect(updated.width).toBe(364);
	});

	test('does not mutate the original nodes array', () => {
		const container = makeNode('vpc', 'container', { width: 50, height: 50 });
		const child = makeNode('subnet', 'service', {
			parentId: 'vpc',
			position: { x: 50, y: 50 },
			width: 180,
			height: 70,
		});
		const nodes = [container, child];

		autoResizeContainer('vpc', nodes);

		expect(nodes[0]).toBe(container);
		expect(container.width).toBe(50);
	});
});

// ─── autoResizeAncestors ──────────────────────────────────────────────────────

describe('autoResizeAncestors', () => {
	test('resizes the immediate parent of the given node', () => {
		const vpc = makeNode('vpc', 'container', { width: 50, height: 50 });
		const subnet = makeNode('subnet', 'service', {
			parentId: 'vpc',
			position: { x: 100, y: 100 },
			width: 180,
			height: 70,
		});

		const result = autoResizeAncestors('subnet', [vpc, subnet]);
		const updatedVpc = result.find((n) => n.id === 'vpc')!;

		expect(updatedVpc.width).toBeGreaterThan(50);
	});

	test('propagates resizing up through multiple nesting levels', () => {
		const vpc = makeNode('vpc', 'container', { width: 10, height: 10 });
		const subnet = makeNode('subnet', 'container', {
			parentId: 'vpc',
			position: { x: 0, y: 0 },
			width: 10,
			height: 10,
		});
		const instance = makeNode('instance', 'service', {
			parentId: 'subnet',
			position: { x: 300, y: 300 },
			width: 180,
			height: 70,
		});

		const result = autoResizeAncestors('instance', [vpc, subnet, instance]);

		const updatedSubnet = result.find((n) => n.id === 'subnet')!;
		expect(updatedSubnet.width).toBeGreaterThan(10);

		// vpc must grow to fit the now-larger subnet
		const updatedVpc = result.find((n) => n.id === 'vpc')!;
		expect(updatedVpc.width).toBeGreaterThan(10);
	});

	test('is a no-op for a top-level node with no parent', () => {
		const node = makeNode('standalone', 'service');
		const result = autoResizeAncestors('standalone', [node]);
		expect(result).toEqual([node]);
	});

	test('does not mutate the original nodes array', () => {
		const vpc = makeNode('vpc', 'container', { width: 10, height: 10 });
		const subnet = makeNode('subnet', 'service', {
			parentId: 'vpc',
			position: { x: 100, y: 100 },
			width: 180,
			height: 70,
		});
		const nodes = [vpc, subnet];

		autoResizeAncestors('subnet', nodes);

		expect(nodes[0]).toBe(vpc);
		expect(vpc.width).toBe(10);
	});
});

// ─── isContainmentType ───────────────────────────────────────────────────────

describe('isContainmentType', () => {
	test('returns true for deployed-in', () => {
		expect(isContainmentType('deployed-in')).toBe(true);
	});

	test('returns true for composed-of', () => {
		expect(isContainmentType('composed-of')).toBe(true);
	});

	test('returns false for connects', () => {
		expect(isContainmentType('connects')).toBe(false);
	});

	test('returns false for interacts', () => {
		expect(isContainmentType('interacts')).toBe(false);
	});

	test('returns false for options', () => {
		expect(isContainmentType('options')).toBe(false);
	});

	test('returns false for unknown strings', () => {
		expect(isContainmentType('unknown-type')).toBe(false);
	});
});
