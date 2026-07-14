// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '@xmldom/xmldom';
import { parseDrawio } from '../parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
	readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

// @xmldom/xmldom's DOMParser is compatible with the browser DOMParser interface
const parser = new DOMParser() as unknown as globalThis.DOMParser;

describe('parseDrawio', () => {
	test('parses uncompressed single-page file', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		expect(pages).toHaveLength(1);
		expect(pages[0]!.name).toBe('Simple');
	});

	test('extracts vertex cells correctly', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		const cells = pages[0]!.cells;
		const vertices = cells.filter((c) => c.vertex);
		expect(vertices).toHaveLength(2);
		expect(vertices.map((v) => v.value)).toEqual(['API Service', 'Main Database']);
	});

	test('extracts edge cells correctly', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		const cells = pages[0]!.cells;
		const edges = cells.filter((c) => c.edge);
		expect(edges).toHaveLength(1);
		expect(edges[0]!.value).toBe('HTTPS');
		expect(edges[0]!.source).toBe('2');
		expect(edges[0]!.target).toBe('3');
	});

	test('extracts geometry from vertices', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		const vertex = pages[0]!.cells.find((c) => c.vertex && c.value === 'API Service')!;
		expect(vertex.geometry).toEqual({ x: 100, y: 100, width: 120, height: 60 });
	});

	test('extracts style attribute', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		const lambda = pages[0]!.cells.find((c) => c.vertex && c.value === 'API Service')!;
		expect(lambda.style).toContain('shape=mxgraph.aws4.lambda');
	});

	test('skips root (id=0) and default layer (id=1) cells', () => {
		const pages = parseDrawio(fixture('simple.drawio'), parser);
		const ids = pages[0]!.cells.map((c) => c.id);
		expect(ids).not.toContain('0');
		expect(ids).not.toContain('1');
	});

	test('parses multi-page file and returns one page per diagram', () => {
		const xml = `<mxfile><diagram id="p1" name="Page 1"><mxGraphModel><root>
			<mxCell id="0"/><mxCell id="1" parent="0"/>
			<mxCell id="2" value="A" style="" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>
		</root></mxGraphModel></diagram>
		<diagram id="p2" name="Page 2"><mxGraphModel><root>
			<mxCell id="0"/><mxCell id="1" parent="0"/>
			<mxCell id="3" value="B" style="" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>
		</root></mxGraphModel></diagram></mxfile>`;

		const pages = parseDrawio(xml, parser);
		expect(pages).toHaveLength(2);
		expect(pages[0]!.name).toBe('Page 1');
		expect(pages[1]!.name).toBe('Page 2');
	});

	test('throws on malformed XML', () => {
		expect(() =>
			parseDrawio('<mxfile><diagram><unclosed>', parser)
		).toThrow();
	});

	test('handles bare mxGraphModel without mxfile wrapper', () => {
		const xml = `<mxGraphModel><root>
			<mxCell id="0"/><mxCell id="1" parent="0"/>
			<mxCell id="2" value="Node" style="" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry"/></mxCell>
		</root></mxGraphModel>`;
		const pages = parseDrawio(xml, parser);
		expect(pages).toHaveLength(1);
		expect(pages[0]!.cells).toHaveLength(1);
	});

	test('parses containment hierarchy (child vertex has non-default parent)', () => {
		const pages = parseDrawio(fixture('three-tier.drawio'), parser);
		const cells = pages[0]!.cells;
		const vpc = cells.find((c) => c.vertex && c.value === 'VPC')!;
		const childrenInsideVpc = cells.filter(
			(c) => c.vertex && c.parent === vpc.id
		);
		expect(childrenInsideVpc.length).toBeGreaterThan(0);
	});

	test('strips HTML tags from rich-label values', () => {
		const xml = `<mxfile><diagram id="d1" name="P"><mxGraphModel><root>
			<mxCell id="0"/><mxCell id="1" parent="0"/>
			<mxCell id="2" value="&lt;b&gt;Bold Label&lt;/b&gt;" style="" vertex="1" parent="1">
				<mxGeometry x="0" y="0" width="80" height="40" as="geometry"/>
			</mxCell>
		</root></mxGraphModel></diagram></mxfile>`;
		const pages = parseDrawio(xml, parser);
		expect(pages[0]!.cells[0]!.value).toBe('Bold Label');
	});
});
