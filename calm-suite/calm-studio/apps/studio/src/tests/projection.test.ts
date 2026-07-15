// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeAll } from 'vitest';
import type { CalmArchitecture } from '@calmstudio/calm-core';
import { calmToFlow, flowToCalm, buildLayoutDecorator, extractLayoutPositions, toRawPosition, LAYOUT_DECORATOR_ID } from '$lib/stores/projection';
import { initAllPacks } from '@calmstudio/extensions';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const actorArch: CalmArchitecture = {
	nodes: [
		{
			'unique-id': 'actor-1',
			'node-type': 'actor',
			name: 'User',
			description: 'The end user',
			interfaces: [{ 'unique-id': 'iface-1', type: 'url', value: 'https://example.com' }],
		},
	],
	relationships: [],
};

const connectsArch: CalmArchitecture = {
	nodes: [
		{ 'unique-id': 'svc-1', 'node-type': 'service', name: 'API' },
		{ 'unique-id': 'db-1', 'node-type': 'database', name: 'DB' },
	],
	relationships: [
		{
			'unique-id': 'rel-1',
			'relationship-type': { connects: { source: { node: 'svc-1' }, destination: { node: 'db-1' } } },
			protocol: 'HTTPS',
			description: 'API to DB',
		},
	],
};

// ─── calmToFlow tests ─────────────────────────────────────────────────────────

