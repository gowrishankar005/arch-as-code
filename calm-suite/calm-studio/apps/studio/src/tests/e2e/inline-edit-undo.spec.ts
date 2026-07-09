// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * inline-edit-undo.spec.ts — E2E regression test for undo after inline edits.
 *
 * Reproduces two gaps found during the CALM Studio validation migration
 * investigation:
 *
 * 1. Node inline rename (double-click a node label) couldn't be undone.
 * 2. Edge protocol rename (double-click an edge label) couldn't be undone.
 *
 * Root cause (not a missing pushSnapshot() — that was already correct):
 * committing an inline edit unmounts the focused <input>/<select>, and the
 * rename mutation replaces the nodes/edges arrays (calmToFlow
 * re-projection), which can also tear down and rebuild the edited label's
 * own component. Either way, focus falls to <body> — an ancestor of the
 * canvas wrapper div that Cmd+Z is bound to (CalmCanvas.svelte's
 * use:shortcut), not a descendant — so the keydown never bubbles into it
 * and undo silently does nothing right after a rename.
 *
 * Fix: CalmCanvas.svelte's centralized node:rename / edge:rename-label
 * listeners refocus the (always-mounted) canvas wrapper after handling the
 * rename, deferred one macrotask so it isn't clobbered by the in-flight
 * store update.
 */

import { test, expect } from '@playwright/test';

const CALM_JSON = JSON.stringify({
	nodes: [
		{ 'unique-id': 'svc-a', 'node-type': 'service', name: 'Original Name', description: 'A' },
		{ 'unique-id': 'svc-b', 'node-type': 'service', name: 'Service B', description: 'B' },
	],
	relationships: [
		{
			'unique-id': 'a-to-b',
			'relationship-type': { connects: { source: { node: 'svc-a' }, destination: { node: 'svc-b' } } },
			protocol: 'HTTP',
		},
	],
});

async function openFixture(page: import('@playwright/test').Page): Promise<void> {
	const escaped = CALM_JSON.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.addInitScript(`
		window.showOpenFilePicker = async function() {
			var blob = new Blob([\`${escaped}\`], { type: 'application/json' });
			var mockFile = new File([blob], 'a.calm.json', { type: 'application/json' });
			return [{ kind: 'file', name: 'a.calm.json', getFile: async function() { return mockFile; } }];
		};
	`);
	await page.goto('/');
	await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: /open calm json file/i }).click();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 10_000 });
}

test.describe('Undo after inline edits', () => {
	test.setTimeout(90_000);

	test('node inline rename can be undone with Cmd+Z', async ({ page }) => {
		await openFixture(page);

		const label = page.getByText('Original Name', { exact: true });
		await expect(label).toBeVisible({ timeout: 10_000 });
		await label.dblclick();

		const input = page.locator('input.label-edit');
		await expect(input).toBeVisible();
		await input.fill('Renamed Thing');
		await input.press('Enter');

		await expect(page.getByText('Renamed Thing', { exact: true })).toBeVisible({ timeout: 5_000 });

		await page.keyboard.press('Meta+z');

		await expect(page.getByText('Original Name', { exact: true })).toBeVisible({ timeout: 5_000 });
	});

	test('edge protocol rename can be undone with Cmd+Z', async ({ page }) => {
		await openFixture(page);

		const edgeLabel = page.locator('.edge-label').first();
		await expect(edgeLabel).toBeVisible({ timeout: 10_000 });
		await expect(edgeLabel).toHaveText('HTTP');
		await edgeLabel.dblclick();

		const select = page.locator('select.edge-label-edit');
		await expect(select).toBeVisible();
		await select.selectOption('TLS');

		await expect(page.locator('.edge-label').first()).toHaveText('TLS', { timeout: 5_000 });

		await page.keyboard.press('Meta+z');

		await expect(page.locator('.edge-label').first()).toHaveText('HTTP', { timeout: 5_000 });
	});
});
