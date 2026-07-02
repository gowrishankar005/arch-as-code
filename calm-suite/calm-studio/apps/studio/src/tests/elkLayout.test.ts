// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import type { CalmArchitecture } from '@calmstudio/calm-core';
import { layoutCalm } from '$lib/layout/elkLayout';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const twoNodeArch: CalmArchitecture = {
	nodes: [
		{ 'unique-id': 'svc-1', 'node-type': 'service', name: 'API' },
		{ 'unique-id': 'db-1', 'node-type': 'database', name: 'DB' },
	],
	relationships: [
		{
			'unique-id': 'rel-1',
			'relationship-type': { connects: { source: { node: 'svc-1' }, destination: { node: 'db-1' } } },
		},
	],
};

const threeNodeArch: CalmArchitecture = {
	nodes: [
		{ 'unique-id': 'a', 'node-type': 'actor', name: 'User' },
		{ 'unique-id': 'b', 'node-type': 'service', name: 'API' },
		{ 'unique-id': 'c', 'node-type': 'database', name: 'DB' },
	],
	relationships: [
		{ 'unique-id': 'r1', 'relationship-type': { connects: { source: { node: 'a' }, destination: { node: 'b' } } } },
		{ 'unique-id': 'r2', 'relationship-type': { connects: { source: { node: 'b' }, destination: { node: 'c' } } } },
	],
};

const emptyArch: CalmArchitecture = {
	nodes: [],
	relationships: [],
};

// ─── layoutCalm tests ─────────────────────────────────────────────────────────

describe('layoutCalm', () => {
	it('returns a Map with x/y positions for each node', async () => {
		const { positions } = await layoutCalm(twoNodeArch, new Set());
		expect(positions).toBeInstanceOf(Map);
		expect(positions.size).toBe(2);
		for (const [id, pos] of positions) {
			expect(typeof id).toBe('string');
			expect(typeof pos.x).toBe('number');
			expect(typeof pos.y).toBe('number');
		}
	});

	it('with empty pinnedIds includes all nodes in result', async () => {
		const { positions } = await layoutCalm(threeNodeArch, new Set());
		expect(positions.size).toBe(3);
		expect(positions.has('a')).toBe(true);
		expect(positions.has('b')).toBe(true);
		expect(positions.has('c')).toBe(true);
	});

	it('with pinned IDs excludes pinned nodes from ELK result', async () => {
		const pinnedIds = new Set(['a']);
		const { positions } = await layoutCalm(threeNodeArch, pinnedIds);
		// pinned nodes are NOT in returned map — caller handles pinned position injection
		expect(positions.has('a')).toBe(false);
		expect(positions.has('b')).toBe(true);
		expect(positions.has('c')).toBe(true);
	});

	it('with direction RIGHT produces valid positionMap', async () => {
		const { positions } = await layoutCalm(twoNodeArch, new Set(), 'RIGHT');
		expect(positions).toBeInstanceOf(Map);
		expect(positions.size).toBe(2);
		for (const pos of positions.values()) {
			expect(typeof pos.x).toBe('number');
			expect(typeof pos.y).toBe('number');
		}
	});

	it('with empty architecture returns empty positions and edgeRoutes maps', async () => {
		const result = await layoutCalm(emptyArch, new Set());
		expect(result.positions).toBeInstanceOf(Map);
		expect(result.positions.size).toBe(0);
		expect(result.edgeRoutes).toBeInstanceOf(Map);
		expect(result.edgeRoutes.size).toBe(0);
	});
});

// ─── edge route extraction tests ──────────────────────────────────────────────

describe('layoutCalm edge routes', () => {
	it('returns an edgeRoutes map with a route for the connects relationship', async () => {
		const { edgeRoutes } = await layoutCalm(twoNodeArch, new Set());
		expect(edgeRoutes.has('rel-1')).toBe(true);
		const route = edgeRoutes.get('rel-1')!;
		expect(route.points.length).toBeGreaterThanOrEqual(2);
		for (const p of route.points) {
			expect(typeof p.x).toBe('number');
			expect(typeof p.y).toBe('number');
		}
	});

	it('does not include synthetic cross-/chain- ids in the returned edge routes', async () => {
		const { edgeRoutes } = await layoutCalm(threeNodeArch, new Set());
		for (const id of edgeRoutes.keys()) {
			expect(id.startsWith('cross-')).toBe(false);
			expect(id.startsWith('chain-')).toBe(false);
		}
	});

	it('with containment, produces routes for edges nested inside a container', async () => {
		const containedArch: CalmArchitecture = {
			nodes: [
				{ 'unique-id': 'vpc', 'node-type': 'network', name: 'VPC', description: 'VPC' },
				{ 'unique-id': 'svc-a', 'node-type': 'service', name: 'SvcA', description: 'Service A' },
				{ 'unique-id': 'svc-b', 'node-type': 'service', name: 'SvcB', description: 'Service B' },
			],
			relationships: [
				{
					'unique-id': 'contains-a',
					'relationship-type': { 'deployed-in': { container: 'vpc', nodes: ['svc-a'] } },
				},
				{
					'unique-id': 'contains-b',
					'relationship-type': { 'deployed-in': { container: 'vpc', nodes: ['svc-b'] } },
				},
				{
					'unique-id': 'rel-inner',
					'relationship-type': {
						connects: { source: { node: 'svc-a' }, destination: { node: 'svc-b' } },
					},
				},
			],
		};
		const { edgeRoutes } = await layoutCalm(containedArch, new Set());
		expect(edgeRoutes.has('rel-inner')).toBe(true);
		expect(edgeRoutes.get('rel-inner')!.points.length).toBeGreaterThanOrEqual(2);
	});
});
