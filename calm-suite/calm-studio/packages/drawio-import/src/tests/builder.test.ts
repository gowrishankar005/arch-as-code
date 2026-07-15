// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest';
import { buildPageResult } from '../builder.js';
import type { MxPage, TypeInferenceResult } from '../types.js';
import { validateCalmArchitecture, type CalmArchitecture } from '@calmstudio/calm-core';

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

	test('node unique-id is slug-mxCellId for deterministic reimports', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const ids = architecture.nodes!.map((n) => n['unique-id']);
		expect(ids).toContain('api-service-mx2');
		expect(ids).toContain('main-database-mx3');
	});

	test('node-type comes from inference result', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const svc = architecture.nodes!.find((n) => n['unique-id'] === 'api-service-mx2')!;
		expect(svc['node-type']).toBe('service');
	});

	test('duplicate labels produce unique ids anchored to the mxCell id', () => {
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
		// slug is the same but mxCell ids differ → unique
		expect(ids).toContain('service-mx2');
		expect(ids).toContain('service-mx3');
		expect(new Set(ids).size).toBe(2);
	});

	test('output passes CALM schema validation', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const issues = validateCalmArchitecture(architecture as unknown as CalmArchitecture);
		expect(issues).toHaveLength(0);
	});

	test('architecture includes $schema field', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		expect((architecture as Record<string, unknown>)['$schema']).toBe(
			'https://calm.finos.org/release/1.2/meta/core.json'
		);
	});

	test('geometry is returned in separate map, not on nodes', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { architecture, geometry } = buildPageResult(page, inferenceMap);

		// geometry is in the map keyed by CALM id
		expect(geometry['api-service-mx2']).toEqual({ x: 100, y: 100, width: 120, height: 60 });
		expect(geometry['main-database-mx3']).toEqual({ x: 300, y: 100, width: 120, height: 60 });

		// nodes have no position fields
		const svc = architecture.nodes!.find((n) => n['unique-id'] === 'api-service-mx2')!;
		expect((svc as Record<string, unknown>)['x-position']).toBeUndefined();
		expect((svc as Record<string, unknown>)['y-position']).toBeUndefined();
	});

	test('raw mxCell style is captured in styles map, keyed by CALM id', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { styles } = buildPageResult(page, inferenceMap);
		expect(styles['api-service-mx2']).toBe('shape=mxgraph.aws4.lambda;');
		expect(styles['main-database-mx3']).toBe('shape=mxgraph.aws4.rds;');
	});

	test('nodes with empty style are omitted from the styles map', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
			],
		};
		const { styles } = buildPageResult(page, new Map([['2', makeInference('service')]]));
		expect(styles['app-mx2']).toBeUndefined();
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
		expect(rel['relationship-type'].interacts?.actor).toBe('customer-mx2');
		expect(rel['relationship-type'].interacts?.nodes).toContain('portal-mx3');
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
		expect(containment!['relationship-type']['deployed-in']?.container).toBe('vpc-mx10');
		expect(containment!['relationship-type']['deployed-in']?.nodes).toContain('web-app-mx11');
		expect(containment!['relationship-type']['deployed-in']?.nodes).toContain('api-mx12');
		expect(containment!['relationship-type']['deployed-in']?.nodes).toHaveLength(2);
	});

	test('dangling edge (missing target) produces no relationship but is reported, not dropped', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '4', value: 'calls', style: '', vertex: false, edge: true, parent: '1', source: '2', geometry: null },
			],
		};
		const inferenceMap = new Map([['2', makeInference('service')]]);
		const { architecture, danglingEdges } = buildPageResult(page, inferenceMap);
		expect(architecture.relationships).toHaveLength(0);
		expect(danglingEdges).toHaveLength(1);
		expect(danglingEdges[0]).toEqual({
			cellId: '4',
			label: 'calls',
			resolvedEndpoint: 'app-mx2',
			missingEnd: 'target',
		});
	});

	test('dangling edge with both endpoints missing reports missingEnd "both"', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '4', value: 'orphan edge', style: '', vertex: false, edge: true, parent: '1', geometry: null },
			],
		};
		const { danglingEdges } = buildPageResult(page, new Map());
		expect(danglingEdges).toHaveLength(1);
		expect(danglingEdges[0]!.missingEnd).toBe('both');
		expect(danglingEdges[0]!.resolvedEndpoint).toBeNull();
	});

	test('edge pointing at a non-vertex cell id counts as dangling', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '2', value: 'App', style: '', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 80, height: 40 } },
				{ id: '4', value: '', style: '', vertex: false, edge: true, parent: '1', source: '2', target: '999', geometry: null },
			],
		};
		const inferenceMap = new Map([['2', makeInference('service')]]);
		const { architecture, danglingEdges } = buildPageResult(page, inferenceMap);
		expect(architecture.relationships).toHaveLength(0);
		expect(danglingEdges).toHaveLength(1);
		expect(danglingEdges[0]!.missingEnd).toBe('target');
	});

	test('containment result passes CALM schema validation', () => {
		const page: MxPage = {
			id: 'p1', name: 'Test',
			cells: [
				{ id: '10', value: 'VPC', style: 'shape=mxgraph.aws4.vpc;', vertex: true, edge: false, parent: '1', geometry: { x: 0, y: 0, width: 400, height: 200 } },
				{ id: '11', value: 'Web App', style: '', vertex: true, edge: false, parent: '10', geometry: { x: 40, y: 60, width: 120, height: 60 } },
			],
		};
		const inferenceMap = new Map([
			['10', makeInference('network')],
			['11', makeInference('service')],
		]);
		const { architecture } = buildPageResult(page, inferenceMap);
		const issues = validateCalmArchitecture(architecture as unknown as CalmArchitecture);
		expect(issues).toHaveLength(0);
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

	test('confidence report calmId matches node unique-id', () => {
		const page = simplePage();
		const inferenceMap = new Map([
			['2', makeInference('service')],
			['3', makeInference('database')],
		]);
		const { confidenceReport } = buildPageResult(page, inferenceMap);
		const svcReport = confidenceReport.find((r) => r.cellId === '2')!;
		expect(svcReport.calmId).toBe('api-service-mx2');
	});
});