describe('calmToFlow', () => {
	test('converts actor node to Svelte Flow Node with correct shape', () => {
		const { nodes, edges } = calmToFlow(actorArch);
		expect(nodes).toHaveLength(1);
		expect(edges).toHaveLength(0);

		const node = nodes[0];
		expect(node.id).toBe('actor-1');
		expect(node.type).toBe('actor');
		expect(node.data.label).toBe('User');
		expect(node.data.calmId).toBe('actor-1');
		expect(node.data.calmType).toBe('actor');
		expect(node.data.description).toBe('The end user');
		expect(node.data.interfaces).toHaveLength(1);
		expect(node.data.interfaces[0]['unique-id']).toBe('iface-1');
		expect(node.data.customMetadata).toEqual({});
	});

	test('assigns default staggered positions for nodes without positionMap', () => {
		const { nodes } = calmToFlow(connectsArch);
		expect(nodes[0].position).toEqual({ x: 100, y: 100 });
		expect(nodes[1].position).toEqual({ x: 260, y: 100 });
	});

	test('converts connects relationship to Svelte Flow Edge', () => {
		const { nodes, edges } = calmToFlow(connectsArch);
		expect(nodes).toHaveLength(2);
		expect(edges).toHaveLength(1);

		const edge = edges[0];
		expect(edge.id).toBe('rel-1');
		expect(edge.source).toBe('svc-1');
		expect(edge.target).toBe('db-1');
		expect(edge.type).toBe('connects');
		expect(edge.data?.protocol).toBe('HTTPS');
		expect(edge.data?.description).toBe('API to DB');
	});

	test('uses positionMap positions for known nodes and staggered default for others', () => {
		const posMap = new Map([['svc-1', { x: 200, y: 300 }]]);
		const { nodes } = calmToFlow(connectsArch, posMap);
		const svc = nodes.find((n) => n.id === 'svc-1')!;
		const db = nodes.find((n) => n.id === 'db-1')!;
		// Non-container nodes with ELK positions get +40 offset (NODE_WIDTH/2)
		// and origin [0.5, 0] for center-alignment.
		expect(svc.position).toEqual({ x: 240, y: 300 });
		// db-1 is index 1 in the arch, not in posMap → staggered: x = 100 + 1*160 = 260
		expect(db.position).toEqual({ x: 260, y: 100 });
	});

	test('sets edge.data.elkPath and label position when an edgeRoute is provided', () => {
		const edgeRoutes = new Map([
			['rel-1', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }] }],
		]);
		const { edges } = calmToFlow(connectsArch, undefined, edgeRoutes);
		const edge = edges[0];
		expect(edge.data?.elkPath).toBe('M 0,0 L 10,0 L 10,20');
		// Label sits at the true arc-length midpoint of the route (total
		// length 30: 10 along the first segment, 20 along the second — the
		// halfway point at length 15 is a quarter of the way into the
		// second segment).
		expect(edge.data?.elkLabelX).toBe(10);
		expect(edge.data?.elkLabelY).toBe(5);
	});

	test('leaves edge.data.elkPath undefined when no matching edgeRoute exists', () => {
		const { edges } = calmToFlow(connectsArch, undefined, new Map());
		expect(edges[0].data?.elkPath).toBeUndefined();
	});

	test('nudges an edge label off the route midpoint when a node sits there', () => {
		// svc-1 at (0,0), db-1 at (300,0) (both default 80x70 leaf boxes) — the
		// route's naive midpoint (150,35) lands squarely inside a third node
		// placed right on top of it.
		const posMap = new Map([
			['svc-1', { x: 0, y: 0 }],
			['db-1', { x: 300, y: 0 }],
			['blocker-1', { x: 110, y: 0 }],
		]);
		const archWithBlocker: CalmArchitecture = {
			...connectsArch,
			nodes: [...connectsArch.nodes, { 'unique-id': 'blocker-1', 'node-type': 'service', name: 'Blocker' }],
		};
		const edgeRoutes = new Map([
			['rel-1', { points: [{ x: 40, y: 35 }, { x: 340, y: 35 }] }],
		]);
		const { edges } = calmToFlow(archWithBlocker, posMap, edgeRoutes);
		const edge = edges.find((e) => e.id === 'rel-1')!;
		// Naive midpoint would be (190, 35) — inside blocker-1's box
		// (110..190 x, 0..70 y). The placed label must land outside it.
		const insideBlocker =
			(edge.data?.elkLabelX as number) > 110 &&
			(edge.data?.elkLabelX as number) < 190 &&
			(edge.data?.elkLabelY as number) > 0 &&
			(edge.data?.elkLabelY as number) < 70;
		expect(insideBlocker).toBe(false);
	});

	test('offsets a second edge label so it does not stack on the first', () => {
		// Two parallel edges routed along nearly the same line — their naive
		// midpoints would coincide.
		const twoEdgeArch: CalmArchitecture = {
			nodes: [
				{ 'unique-id': 'a', 'node-type': 'service', name: 'A' },
				{ 'unique-id': 'b', 'node-type': 'service', name: 'B' },
				{ 'unique-id': 'c', 'node-type': 'service', name: 'C' },
				{ 'unique-id': 'd', 'node-type': 'service', name: 'D' },
			],
			relationships: [
				{
					'unique-id': 'rel-a',
					'relationship-type': { connects: { source: { node: 'a' }, destination: { node: 'b' } } },
					protocol: 'HTTP',
				},
				{
					'unique-id': 'rel-b',
					'relationship-type': { connects: { source: { node: 'c' }, destination: { node: 'd' } } },
					protocol: 'HTTPS',
				},
			],
		};
		const edgeRoutes = new Map([
			['rel-a', { points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] }],
			['rel-b', { points: [{ x: 0, y: 4 }, { x: 200, y: 4 }] }],
		]);
		const { edges } = calmToFlow(twoEdgeArch, undefined, edgeRoutes);
		const labelA = edges.find((e) => e.id === 'rel-a')!.data;
		const labelB = edges.find((e) => e.id === 'rel-b')!.data;
		// Naive midpoints (100,0) and (100,4) are 4px apart — well within a
		// label pill's footprint (~70x20). Approximate each as a pill rect
		// and confirm the placed labels no longer overlap.
		const rectAt = (x: number, y: number) => ({ x: x - 35, y: y - 10, width: 70, height: 20 });
		const a = rectAt(labelA?.elkLabelX as number, labelA?.elkLabelY as number);
		const b = rectAt(labelB?.elkLabelX as number, labelB?.elkLabelY as number);
		const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
		expect(overlap).toBe(false);
	});
});

