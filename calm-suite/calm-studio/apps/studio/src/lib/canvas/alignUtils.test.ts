// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { computeAlignPositions, computeDistributePositions, type SizedItem } from './alignUtils';

function makeItems(): SizedItem[] {
	return [
		{ id: 'a', x: 100, y: 50, w: 80, h: 40 },
		{ id: 'b', x: 300, y: 200, w: 120, h: 60 },
		{ id: 'c', x: 200, y: 100, w: 100, h: 50 },
	];
}

describe('computeAlignPositions', () => {
	it('returns empty map for fewer than 2 items', () => {
		expect(computeAlignPositions([makeItems()[0]], 'left').size).toBe(0);
		expect(computeAlignPositions([], 'left').size).toBe(0);
	});

	it('aligns left to minimum x', () => {
		const result = computeAlignPositions(makeItems(), 'left');
		expect(result.get('a')!.x).toBe(100);
		expect(result.get('b')!.x).toBe(100);
		expect(result.get('c')!.x).toBe(100);
		// y values unchanged
		expect(result.get('a')!.y).toBe(50);
		expect(result.get('b')!.y).toBe(200);
	});

	it('aligns right to maximum right edge', () => {
		const items = makeItems();
		const result = computeAlignPositions(items, 'right');
		// max right edge: b at 300+120=420
		expect(result.get('a')!.x).toBe(420 - 80); // 340
		expect(result.get('b')!.x).toBe(420 - 120); // 300
		expect(result.get('c')!.x).toBe(420 - 100); // 320
	});

	it('aligns center horizontally to bounding box center', () => {
		const items = makeItems();
		const result = computeAlignPositions(items, 'center');
		// min x=100, max right=420, center=260
		expect(result.get('a')!.x).toBe(260 - 80 / 2); // 220
		expect(result.get('b')!.x).toBe(260 - 120 / 2); // 200
		expect(result.get('c')!.x).toBe(260 - 100 / 2); // 210
	});

	it('aligns top to minimum y', () => {
		const result = computeAlignPositions(makeItems(), 'top');
		expect(result.get('a')!.y).toBe(50);
		expect(result.get('b')!.y).toBe(50);
		expect(result.get('c')!.y).toBe(50);
		// x values unchanged
		expect(result.get('a')!.x).toBe(100);
		expect(result.get('b')!.x).toBe(300);
	});

	it('aligns bottom to maximum bottom edge', () => {
		const items = makeItems();
		const result = computeAlignPositions(items, 'bottom');
		// max bottom: b at 200+60=260
		expect(result.get('a')!.y).toBe(260 - 40); // 220
		expect(result.get('b')!.y).toBe(260 - 60); // 200
		expect(result.get('c')!.y).toBe(260 - 50); // 210
	});

	it('aligns middle vertically to bounding box center', () => {
		const items = makeItems();
		const result = computeAlignPositions(items, 'middle');
		// min y=50, max bottom=260, center=155
		expect(result.get('a')!.y).toBe(155 - 40 / 2); // 135
		expect(result.get('b')!.y).toBe(155 - 60 / 2); // 125
		expect(result.get('c')!.y).toBe(155 - 50 / 2); // 130
	});
});

describe('computeDistributePositions', () => {
	it('returns empty map for fewer than 3 items', () => {
		const items = makeItems().slice(0, 2);
		expect(computeDistributePositions(items, 'horizontal').size).toBe(0);
	});

	it('distributes horizontally with equal gaps', () => {
		const items: SizedItem[] = [
			{ id: 'a', x: 0, y: 0, w: 50, h: 40 },
			{ id: 'b', x: 100, y: 0, w: 50, h: 40 },
			{ id: 'c', x: 350, y: 0, w: 50, h: 40 },
		];
		const result = computeDistributePositions(items, 'horizontal');
		// totalSpace = (350+50) - 0 = 400
		// totalNodeWidth = 50+50+50 = 150
		// gap = (400-150)/2 = 125
		expect(result.get('a')!.x).toBe(0);
		expect(result.get('b')!.x).toBe(0 + 50 + 125); // 175
		expect(result.get('c')!.x).toBe(175 + 50 + 125); // 350
	});

	it('distributes vertically with equal gaps', () => {
		const items: SizedItem[] = [
			{ id: 'a', x: 0, y: 0, w: 50, h: 30 },
			{ id: 'b', x: 0, y: 50, w: 50, h: 30 },
			{ id: 'c', x: 0, y: 300, w: 50, h: 30 },
		];
		const result = computeDistributePositions(items, 'vertical');
		// totalSpace = (300+30) - 0 = 330
		// totalNodeHeight = 30+30+30 = 90
		// gap = (330-90)/2 = 120
		expect(result.get('a')!.y).toBe(0);
		expect(result.get('b')!.y).toBe(0 + 30 + 120); // 150
		expect(result.get('c')!.y).toBe(150 + 30 + 120); // 300
	});

	it('keeps first and last node positions fixed', () => {
		const items: SizedItem[] = [
			{ id: 'first', x: 10, y: 0, w: 40, h: 40 },
			{ id: 'mid', x: 50, y: 0, w: 40, h: 40 },
			{ id: 'last', x: 250, y: 0, w: 40, h: 40 },
		];
		const result = computeDistributePositions(items, 'horizontal');
		expect(result.get('first')!.x).toBe(10);
		expect(result.get('last')!.x).toBe(250);
	});

	it('preserves orthogonal positions', () => {
		const items: SizedItem[] = [
			{ id: 'a', x: 0, y: 10, w: 50, h: 40 },
			{ id: 'b', x: 100, y: 20, w: 50, h: 40 },
			{ id: 'c', x: 300, y: 30, w: 50, h: 40 },
		];
		const result = computeDistributePositions(items, 'horizontal');
		expect(result.get('a')!.y).toBe(10);
		expect(result.get('b')!.y).toBe(20);
		expect(result.get('c')!.y).toBe(30);
	});
});
