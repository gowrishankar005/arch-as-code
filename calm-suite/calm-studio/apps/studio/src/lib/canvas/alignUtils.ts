// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

export type AlignDirection = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

export interface SizedItem {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

export function computeAlignPositions(
	items: SizedItem[],
	direction: AlignDirection,
): Map<string, { x: number; y: number }> {
	const result = new Map<string, { x: number; y: number }>();
	if (items.length < 2) return result;

	switch (direction) {
		case 'left': {
			const target = Math.min(...items.map((s) => s.x));
			for (const s of items) result.set(s.id, { x: target, y: s.y });
			break;
		}
		case 'center': {
			const minX = Math.min(...items.map((s) => s.x));
			const maxX = Math.max(...items.map((s) => s.x + s.w));
			const centerX = (minX + maxX) / 2;
			for (const s of items) result.set(s.id, { x: centerX - s.w / 2, y: s.y });
			break;
		}
		case 'right': {
			const maxRight = Math.max(...items.map((s) => s.x + s.w));
			for (const s of items) result.set(s.id, { x: maxRight - s.w, y: s.y });
			break;
		}
		case 'top': {
			const target = Math.min(...items.map((s) => s.y));
			for (const s of items) result.set(s.id, { x: s.x, y: target });
			break;
		}
		case 'middle': {
			const minY = Math.min(...items.map((s) => s.y));
			const maxY = Math.max(...items.map((s) => s.y + s.h));
			const centerY = (minY + maxY) / 2;
			for (const s of items) result.set(s.id, { x: s.x, y: centerY - s.h / 2 });
			break;
		}
		case 'bottom': {
			const maxBottom = Math.max(...items.map((s) => s.y + s.h));
			for (const s of items) result.set(s.id, { x: s.x, y: maxBottom - s.h });
			break;
		}
	}
	return result;
}

export function computeDistributePositions(
	items: SizedItem[],
	axis: DistributeAxis,
): Map<string, { x: number; y: number }> {
	const result = new Map<string, { x: number; y: number }>();
	if (items.length < 3) return result;

	if (axis === 'horizontal') {
		const sorted = [...items].sort((a, b) => a.x - b.x);
		const first = sorted[0];
		const last = sorted[sorted.length - 1];
		const totalSpace = (last.x + last.w) - first.x;
		const totalNodeWidth = sorted.reduce((sum, s) => sum + s.w, 0);
		const gap = (totalSpace - totalNodeWidth) / (sorted.length - 1);

		let x = first.x;
		for (const s of sorted) {
			result.set(s.id, { x, y: s.y });
			x += s.w + gap;
		}
	} else {
		const sorted = [...items].sort((a, b) => a.y - b.y);
		const first = sorted[0];
		const last = sorted[sorted.length - 1];
		const totalSpace = (last.y + last.h) - first.y;
		const totalNodeHeight = sorted.reduce((sum, s) => sum + s.h, 0);
		const gap = (totalSpace - totalNodeHeight) / (sorted.length - 1);

		let y = first.y;
		for (const s of sorted) {
			result.set(s.id, { x: s.x, y });
			y += s.h + gap;
		}
	}
	return result;
}
