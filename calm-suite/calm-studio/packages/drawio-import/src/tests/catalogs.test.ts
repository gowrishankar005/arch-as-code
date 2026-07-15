// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * catalogs.test.ts — Fixture coverage for T1 stencil catalogs.
 *
 * Per the Track B design doc (02-drawio-importer-design.md §4): "every
 * catalog entry has a fixture shape → expected type." Data-driven against
 * the catalog JSON itself so newly added entries are covered automatically,
 * instead of requiring a hand-written test per shape.
 */

import { describe, test, expect } from 'vitest';
import { matchStencilCatalogs } from '../catalogs/index.js';
import aws4 from '../catalogs/aws4.json' with { type: 'json' };
import azure from '../catalogs/azure.json' with { type: 'json' };
import type { CatalogEntry } from '../types.js';

/**
 * Builds a realistic mxCell style string containing the literal shape id a
 * catalog pattern is meant to match. Every aws4/azure pattern is a plain
 * `shape=mxgraph\.<family>\.<name>` string with backslash-escaped dots and no
 * other regex metacharacters, so un-escaping reproduces exactly what draw.io
 * would emit, plus realistic surrounding style attributes.
 */
function styleFromPattern(pattern: string): string {
	const literalShape = pattern.replace(/\\(.)/g, '$1');
	return `${literalShape};fillColor=#232F3E;strokeColor=none;fontColor=#ffffff;`;
}

const CATALOGS: Record<string, CatalogEntry[]> = {
	aws4: aws4 as CatalogEntry[],
	azure: azure as CatalogEntry[],
};

describe.each(Object.entries(CATALOGS))('%s catalog — every entry matches its own fixture', (catalogName, entries) => {
	test.each(entries.map((entry) => [entry.name ?? entry.pattern, entry] as const))(
		'%s',
		(_label, entry) => {
			const style = styleFromPattern(entry.pattern);
			const match = matchStencilCatalogs(style);

			expect(match, `${catalogName} pattern "${entry.pattern}" did not match its own fixture style "${style}"`).not.toBeNull();
			expect(match!.type).toBe(entry.type);
			expect(match!.confidence).toBe(entry.confidence);
		}
	);
});

describe('catalog entry shape sanity', () => {
	test('aws4.json has no duplicate patterns', () => {
		const patterns = (aws4 as CatalogEntry[]).map((e) => e.pattern);
		expect(new Set(patterns).size).toBe(patterns.length);
	});

	test('azure.json has no duplicate patterns', () => {
		const patterns = (azure as CatalogEntry[]).map((e) => e.pattern);
		expect(new Set(patterns).size).toBe(patterns.length);
	});
});