// ─── flowToCalm tests ─────────────────────────────────────────────────────────

describe('flowToCalm', () => {
	test('converts Svelte Flow Node back to CalmNode', () => {
		const { nodes, edges } = calmToFlow(actorArch);
		const result = flowToCalm(nodes, edges);
		expect(result.nodes).toHaveLength(1);
		expect(result.relationships).toHaveLength(0);
		const cn = result.nodes[0];
		expect(cn['unique-id']).toBe('actor-1');
		expect(cn['node-type']).toBe('actor');
		expect(cn.name).toBe('User');
	});

	test('maps edge source/target back to nested relationship-type endpoints', () => {
		const { nodes, edges } = calmToFlow(connectsArch);
		const result = flowToCalm(nodes, edges);
		expect(result.relationships).toHaveLength(1);
		const rel = result.relationships[0]!;
		expect(rel['unique-id']).toBe('rel-1');
		const rt = rel['relationship-type'];
		if (!('connects' in rt)) throw new Error('expected connects variant');
		expect(rt.connects.source.node).toBe('svc-1');
		expect(rt.connects.destination.node).toBe('db-1');
		expect(rel.protocol).toBe('HTTPS');
	});

	test('round-trip preserves all CALM data (unique-ids, names, types, interfaces, descriptions)', () => {
		const { nodes, edges } = calmToFlow(actorArch);
		const result = flowToCalm(nodes, edges);
		const cn = result.nodes[0];
		expect(cn['unique-id']).toBe('actor-1');
		expect(cn['node-type']).toBe('actor');
		expect(cn.name).toBe('User');
		expect(cn.description).toBe('The end user');
		expect(cn.interfaces).toHaveLength(1);
		expect(cn.interfaces![0]['unique-id']).toBe('iface-1');
		expect(cn.interfaces![0].type).toBe('url');
		expect(cn.interfaces![0].value).toBe('https://example.com');
	});

	test('preserves customMetadata through round-trip', () => {
		const archWithMeta: CalmArchitecture = {
			nodes: [
				{
					'unique-id': 'svc-x',
					'node-type': 'service',
					name: 'MyService',
					customMetadata: { team: 'platform', env: 'prod' },
				},
			],
			relationships: [],
		};
		const { nodes, edges } = calmToFlow(archWithMeta);
		const result = flowToCalm(nodes, edges);
		expect(result.nodes[0].customMetadata).toEqual({ team: 'platform', env: 'prod' });
	});

	test('preserves details (detailed-architecture, required-pattern) through round-trip', () => {
		const archWithDetails: CalmArchitecture = {
			nodes: [
				{
					'unique-id': 'svc-x',
					'node-type': 'service',
					name: 'MyService',
					details: {
						'detailed-architecture': 'https://example.com/detailed.json',
						'required-pattern': 'https://example.com/pattern.json',
					},
				},
			],
			relationships: [],
		};
		const { nodes, edges } = calmToFlow(archWithDetails);
		expect(nodes[0].data.details).toEqual({
			'detailed-architecture': 'https://example.com/detailed.json',
			'required-pattern': 'https://example.com/pattern.json',
		});

		const result = flowToCalm(nodes, edges);
		expect(result.nodes[0].details).toEqual({
			'detailed-architecture': 'https://example.com/detailed.json',
			'required-pattern': 'https://example.com/pattern.json',
		});
	});
});

// ─── Extension pack projection tests ──────────────────────────────────────────

