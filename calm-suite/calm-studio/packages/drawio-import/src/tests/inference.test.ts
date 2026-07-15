// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest';
import { inferNodeType } from '../inference.js';
import type { MxCell } from '../types.js';

function cell(id: string, value: string, style: string): MxCell {
	return {
		id,
		value,
		style,
		vertex: true,
		edge: false,
		parent: '1',
		geometry: { x: 0, y: 0, width: 100, height: 50 },
	};
}

describe('T1 — stencil catalog matching', () => {
	test('identifies AWS4 Lambda as service (high confidence)', async () => {
		const result = await inferNodeType(
			cell('1', 'My Lambda', 'shape=mxgraph.aws4.lambda;'),
			[]
		);
		expect(result.nodeType).toBe('service');
		expect(result.confidence).toBe('high');
		expect(result.tier).toBe(1);
	});

	test('identifies AWS4 RDS as database (high confidence)', async () => {
		const result = await inferNodeType(
			cell('1', 'Main DB', 'shape=mxgraph.aws4.rds;'),
			[]
		);
		expect(result.nodeType).toBe('database');
		expect(result.confidence).toBe('high');
		expect(result.tier).toBe(1);
	});

	test('identifies AWS4 SQS as messaging:message-queue', async () => {
		const result = await inferNodeType(
			cell('1', 'Order Queue', 'shape=mxgraph.aws4.sqs;'),
			[]
		);
		expect(result.nodeType).toBe('messaging:message-queue');
		expect(result.tier).toBe(1);
	});

	test('identifies Azure SQL as database', async () => {
		const result = await inferNodeType(
			cell('1', 'Azure SQL', 'shape=mxgraph.azure.sql_database;'),
			[]
		);
		expect(result.nodeType).toBe('database');
		expect(result.tier).toBe(1);
	});

	test('identifies GCP Cloud Run as service', async () => {
		const result = await inferNodeType(
			cell('1', 'Backend', 'shape=mxgraph.gcp2.cloud_run;'),
			[]
		);
		expect(result.nodeType).toBe('service');
		expect(result.tier).toBe(1);
	});

	test('identifies Kubernetes pod as service', async () => {
		const result = await inferNodeType(
			cell('1', 'api-pod', 'shape=mxgraph.kubernetes.pod;'),
			[]
		);
		expect(result.nodeType).toBe('service');
		expect(result.tier).toBe(1);
	});

	test('identifies Cisco firewall as network', async () => {
		const result = await inferNodeType(
			cell('1', 'FW-1', 'shape=mxgraph.cisco.firewalls.fw;'),
			[]
		);
		expect(result.nodeType).toBe('network');
		expect(result.tier).toBe(1);
	});

	test('AWS user stencil → actor', async () => {
		const result = await inferNodeType(
			cell('1', 'End User', 'shape=mxgraph.aws4.user;'),
			[]
		);
		expect(result.nodeType).toBe('actor');
		expect(result.tier).toBe(1);
	});
});

describe('T2 — label glossary matching', () => {
	test('label "database" maps to database type (high)', async () => {
		const result = await inferNodeType(cell('1', 'database', ''), []);
		expect(result.nodeType).toBe('database');
		expect(result.confidence).toBe('high');
		expect(result.tier).toBe(2);
	});

	test('label matching is case-insensitive', async () => {
		const result = await inferNodeType(cell('1', 'Load Balancer', ''), []);
		expect(result.nodeType).toBe('network');
		expect(result.tier).toBe(2);
	});

	test('substring match "Production DB" hits "db" glossary entry', async () => {
		const result = await inferNodeType(cell('1', 'Production DB', ''), []);
		expect(result.nodeType).toBe('database');
		expect(result.tier).toBe(2);
	});

	test('label "kafka" maps to messaging:event-stream', async () => {
		const result = await inferNodeType(cell('1', 'Kafka', ''), []);
		expect(result.nodeType).toBe('messaging:event-stream');
	});

	test('label "okta" maps to ldap', async () => {
		const result = await inferNodeType(cell('1', 'Okta', ''), []);
		expect(result.nodeType).toBe('ldap');
	});

	test('no-match cell defaults to system with confidence none', async () => {
		const result = await inferNodeType(cell('1', 'xyzzy-unknown-shape-42', ''), []);
		expect(result.nodeType).toBe('system');
		expect(result.confidence).toBe('none');
	});

	test('"Administration Panel" matches "admin" → actor, not "ad" → ldap', async () => {
		// Regression: without longest-first sort, the 2-char "ad" term shadows "admin"
		const result = await inferNodeType(cell('1', 'Administration Panel', ''), []);
		expect(result.nodeType).toBe('actor');
		expect(result.tier).toBe(2);
	});

	test('extra glossary entries are checked before built-in ones', async () => {
		const extraGlossary = [
			{ term: 'xyzzy', 'node-type': 'webclient', confidence: 'high' as const },
		];
		const result = await inferNodeType(cell('1', 'xyzzy', ''), [], {
			extraGlossary,
		});
		expect(result.nodeType).toBe('webclient');
		expect(result.tier).toBe(2);
	});
});

describe('T3 — LLM provider', () => {
	test('LLM result is used when T1 and T2 both miss', async () => {
		const llmProvider = {
			inferNodeType: async () => ({
				nodeType: 'data-asset',
				confidence: 'medium' as const,
				tier: 3 as const,
				reason: 'LLM: context suggests data asset',
			}),
		};
		const result = await inferNodeType(
			cell('1', 'unknown-widget', ''),
			[],
			{ llmProvider }
		);
		expect(result.nodeType).toBe('data-asset');
		expect(result.tier).toBe(3);
	});

	test('T1 result wins over LLM when stencil is recognized', async () => {
		const llmProvider = {
			inferNodeType: async () => ({
				nodeType: 'actor',
				confidence: 'high' as const,
				tier: 3 as const,
				reason: 'LLM says actor',
			}),
		};
		const result = await inferNodeType(
			cell('1', 'Database', 'shape=mxgraph.aws4.rds;'),
			[],
			{ llmProvider }
		);
		// T1 (RDS → database) should win without calling LLM
		expect(result.nodeType).toBe('database');
		expect(result.tier).toBe(1);
	});
});
