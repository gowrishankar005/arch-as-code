// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest';
import { buildPageResult } from '../builder.js';
import type { MxPage, TypeInferenceResult } from '../types.js';

function makeInference(nodeType: string, confidence: TypeInferenceResult['confidence'] = 'high'): TypeInferenceResult {
	return { nodeType, confidence, tier: 1, reason: 'test' };
}

function simplePage(): MxPage {
	return {
		id: 'p1',
		name: 'Test',
		cells: [
			{
				id: '2', value: 'API Service', style: 'shape=mxgraph.aws4.lambda;',
				vertex: true, edge: false, parent: '1',
				geometry: { x: 100, y: 100, width: 120, height: 60 },
			},
			{
				id: '3', value: 'Main Database', style: 'shape=mxgraph.aws4.rds;',
				vertex: true, edge: false, parent: '1',
				geometry: { x: 300, y: 100, width: 120, height: 60 },
			},
			{
				id: '4', value: 'HTTPS', style: '',
				vertex: false, edge: true, parent: '1',
				source: '2', target: '3', geometry: null,
			},
		],
	};
}

describe('buildPageResult — nodes', () => {
	test('creates one CALM node per vertex', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		expect(architecture.nodes).toHaveLength(2);
	});

	test('node unique-id is a slug of the label', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const ids = architecture.nodes!.map((n) => n['unique-id']);
		expect(ids).toContain('api-service');
		expect(ids).toContain('main-database');
	});

	test('node-type comes from inference result', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const svc = architecture.nodes!.find((n) => n['unique-id'] === 'api-service')!;
		expect(svc['node-type']).toBe('service');
	});

	test('duplicate labels get numeric suffixes to avoid id collision', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'Service', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '3', value: 'Service', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 200, y: 0, width: 80, height: 40 } },
			],
		};
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('service')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const ids = architecture.nodes!.map((n) => n['unique-id']);
		expect(new Set(ids).size).toBe(2); // no duplicates
	});
});

describe('buildPageResult — relationships', () => {
	test('HTTPS edge label maps to HTTPS protocol on connects relationship', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const rel = architecture.relationships![0]!;
		expect(rel['relationship-type'].connects).toBeDefined();
		expect(rel.protocol).toBe('HTTPS');
	});

	test('JDBC edge label maps to JDBC protocol', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '3', value: 'DB', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 200, y: 0, width: 80, height: 40 } },
				{ id: '4', value: 'JDBC', style: '', vertex: false, edge: true, parent: '1', source: '2', target: '3', geometry: null },
			],
		};
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		expect(architecture.relationships![0]!.protocol).toBe('JDBC');
	});

	test('non-protocol edge label becomes description, not protocol', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '3', value: 'DB', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 200, y: 0, width: 80, height: 40 } },
				{ id: '4', value: 'user lookup', style: '', vertex: false, edge: true, parent: '1', source: '2', target: '3', geometry: null },
			],
		};
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const rel = architecture.relationships![0]!;
		expect(rel.protocol).toBeUndefined();
		expect(rel.description).toBe('user lookup');
	});

	test('actor → target edge becomes interacts relationship', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'Customer', style: 'shape=mxgraph.aws4.user;', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 60 } },
				{ id: '3', value: 'Portal', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 200, y: 0, width: 120, height: 60 } },
				{ id: '4', value: '', style: '', vertex: false, edge: true, parent: '1', source: '2', target: '3', geometry: null },
			],
		};
		const inferenceMap = new Map([
			['2', makeInference('actor')],
			['3', makeInference('service')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const rel = architecture.relationships![0]!;
		expect(rel['relationship-type'].interacts).toBeDefined();
		expect(rel['relationship-type'].interacts?.actor).toBe('customer');
		expect(rel['relationship-type'].interacts?.nodes).toContain('portal');
	});

	test('containment creates deployed-in relationship for children inside a container', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '10', value: 'VPC', style: 'shape=mxgraph.aws4.vpc;', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 400, height: 200 } },
				{ id: '11', value: 'Web App', style: '', vertex: true, edge: false, parent: '10', geometry: { x: 40, y: 60, width: 120, height: 60 } },
				{ id: '12', value: 'API', style: '', vertex: true, edge: false, parent: '10', geometry: { x: 220, y: 60, width: 120, height: 60 } },
			],
		};
		const inferenceMap = new Map([
			['10', makeInference('network')],
			['11', makeInference('service')],
			['12', makeInference('service')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const containment = architecture.relationships!.find((r) => r['relationship-type']['deployed-in']);
		expect(containment).toBeDefined();
		expect(containment!['relationship-type']['deployed-in']?.container).toBe('vpc');
		expect(containment!['relationship-type']['deployed-in']?.nodes).toHaveLength(2);
	});

	test('dangling edge (missing source/target) is silently skipped', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '4', value: '', style: '', vertex: false, edge: true, parent: '1', source: '2', geometry: null },
			],
		};
		const inferenceMap = new Map([['2', makeInference('service')]]);
		const { architecture } = buildPageResult(page, inferenceMap);
		expect(architecture.relationships).toHaveLength(0);
	});
});

describe('buildPageResult — confidence report', () => {
	test('low-confidence items have needsReview = true', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'Unknown Widget', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
			],
		};
		const inferenceMap = new Map([
			['2', { nodeType: 'system', confidence: 'none' as const, tier: 2 as const, reason: 'no match' }],
		]);
		const { confidenceReport } = buildPageResult(page, inferenceMap);
		expect(confidenceReport[0]!.needsReview).toBe(true);
	});

	test('high-confidence items have needsReview = false', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service', 'high')],
			['3', makeInference('database', 'high')],
		]);
		const { confidenceReport } = buildPageResult(page, inferenceMap);
		expect(confidenceReport.every((r) => !r.needsReview)).toBe(true);
	});
});
