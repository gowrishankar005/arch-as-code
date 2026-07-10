// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * container-drag.spec.ts — E2E coverage for the container drag in/out bug:
 * contained nodes couldn't be dragged out of their container —
 * extent:'parent' hard-clamped the drag. Fixed by removing it and adding
 * symmetric "dragged out" detection to CalmCanvas.svelte's
 * handleNodeDragStop (and nudgeSelected, for arrow-key moves).
 *
 * Drag-out is checked at the CALM JSON level, not just visually/DOM —
 * calmToFlow never creates a Svelte Flow edge for deployed-in/composed-of
 * relationships, so applyFromCanvas has separate logic (calmModel.svelte.ts)
 * to keep reporting a node as contained across unrelated canvas syncs. That
 * logic originally didn't check whether the node's parentId had actually
 * been cleared, so a node dragged out looked free on screen while the
 * exported file still said it was deployed-in its old container.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openContent(page: Page, content: string, filename = 'a.calm.json'): Promise<void> {
	const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.evaluate(
		({ escaped, filename }) => {
			(window as unknown as Record<string, unknown>)['showOpenFilePicker'] = async function () {
				const blob = new Blob([escaped], { type: 'application/json' });
				const mockFile = new File([blob], filename, { type: 'application/json' });
				return [{ kind: 'file', name: filename, getFile: async () => mockFile }];
			};
		},
		{ escaped: content, filename }
	);
	await page.getByRole('button', { name: /open calm json file/i }).click();
}

async function readCalmJsonPanel(page: Page): Promise<string | null> {
	return page.evaluate(() => document.querySelector('.cm-content')?.textContent ?? null);
}

const containerArch = {
	nodes: [
		{ 'unique-id': 'container-a', 'node-type': 'system', name: 'Container A', description: '' },
		{ 'unique-id': 'child-a', 'node-type': 'service', name: 'Child A', description: '' },
	],
	relationships: [
		{
			'unique-id': 'r1',
			'relationship-type': { 'deployed-in': { container: 'container-a', nodes: ['child-a'] } },
		},
	],
};

test.describe('Container drag in/out', () => {
	test.setTimeout(90_000);

	test('dragging a contained node outside its container removes containment (JSON and visual) without a position jump', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
		await openContent(page, JSON.stringify(containerArch));
		await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 10_000 });
		await page.waitForTimeout(500);

		const child = page.locator('[data-id="child-a"]');
		const before = await child.boundingBox();
		expect(before).not.toBeNull();

		// Drag far outside the (small, default-sized) container.
		await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
		await page.mouse.down();
		await page.mouse.move(before!.x + 700, before!.y + 500, { steps: 15 });
		await page.mouse.up();
		await page.waitForTimeout(300);

		const after = await child.boundingBox();
		expect(after).not.toBeNull();
		// Actually moved this time (not clamped by extent:'parent').
		expect(after!.x - before!.x).toBeGreaterThan(400);

		// No longer nested — Svelte Flow drops the "child" parent styling.
		const classes = await child.getAttribute('class');
		expect(classes).not.toContain('child');

		// The part that was actually broken: the exported CALM model must
		// also drop the deployed-in relationship, not just look un-nested
		// on screen.
		const json = await readCalmJsonPanel(page);
		expect(json).not.toContain('deployed-in');
	});

	test('nudging a contained node outside its container with arrow keys also removes containment', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
		await openContent(page, JSON.stringify(containerArch));
		await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 10_000 });
		await page.waitForTimeout(500);

		await page.locator('[data-id="child-a"]').click();
		await page.waitForTimeout(200);
		for (let i = 0; i < 40; i++) {
			await page.keyboard.press('Shift+ArrowRight'); // 10px per press
		}
		await page.waitForTimeout(400);

		const json = await readCalmJsonPanel(page);
		expect(json).not.toContain('deployed-in');
	});

	test('dragging a top-level node into a container does not visually jump', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

		const arch = {
			nodes: [
				{ 'unique-id': 'container-a', 'node-type': 'system', name: 'Container A', description: '' },
				{ 'unique-id': 'free-node', 'node-type': 'service', name: 'Free Node', description: '' },
			],
			relationships: [],
		};
		await openContent(page, JSON.stringify(arch));
		await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 10_000 });
		await page.waitForTimeout(500);

		const container = page.locator('[data-id="container-a"]');
		const containerBox = await container.boundingBox();
		expect(containerBox).not.toBeNull();

		const freeNode = page.locator('[data-id="free-node"]');
		const freeBox = await freeNode.boundingBox();
		expect(freeBox).not.toBeNull();

		// Drag the free node to just inside the container's top-left corner.
		const targetX = containerBox!.x + 20;
		const targetY = containerBox!.y + 30;
		await page.mouse.move(freeBox!.x + freeBox!.width / 2, freeBox!.y + freeBox!.height / 2);
		await page.mouse.down();
		await page.mouse.move(targetX + freeBox!.width / 2, targetY + freeBox!.height / 2, { steps: 15 });
		await page.mouse.up();
		await page.waitForTimeout(300);

		const droppedBox = await freeNode.boundingBox();
		expect(droppedBox).not.toBeNull();
		// Landed close to the drop point — not jumped somewhere else on screen.
		expect(Math.abs(droppedBox!.x - targetX)).toBeLessThan(40);
		expect(Math.abs(droppedBox!.y - targetY)).toBeLessThan(40);
	});
});
