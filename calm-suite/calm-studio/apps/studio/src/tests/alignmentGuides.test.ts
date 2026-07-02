// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { computeAlignmentGuides, type GuideNode } from '$lib/canvas/alignmentGuides';

function node(id: string, x: number, y: number, extra: Partial<GuideNode> = {}): GuideNode {
	return { id, position: { x, y }, width: 180, height: 70, ...extra };
}

describe('computeAlignmentGuides', () => {
	it('returns no guides when there are no other nodes', () => {
		const guides = computeAlignmentGuides(node('a', 0, 0), [node('a', 0, 0)]);
		expect(guides).toEqual([]);
	});

	it('detects left-edge alignment on the x axis', () => {
		const dragged = node('a', 100, 0);
		const sibling = node('b', 100, 500);
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'x', pos: 100 });
	});

	it('detects center alignment on the x axis', () => {
		// dragged center = 100 + 90 = 190; sibling center = 190 + 90/2... use matching widths
		const dragged = node('a', 190, 0, { width: 100 });
		const sibling = node('b', 190, 500, { width: 100 });
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		// centers: dragged = 190+50=240, sibling = 190+50=240
		expect(guides).toContainEqual({ axis: 'x', pos: 240 });
	});

	it('detects right-edge alignment on the x axis', () => {
		const dragged = node('a', 0, 0, { width: 100 }); // right edge = 100
		const sibling = node('b', 20, 500, { width: 80 }); // right edge = 100
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'x', pos: 100 });
	});

	it('detects top-edge alignment on the y axis', () => {
		const dragged = node('a', 0, 50);
		const sibling = node('b', 500, 50);
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'y', pos: 50 });
	});

	it('detects bottom-edge alignment on the y axis', () => {
		const dragged = node('a', 0, 0, { height: 70 }); // bottom = 70
		const sibling = node('b', 500, 20, { height: 50 }); // bottom = 70
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'y', pos: 70 });
	});

	it('does not report a match outside the threshold', () => {
		const dragged = node('a', 100, 0);
		const sibling = node('b', 130, 500); // 30px off, default threshold 8
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides.filter((g) => g.axis === 'x')).toEqual([]);
	});

	it('respects a custom threshold', () => {
		const dragged = node('a', 100, 0);
		const sibling = node('b', 115, 500); // 15px off
		// At threshold 8, left edges (100 vs 115) don't match, but centers do
		// (190 vs 205, also 15px off) — isolate to the left-edge guide only.
		const leftGuideAt8 = computeAlignmentGuides(dragged, [dragged, sibling], 8).filter(
			(g) => g.pos === 115
		);
		expect(leftGuideAt8).toEqual([]);

		const leftGuideAt20 = computeAlignmentGuides(dragged, [dragged, sibling], 20).filter(
			(g) => g.pos === 115
		);
		expect(leftGuideAt20).toContainEqual({ axis: 'x', pos: 115 });
	});

	it('ignores nodes with a different parent', () => {
		const dragged = node('a', 100, 0, { parentId: 'container-1' });
		const sibling = node('b', 100, 500, { parentId: 'container-2' });
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toEqual([]);
	});

	it('compares against siblings sharing the same parent', () => {
		const dragged = node('a', 100, 0, { parentId: 'container-1' });
		const sibling = node('b', 100, 500, { parentId: 'container-1' });
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'x', pos: 100 });
	});

	it('excludes the dragged node itself from comparison', () => {
		const dragged = node('a', 100, 0);
		const guides = computeAlignmentGuides(dragged, [dragged]);
		expect(guides).toEqual([]);
	});

	it('deduplicates guides at the same axis and position from multiple siblings', () => {
		const dragged = node('a', 100, 0);
		const siblingB = node('b', 100, 500);
		const siblingC = node('c', 100, 800);
		const guides = computeAlignmentGuides(dragged, [dragged, siblingB, siblingC]);
		const xGuidesAt100 = guides.filter((g) => g.axis === 'x' && g.pos === 100);
		expect(xGuidesAt100).toHaveLength(1);
	});

	it('uses measured dimensions over declared width/height when present', () => {
		const dragged = node('a', 0, 0, { width: 100, measured: { width: 50, height: 30 } });
		// right edge via measured = 0 + 50 = 50
		const sibling = node('b', 20, 500, { width: 999, measured: { width: 30, height: 30 } });
		// right edge via measured = 20 + 30 = 50
		const guides = computeAlignmentGuides(dragged, [dragged, sibling]);
		expect(guides).toContainEqual({ axis: 'x', pos: 50 });
	});
});