describe('extension pack projection', () => {
	beforeAll(() => {
		// Register all packs so resolveNodeType can route colon-prefixed types
		// to the 'extension' key and ExtensionNode can resolve pack metadata.
		initAllPacks();
	});

	test('calmToFlow produces type="extension" and data.calmType="aws:lambda" for pack node', () => {
		const arch: CalmArchitecture = {
			nodes: [{ 'unique-id': 'fn-1', 'node-type': 'aws:lambda', name: 'My Lambda' }],
			relationships: [],
		};
		const { nodes } = calmToFlow(arch);
		expect(nodes).toHaveLength(1);
		const node = nodes[0];
		expect(node.type).toBe('extension');
		expect(node.data.calmType).toBe('aws:lambda');
		expect(node.data.label).toBe('My Lambda');
	});

	test('flowToCalm preserves "aws:lambda" node-type from data.calmType', () => {
		const arch: CalmArchitecture = {
			nodes: [{ 'unique-id': 'fn-1', 'node-type': 'aws:lambda', name: 'My Lambda' }],
			relationships: [],
		};
		const { nodes, edges } = calmToFlow(arch);
		const result = flowToCalm(nodes, edges);
		expect(result.nodes[0]['node-type']).toBe('aws:lambda');
	});

	test('round-trip preserves aws:lambda as node-type string', () => {
		const arch: CalmArchitecture = {
			nodes: [{ 'unique-id': 'fn-2', 'node-type': 'aws:lambda', name: 'Lambda Fn' }],
			relationships: [],
		};
		const { nodes, edges } = calmToFlow(arch);
		const result = flowToCalm(nodes, edges);
		expect(result.nodes[0]['unique-id']).toBe('fn-2');
		expect(result.nodes[0]['node-type']).toBe('aws:lambda');
		expect(result.nodes[0].name).toBe('Lambda Fn');
	});

	test('mixed diagram: core "service" and pack "k8s:pod" both resolve correctly', () => {
		const arch: CalmArchitecture = {
			nodes: [
				{ 'unique-id': 'svc-1', 'node-type': 'service', name: 'API Service' },
				{ 'unique-id': 'pod-1', 'node-type': 'k8s:pod', name: 'API Pod' },
			],
			relationships: [],
		};
		const { nodes } = calmToFlow(arch);
		expect(nodes).toHaveLength(2);

		const svcNode = nodes.find((n) => n.id === 'svc-1')!;
		const podNode = nodes.find((n) => n.id === 'pod-1')!;

		// Core type resolves to its canonical key
		expect(svcNode.type).toBe('service');
		expect(svcNode.data.calmType).toBe('service');

		// Pack type resolves to 'extension' with full calmType preserved
		expect(podNode.type).toBe('extension');
		expect(podNode.data.calmType).toBe('k8s:pod');
	});
});

// ─── Layout persistence ─────────────────────────────────────────────────────

