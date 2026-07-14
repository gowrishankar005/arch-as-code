// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { inflateRaw } from 'pako';
import type { MxCell, MxGeometry, MxPage } from './types.js';

/**
 * Parse the text content of a .drawio / .xml file into an array of MxPages.
 *
 * Handles both uncompressed XML and legacy base64+deflate-encoded diagram
 * elements (the format draw.io uses when "Compress XML" is enabled).
 *
 * Uses only `getElementsByTagName` and `getAttribute` for DOM traversal so
 * the function works with both the browser's native DOMParser and
 * @xmldom/xmldom in Node.js environments.
 *
 * @param content - Raw file content (string).
 * @param domParser - DOMParser implementation. Required in Node.js; defaults
 *   to the global DOMParser in browser environments.
 */
export function parseDrawio(
	content: string,
	domParser: DOMParser = new DOMParser()
): MxPage[] {
	const doc = domParser.parseFromString(content, 'text/xml');

	// Detect parse errors (both browser and @xmldom/xmldom emit a parsererror element)
	const errors = doc.getElementsByTagName('parsererror');
	if (errors.length > 0) {
		const msg = errors[0]!.textContent?.trim() ?? 'unknown';
		throw new Error(`draw.io XML parse error: ${msg}`);
	}

	const root = doc.documentElement;
	if (!root) throw new Error('Empty draw.io document');

	// Bare <mxGraphModel> export (no <mxfile> wrapper)
	if (root.nodeName === 'mxGraphModel') {
		return [{ id: 'page-0', name: 'Page 1', cells: extractCells(root) }];
	}

	if (root.nodeName !== 'mxfile') {
		throw new Error(`Unexpected root element: ${root.nodeName}`);
	}

	const diagrams = directChildren(root, 'diagram');
	if (diagrams.length === 0) {
		throw new Error('No diagram pages found in draw.io file');
	}

	return diagrams.map((diagram, index) =>
		parseDiagramElement(diagram, index, domParser)
	);
}

function parseDiagramElement(
	diagram: Element,
	index: number,
	domParser: DOMParser
): MxPage {
	const id = diagram.getAttribute('id') ?? `page-${index}`;
	const name = diagram.getAttribute('name') ?? `Page ${index + 1}`;

	// The diagram content may be an inline mxGraphModel child, or a
	// base64+deflate-compressed text node (legacy "Compress XML" format).
	const inlineModels = directChildren(diagram, 'mxGraphModel');
	if (inlineModels.length > 0) {
		return { id, name, cells: extractCells(inlineModels[0]!) };
	}

	const compressed = diagram.textContent?.trim() ?? '';
	if (!compressed) return { id, name, cells: [] };

	const xml = decompressDiagram(compressed);
	const inner = domParser.parseFromString(xml, 'text/xml');
	const innerModels = inner.getElementsByTagName('mxGraphModel');
	if (innerModels.length === 0) throw new Error(`Page "${name}": could not parse decompressed model`);
	return { id, name, cells: extractCells(innerModels[0]!) };
}

/**
 * Decode and inflate a base64+deflate-compressed draw.io diagram string.
 * draw.io compresses with raw DEFLATE then base64-encodes the result; the
 * final value is also URL-encoded.
 */
function decompressDiagram(encoded: string): string {
	const base64 = atob(encoded);
	const bytes = new Uint8Array(base64.length);
	for (let i = 0; i < base64.length; i++) {
		bytes[i] = base64.charCodeAt(i);
	}
	const xml = inflateRaw(bytes, { to: 'string' });
	return decodeURIComponent(xml);
}

function extractCells(model: Element): MxCell[] {
	const cellEls = model.getElementsByTagName('mxCell');
	const cells: MxCell[] = [];

	for (const el of Array.from(cellEls)) {
		const id = el.getAttribute('id') ?? '';
		if (id === '0' || id === '1') continue; // root and default layer are structural

		const value = decodeHtmlEntities(el.getAttribute('value') ?? '');
		const style = el.getAttribute('style') ?? '';
		const vertex = el.getAttribute('vertex') === '1';
		const edge = el.getAttribute('edge') === '1';
		const parent = el.getAttribute('parent') ?? '1';

		if (!vertex && !edge) continue;

		const rawSource = el.getAttribute('source');
		const rawTarget = el.getAttribute('target');
		const geometry = extractGeometry(el);

		const cell: MxCell = { id, value, style, vertex, edge, parent, geometry };
		if (rawSource !== null) cell.source = rawSource;
		if (rawTarget !== null) cell.target = rawTarget;
		cells.push(cell);
	}

	return cells;
}

function extractGeometry(cellEl: Element): MxGeometry | null {
	// Only pick the direct child mxGeometry, not nested ones
	const geoEls = directChildren(cellEl, 'mxGeometry');
	if (geoEls.length === 0) return null;
	const geo = geoEls[0]!;
	return {
		x: parseFloat(geo.getAttribute('x') ?? '0') || 0,
		y: parseFloat(geo.getAttribute('y') ?? '0') || 0,
		width: parseFloat(geo.getAttribute('width') ?? '0') || 0,
		height: parseFloat(geo.getAttribute('height') ?? '0') || 0,
	};
}

/** Return direct Element children with the given tag name. */
function directChildren(parent: Element, tagName: string): Element[] {
	const result: Element[] = [];
	for (const node of Array.from(parent.childNodes)) {
		if (node.nodeType === 1 /* ELEMENT_NODE */ && (node as Element).nodeName === tagName) {
			result.push(node as Element);
		}
	}
	return result;
}

/** Strip common HTML entities that draw.io encodes in label values. */
function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, ''); // strip any remaining HTML tags (rich labels)
}