describe('buildLayoutDecorator / extractLayoutPositions', () => {
	test('buildLayoutDecorator captures each node\'s position keyed by calmId, undoing the center-alignment shift', () => {
		const { nodes } = calmToFlow(connectsArch, new Map([['svc-1', { x: 240, y: 300 }]]));
		const decorator = buildLayoutDecorator(nodes);

		expect(decorator['unique-id']).toBe(LAYOUT_DECORATOR_ID);
		expect(decorator.type).toBe(LAYOUT_DECORATOR_ID);
		expect(decorator['applies-to']).toEqual(expect.arrayContaining(['svc-1', 'db-1']));
		const positions = decorator.data.positions as Record<string, { x: number; y: number }>;
		// calmToFlow rendered svc-1 at x=280 (240 + 40 center-alignment shift,
		// see toRawPosition) — the decorator must store the raw x=240 it was
		// given, not the shifted rendered value, or every future calmToFlow
		// call on this data would reapply +40 (see the drift regression test
		// below for why this specifically matters).
		expect(positions['svc-1']).toEqual({ x: 240, y: 300 });
	});

	test('extractLayoutPositions returns null when no layout decorator is present', () => {
		expect(extractLayoutPositions(connectsArch)).toBeNull();
	});

	test('extractLayoutPositions returns null when decorators exist but none is the layout one', () => {
		const arch: CalmArchitecture = {
			...connectsArch,
			decorators: [
				{ 'unique-id': 'other', type: 'other', target: [], 'applies-to': [], data: {} },
			],
		};
		expect(extractLayoutPositions(arch)).toBeNull();
	});

	test('buildLayoutDecorator output round-trips through extractLayoutPositions unchanged', () => {
		const { nodes } = calmToFlow(connectsArch, new Map([['svc-1', { x: 240, y: 300 }], ['db-1', { x: 400, y: 500 }]]));
		const decorator = buildLayoutDecorator(nodes);
		const arch: CalmArchitecture = { ...connectsArch, decorators: [decorator] };

		const extracted = extractLayoutPositions(arch);
		expect(extracted).not.toBeNull();
		expect(extracted!.get('svc-1')).toEqual({ x: 240, y: 300 });
		expect(extracted!.get('db-1')).toEqual({ x: 400, y: 500 });
	});

	test('calmToFlow places nodes at extracted positions instead of staggered defaults', () => {
		const { nodes: original } = calmToFlow(connectsArch, new Map([['svc-1', { x: 240, y: 300 }], ['db-1', { x: 400, y: 500 }]]));
		const decorator = buildLayoutDecorator(original);
		const positions = extractLayoutPositions({ ...connectsArch, decorators: [decorator] })!;

		const { nodes: reopened } = calmToFlow(connectsArch, positions);
		const svc = reopened.find((n) => n.id === 'svc-1')!;
		const db = reopened.find((n) => n.id === 'db-1')!;
		// Same rendered positions as the original session — not shifted again.
		expect(svc.position).toEqual({ x: 280, y: 300 });
		expect(db.position).toEqual({ x: 440, y: 500 });
	});

	test('regression: repeated save/reopen cycles do not drift node positions', () => {
		// This is the exact bug: calmToFlow's +40 center-alignment shift was
		// being reapplied on every round trip because buildLayoutDecorator
		// used to store the already-shifted rendered position instead of
		// undoing it first. Simulates 3 consecutive save->reopen cycles and
		// asserts the rendered position is identical every time.
		let currentNodes = calmToFlow(connectsArch, new Map([['svc-1', { x: 240, y: 300 }]])).nodes;
		const firstRenderedX = currentNodes.find((n) => n.id === 'svc-1')!.position.x;

		for (let cycle = 0; cycle < 3; cycle++) {
			const decorator = buildLayoutDecorator(currentNodes);
			const positions = extractLayoutPositions({ ...connectsArch, decorators: [decorator] })!;
			currentNodes = calmToFlow(connectsArch, positions).nodes;
			const renderedX = currentNodes.find((n) => n.id === 'svc-1')!.position.x;
			expect(renderedX).toBe(firstRenderedX);
		}
	});

	test('regression: a freshly palette-placed node (no origin set yet) does not jump on its first re-projection', () => {
		// Palette-created nodes (CalmCanvas.svelte's ondrop/placeNodeAtCenter)
		// have no `origin` at all — plain top-left semantics — unlike nodes
		// that have already been through a positionMap-driven calmToFlow call
		// (origin:[0.5,0]). toRawPosition must not assume the input is
		// already shifted just because a node happens to carry origin:[0.5,0]
		// — it must always predict what calmToFlow's *next* call will do.
		const freshNode = {
			id: 'svc-1',
			type: 'service',
			position: { x: 500, y: 200 },
			data: { calmId: 'svc-1' },
			// deliberately no `origin` field
		} as unknown as Parameters<typeof toRawPosition>[0];

		const raw = toRawPosition(freshNode);
		const positions = new Map([['svc-1', raw]]);
		const { nodes } = calmToFlow(connectsArch, positions);
		const reprojected = nodes.find((n) => n.id === 'svc-1')!;

		// Must land back at the exact same spot it was already rendered at.
		expect(reprojected.position).toEqual({ x: 500, y: 200 });
	});

	test('coverage can be partial — nodes missing from the map fall back to the staggered default', () => {
		const positions = new Map([['svc-1', { x: 240, y: 300 }]]); // db-1 missing
		const { nodes } = calmToFlow(connectsArch, positions);
		const db = nodes.find((n) => n.id === 'db-1')!;
		// Matches calmToFlow's existing no-positionMap-entry fallback (idx 1 -> x=260)
		expect(db.position).toEqual({ x: 260, y: 100 });
	});
});
